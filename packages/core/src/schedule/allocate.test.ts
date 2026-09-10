import { describe, expect, it } from 'vitest';
import { allocateSchedule } from '../schedule/allocate.js';
import type { KitQuestion, KitRequirement } from '../types.js';

const requirements: KitRequirement[] = [
  { id: 'r1', text: 'Node', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Leadership', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Rust', kind: 'technical', priority: 'nice' },
];

const questions: KitQuestion[] = [
  {
    id: 'q1',
    requirement_ids: ['r1'],
    category: 'technical',
    prompt: 'Node Q',
    answer_outline: '',
    difficulty: 3,
  },
  {
    id: 'q2',
    requirement_ids: ['r2'],
    category: 'behavioural',
    prompt: 'Lead Q',
    answer_outline: '',
    difficulty: 2,
  },
  {
    id: 'q3',
    requirement_ids: ['r3'],
    category: 'technical',
    prompt: 'Rust Q',
    answer_outline: '',
    difficulty: 1,
  },
  {
    id: 'q4',
    requirement_ids: ['r1'],
    category: 'system-design',
    prompt: 'Design Q',
    answer_outline: '',
    difficulty: 3,
  },
];

describe('allocateSchedule', () => {
  it('produces exact day count with integer minutes', () => {
    const schedule = allocateSchedule(questions, requirements, 5);
    expect(schedule.days_available).toBe(5);
    expect(schedule.days).toHaveLength(5);
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.day).toBeGreaterThan(0);
      expect(day.focus.length).toBeGreaterThan(0);
      for (const qid of day.question_ids) {
        expect(questions.some((q) => q.id === qid)).toBe(true);
      }
    }
  });

  it('covers must-have requirements in the schedule', () => {
    const schedule = allocateSchedule(questions, requirements, 3);
    const scheduled = new Set(schedule.days.flatMap((d) => d.question_ids));
    const coveredReqs = new Set<string>();
    for (const q of questions) {
      if (scheduled.has(q.id)) q.requirement_ids.forEach((r) => coveredReqs.add(r));
    }
    expect(coveredReqs.has('r1')).toBe(true);
    expect(coveredReqs.has('r2')).toBe(true);
  });

  it('handles 1-day schedules', () => {
    const schedule = allocateSchedule(questions, requirements, 1);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].question_ids.length).toBeGreaterThan(0);
  });

  it('handles large day counts like 60', () => {
    const schedule = allocateSchedule(questions, requirements, 60);
    expect(schedule.days).toHaveLength(60);
    expect(schedule.days_available).toBe(60);
    const allIds = schedule.days.flatMap((d) => d.question_ids);
    expect(new Set(allIds).size).toBe(questions.length);
  });

  it('prioritizes harder material earlier', () => {
    const schedule = allocateSchedule(questions, requirements, 4);
    const firstHalf = new Set(
      schedule.days.slice(0, 2).flatMap((d) => d.question_ids),
    );
    expect(firstHalf.has('q1') || firstHalf.has('q4')).toBe(true);
  });
});
