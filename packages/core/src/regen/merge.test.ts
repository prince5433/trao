import { describe, expect, it } from 'vitest';
import { mergeCategoryQuestions, shouldPreserveItem } from '../regen/merge.js';
import type { ItemMeta, KitQuestion } from '../types.js';

describe('regeneration merge', () => {
  it('preserves edited questions when regenerating a category', () => {
    const existing: KitQuestion[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'generated 1',
        answer_outline: 'a',
        difficulty: 1,
      },
      {
        id: 'q2',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'USER EDITED',
        answer_outline: 'mine',
        difficulty: 2,
      },
      {
        id: 'q3',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'keep me',
        answer_outline: 'b',
        difficulty: 2,
      },
    ];
    const meta: Record<string, ItemMeta> = {
      q1: { origin: 'generated', pinned: false, updatedAt: '' },
      q2: { origin: 'edited', pinned: false, updatedAt: '' },
      q3: { origin: 'generated', pinned: false, updatedAt: '' },
    };
    const generated: KitQuestion[] = [
      {
        id: 'q99',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'new gen',
        answer_outline: 'n',
        difficulty: 2,
      },
    ];
    const result = mergeCategoryQuestions(existing, generated, 'technical', meta);
    expect(result.questions.find((q) => q.id === 'q2')?.prompt).toBe('USER EDITED');
    expect(result.questions.find((q) => q.id === 'q3')?.prompt).toBe('keep me');
    expect(result.questions.some((q) => q.prompt === 'generated 1')).toBe(false);
    expect(result.questions.some((q) => q.prompt === 'new gen')).toBe(true);
  });

  it('preserves edited questions in other categories during technical regen', () => {
    const existing = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical' as const,
        prompt: 'old tech',
        answer_outline: 'a',
        difficulty: 1 as const,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural' as const,
        prompt: 'BEHAVIOURAL EDIT',
        answer_outline: 'b',
        difficulty: 2 as const,
      },
    ];
    const merged = mergeCategoryQuestions(
      existing,
      [
        {
          id: 'qx',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'new tech',
          answer_outline: 'n',
          difficulty: 2,
        },
      ],
      'technical',
      {
        q1: { origin: 'generated', pinned: false, updatedAt: '' },
        q2: { origin: 'edited', pinned: false, updatedAt: '' },
      },
    );
    expect(merged.questions.find((q) => q.id === 'q2')?.prompt).toBe('BEHAVIOURAL EDIT');
    expect(merged.questions.some((q) => q.prompt === 'new tech')).toBe(true);
  });

  it('shouldPreserveItem respects pinned and manual', () => {
    expect(shouldPreserveItem({ origin: 'generated', pinned: true, updatedAt: '' })).toBe(true);
    expect(shouldPreserveItem({ origin: 'manual', pinned: false, updatedAt: '' })).toBe(true);
    expect(shouldPreserveItem({ origin: 'generated', pinned: false, updatedAt: '' })).toBe(false);
  });
});
