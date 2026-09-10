import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function runEvaluate(args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsx', 'src/cli/evaluate.ts', ...args],
      {
        cwd: path.resolve(process.cwd()),
        env: { ...process.env, ...env },
        shell: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('evaluate CLI', () => {
  it('exits non-zero when args missing', async () => {
    const result = await runEvaluate([]);
    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/Usage/);
  }, 30000);

  it('rejects malformed batch input', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prep-eval-'));
    const input = path.join(dir, 'bad.json');
    const output = path.join(dir, 'out.json');
    await fs.writeFile(input, JSON.stringify({ not: 'an-array' }));
    const result = await runEvaluate(['--input', input, '--output', output]);
    expect(result.code).not.toBe(0);
  }, 30000);

  it('isolates batch failures and preserves input ids', async () => {
    const repoRoot = path.resolve(process.cwd(), '../..');
    const input = path.join(repoRoot, 'fixtures/batch-mixed.json');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prep-eval-'));
    const output = path.join(dir, 'mixed-out.json');
    const result = await runEvaluate(['--input', input, '--output', output], {
      ALLOW_LOCALHOST_FETCH: 'true',
    });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(await fs.readFile(output, 'utf8')) as {
      version: string;
      generated_at: string;
      kits: Array<{ id: string; status: string; error?: { code: string } }>;
    };
    expect(parsed.version).toBe('1.0');
    expect(parsed.generated_at).toBeTruthy();
    expect(parsed.kits).toHaveLength(3);
    const byId = new Map(parsed.kits.map((k) => [k.id, k]));
    expect(byId.get('mix-ok')?.status).toBe('ok');
    expect(byId.get('mix-fail')?.status).toBe('failed');
    expect(byId.get('mix-fail')?.error?.code).toBeTruthy();
    expect(byId.get('mix-thin')?.status).toBe('ok');
  }, 300000);
});
