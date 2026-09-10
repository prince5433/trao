#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  runPipeline,
  type BatchCase,
  type BatchKitResult,
  type BatchOutput,
  PipelineError,
} from '@prep/core';
import dotenv from 'dotenv';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '--output') {
      args[a.slice(2)] = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  // Prefer repo root when invoked via workspace package cwd
  const repoRootCandidates = [process.cwd(), path.resolve(process.cwd(), '../..')];
  let base = process.cwd();
  for (const candidate of repoRootCandidates) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(candidate, 'package.json'), 'utf8')) as {
        name?: string;
      };
      if (pkg.name === 'ai-interview-prep-kit') {
        base = candidate;
        break;
      }
    } catch {
      // continue
    }
  }

  const inputPath = path.isAbsolute(args.input) ? args.input : path.resolve(base, args.input);
  const outputPath = path.isAbsolute(args.output) ? args.output : path.resolve(base, args.output);

  dotenv.config({ path: path.join(base, '.env') });
  dotenv.config();

  let cases: BatchCase[];
  try {
    const raw = JSON.parse(await fs.readFile(inputPath, 'utf8')) as unknown;
    if (!Array.isArray(raw)) throw new Error('Input must be a JSON array');
    cases = raw.map((c, i) => {
      const item = c as Partial<BatchCase>;
      if (!item.id || typeof item.jd !== 'string' || typeof item.company_url !== 'string') {
        throw new Error(`Malformed case at index ${i}`);
      }
      return {
        id: String(item.id),
        jd: item.jd,
        company_url: item.company_url,
        days: Number(item.days ?? 5),
      };
    });
  } catch (err) {
    console.error('Failed to read input:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Batch evaluation often uses localhost company fixtures.
  if (process.env.ALLOW_LOCALHOST_FETCH == null) {
    process.env.ALLOW_LOCALHOST_FETCH = 'true';
  }

  const results: BatchKitResult[] = [];

  for (const c of cases) {
    try {
      const result = await runPipeline(
        { jd: c.jd, company_url: c.company_url, days: c.days, caseId: c.id },
        { allowLocalhost: true },
      );
      results.push({
        id: c.id,
        status: 'ok',
        kit: result.kit,
        error: null,
      });
      console.error(`[ok] ${c.id}`);
    } catch (err: unknown) {
      const code =
        err instanceof PipelineError
          ? err.code
          : typeof err === 'object' && err && 'code' in err && typeof (err as { code: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'GENERATION_FAILED';
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        id: c.id,
        status: 'failed',
        kit: null,
        error: { code, message },
      });
      console.error(`[failed] ${c.id}: ${code} ${message}`);
    }
  }

  const output: BatchOutput = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.error(`Wrote ${results.length} results to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
