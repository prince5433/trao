import { describe, expect, it } from 'vitest';
import { validateKit } from '../kit/schema.js';
import type { PrepKit } from '../types.js';

function validKit(): PrepKit {
  return {
    source: {
      company: 'Acme',
      company_url: 'https://acme.example',
      role: 'Engineer',
      location: 'Remote',
      jd_chars: 100,
      researched_at: new Date().toISOString(),
      pages_used: ['https://acme.example'],
    },
    company_brief: {
      summary: 'Acme builds tools',
      what_they_do: 'Developer productivity',
      sources: ['https://acme.example'],
    },
    role: {
      title: 'Engineer',
      seniority: 'senior',
      responsibilities: ['Build APIs'],
      requirements: [
        { id: 'r1', text: 'TypeScript', kind: 'technical', priority: 'must' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'TS question',
        answer_outline: 'Explain types',
        difficulty: 2,
      },
    ],
    flashcards: [
      { id: 'f1', front: 'TS', back: 'Typed JS', requirement_ids: ['r1'] },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Core', question_ids: ['q1'], minutes: 60 },
        { day: 2, focus: 'Review', question_ids: [], minutes: 30 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe('validateKit', () => {
  it('accepts a valid kit', () => {
    const result = validateKit(validKit());
    expect(result.ok).toBe(true);
  });

  it('rejects missing fields', () => {
    const kit = validKit() as unknown as Record<string, unknown>;
    delete kit.company_brief;
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid difficulty', () => {
    const kit = validKit();
    (kit.questions[0] as { difficulty: number }).difficulty = 5;
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid category', () => {
    const kit = validKit();
    (kit.questions[0] as { category: string }).category = 'trivia';
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid requirement id references', () => {
    const kit = validKit();
    kit.questions[0].requirement_ids = ['r9'];
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid schedule question ids', () => {
    const kit = validKit();
    kit.schedule.days[0].question_ids = ['q999'];
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });

  it('rejects day count mismatch', () => {
    const kit = validKit();
    kit.schedule.days_available = 5;
    const result = validateKit(kit);
    expect(result.ok).toBe(false);
  });
});
