#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const { runPipeline, createLlmClient } = await import('../packages/core/dist/index.js');

const cases = [
  {
    name: 'Microsoft',
    company_url: 'https://www.microsoft.com',
    jd: 'Software Engineer Intern\nRequired:\n- Programming fundamentals\n- Collaboration skills',
    days: 5,
  },
  {
    name: 'Stripe',
    company_url: 'https://stripe.com',
    jd: 'Backend Engineer\nRequired:\n- API design\n- Distributed systems',
    days: 5,
  },
];

for (const test of cases) {
  console.log(`\n=== ${test.name} brief probe ===`);
  const started = Date.now();
  try {
    const result = await runPipeline(
      { jd: test.jd, company_url: test.company_url, days: test.days },
      { llm: createLlmClient(), allowLocalhost: false, skipInterviewSearch: true },
    );
    const brief = result.kit.company_brief;
    const summary = `${brief.summary}\n${brief.what_they_do}`;
    console.log('elapsed:', Math.round((Date.now() - started) / 1000) + 's');
    console.log('summary:', brief.summary.slice(0, 400));
    console.log('what_they_do:', brief.what_they_do.slice(0, 400));
    console.log('sources:', brief.sources.join(', '));
    console.log('warnings:', result.warnings.map((w) => w.code).join(', ') || 'none');
    const bad = /skip to main content|trace id is missing/i.test(summary);
    console.log('nav contamination:', bad ? 'YES' : 'no');
  } catch (err) {
    console.log('FAIL:', err instanceof Error ? err.message : String(err));
  }
}
