import { describe, expect, it } from 'vitest';
import { checkCoverage } from '../coverage/check.js';
import { sanitizeKitReferences } from './sanitize.js';
import { validateKit } from './schema.js';

describe('sanitizeKitReferences', () => {
  it('removes invalid requirement ids from questions before validation', () => {
    const kit = sanitizeKitReferences({
      source: {
        company: 'X',
        company_url: 'https://x.com',
        role: 'Eng',
        location: '',
        jd_chars: 10,
        researched_at: new Date().toISOString(),
        pages_used: [],
      },
      company_brief: { summary: 's', what_they_do: 'w', sources: [] },
      role: {
        title: 'Eng',
        seniority: 'mid',
        responsibilities: [],
        requirements: [{ id: 'r1', text: 'Go', kind: 'technical', priority: 'must' }],
      },
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r999', 'r1'],
          category: 'technical',
          prompt: 'Q',
          answer_outline: 'A',
          difficulty: 2,
        },
      ],
      flashcards: [{ id: 'f1', front: 'F', back: 'B', requirement_ids: ['r9'] }],
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: 'All', question_ids: ['q1'], minutes: 60 }],
      },
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    });
    expect(kit.questions[0].requirement_ids).toEqual(['r1']);
    expect(kit.flashcards[0].requirement_ids).toEqual([]);
    expect(validateKit(kit).ok).toBe(true);
  });

  it('does not falsely mark must-haves covered when only invalid refs are stripped', () => {
    const requirements = [
      { id: 'r1', text: 'Go', kind: 'technical' as const, priority: 'must' as const },
      { id: 'r2', text: 'Mentoring', kind: 'behavioural' as const, priority: 'must' as const },
    ];
    const questions = [
      {
        id: 'q1',
        requirement_ids: ['r999'],
        category: 'technical' as const,
        prompt: 'Bad ref only',
        answer_outline: 'A',
        difficulty: 2 as const,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural' as const,
        prompt: 'Good',
        answer_outline: 'B',
        difficulty: 2 as const,
      },
    ];
    const sanitized = sanitizeKitReferences({
      source: {
        company: 'X',
        company_url: 'https://x.com',
        role: 'Eng',
        location: '',
        jd_chars: 10,
        researched_at: new Date().toISOString(),
        pages_used: [],
      },
      company_brief: { summary: 's', what_they_do: 'w', sources: [] },
      role: { title: 'Eng', seniority: 'mid', responsibilities: [], requirements },
      questions,
      flashcards: [],
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: 'All', question_ids: ['q1', 'q2'], minutes: 60 }],
      },
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    });
    const coverage = checkCoverage(sanitized.role.requirements, sanitized.questions);
    expect(sanitized.questions[0].requirement_ids).toEqual([]);
    expect(coverage.uncovered_must_ids).toContain('r1');
    expect(coverage.uncovered_must_ids).not.toContain('r2');
  });
});
