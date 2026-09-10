#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const { runPipeline, createLlmClient, regenerateCategory, markEdited } = await import(
  '../packages/core/dist/index.js'
);

const jd = `Senior Backend Engineer\nRequired:\n- Node.js\n- Mentoring\nNice to have:\n- GraphQL`;

const { kit: initial } = await runPipeline(
  { jd, company_url: 'https://example.com', days: 3 },
  { llm: createLlmClient(), allowLocalhost: false },
);

let itemMeta = {};
for (const q of initial.questions) {
  itemMeta[q.id] = { origin: 'generated', pinned: false, updatedAt: '' };
}
const tech = initial.questions.find((q) => q.category === 'technical');
if (!tech) throw new Error('no technical question');
const editedPrompt = 'USER MANUAL EDIT - MUST SURVIVE REGEN';
const kit = {
  ...initial,
  questions: initial.questions.map((q) =>
    q.id === tech.id ? { ...q, prompt: editedPrompt } : q,
  ),
};
itemMeta = markEdited(itemMeta, tech.id);

const beh = initial.questions.find((q) => q.category === 'behavioural');
const behPromptBefore = beh?.prompt;

const { kit: regen, itemMeta: afterMeta } = await regenerateCategory(
  kit,
  'technical',
  itemMeta,
  createLlmClient(),
  jd,
);

const techAfter = regen.questions.find((q) => q.id === tech.id);
const behAfter = regen.questions.find((q) => q.id === beh?.id);

if (techAfter?.prompt !== editedPrompt) {
  console.error('REGEN: FAIL technical edit overwritten');
  process.exit(1);
}
if (behAfter?.prompt !== behPromptBefore) {
  console.error('REGEN: FAIL behavioural question changed during technical regen');
  process.exit(1);
}
console.log('REGEN: PASS edited technical preserved, behavioural untouched');
console.log('itemMeta origin:', afterMeta[tech.id]?.origin);
