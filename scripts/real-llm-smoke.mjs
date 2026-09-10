#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const { runPipeline, assertValidKit, checkCoverage, createLlmClient } = await import(
  '../packages/core/dist/index.js'
);

const jd = `Senior Software Engineer — Backend Platform

Required:
- 6+ years backend development with TypeScript or Java
- Strong PostgreSQL and distributed systems experience
- Experience mentoring engineers and leading code reviews
- Prior work in regulated fintech or payments domain

Nice to have:
- GraphQL and Kafka experience
- AWS infrastructure knowledge

Responsibilities:
- Own on-call for core payment services
- Partner with product on roadmap planning`;

const started = Date.now();
try {
  const result = await runPipeline(
    { jd, company_url: 'https://example.com', days: 10 },
    { llm: createLlmClient(), allowLocalhost: false },
  );
  const kit = assertValidKit(result.kit);
  const cov = checkCoverage(kit.role.requirements, kit.questions);
  const must = kit.role.requirements.filter((r) => r.priority === 'must');
  console.log('REAL_LLM: PASS in', Math.round((Date.now() - started) / 1000) + 's');
  console.log(
    'requirements:',
    kit.role.requirements.length,
    '(must:',
    must.length,
    ', nice:',
    kit.role.requirements.length - must.length,
    ')',
  );
  console.log('questions:', kit.questions.length, 'flashcards:', kit.flashcards.length);
  console.log(
    'schedule days:',
    kit.schedule.days.length,
    '/ available:',
    kit.schedule.days_available,
  );
  console.log('coverage passes:', kit.coverage.passes, 'uncovered must:', cov.uncovered_must_ids.length);
  if (cov.uncovered_must_ids.length > 0) {
    console.log('WARN uncovered:', cov.uncovered_must_ids.join(','));
  }
} catch (err) {
  console.error('REAL_LLM: FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
}
