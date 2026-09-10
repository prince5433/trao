import { describe, expect, it } from 'vitest';
import { checkCoverage } from '../coverage/check.js';
import type { KitQuestion, KitRequirement } from '../types.js';

const reqs: KitRequirement[] = [
  { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'GraphQL', kind: 'technical', priority: 'nice' },
];

describe('checkCoverage', () => {
  it('detects covered requirements', () => {
    const questions: KitQuestion[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'React?',
        answer_outline: '...',
        difficulty: 2,
      },
    ];
    const result = checkCoverage(reqs, questions);
    expect(result.covered_ids).toContain('r1');
    expect(result.uncovered_must_ids).toEqual(['r2']);
    expect(result.uncovered_requirement_ids).toEqual(['r2', 'r3']);
  });

  it('handles multiple requirements on one question', () => {
    const questions: KitQuestion[] = [
      {
        id: 'q1',
        requirement_ids: ['r1', 'r2'],
        category: 'technical',
        prompt: 'x',
        answer_outline: 'y',
        difficulty: 3,
      },
    ];
    const result = checkCoverage(reqs, questions);
    expect(result.uncovered_must_ids).toEqual([]);
    expect(result.uncovered_requirement_ids).toEqual(['r3']);
  });

  it('records invalid requirement refs without granting coverage', () => {
    const questions: KitQuestion[] = [
      {
        id: 'q1',
        requirement_ids: ['r999', 'r1'],
        category: 'technical',
        prompt: 'x',
        answer_outline: 'y',
        difficulty: 1,
      },
    ];
    const result = checkCoverage(reqs, questions);
    expect(result.invalid_requirement_refs).toContain('r999');
    expect(result.covered_ids).toContain('r1');
  });

  it('supports second-pass gap closure', () => {
    let questions: KitQuestion[] = [];
    let coverage = checkCoverage(reqs, questions);
    expect(coverage.uncovered_must_ids).toEqual(['r1', 'r2']);

    questions = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'a',
        answer_outline: 'b',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'c',
        answer_outline: 'd',
        difficulty: 2,
      },
    ];
    coverage = checkCoverage(reqs, questions);
    expect(coverage.uncovered_must_ids).toEqual([]);
  });
});
