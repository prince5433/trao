import type {
  KitQuestion,
  KitRequirement,
  ScheduleDay,
} from '../types.js';

function requirementPriorityWeight(priority: KitRequirement['priority']): number {
  return priority === 'must' ? 100 : 10;
}

function questionScore(
  q: KitQuestion,
  reqById: Map<string, KitRequirement>,
): number {
  let score = q.difficulty * 10;
  let hasMust = false;
  for (const rid of q.requirement_ids) {
    const req = reqById.get(rid);
    if (req) {
      score += requirementPriorityWeight(req.priority);
      if (req.priority === 'must') hasMust = true;
    }
  }
  if (hasMust) score += 50;
  return score;
}

function minutesForQuestion(q: KitQuestion): number {
  return 20 + q.difficulty * 15;
}

function focusForDay(questions: KitQuestion[], dayIndex: number, totalDays: number): string {
  if (questions.length === 0) {
    return dayIndex === 0 ? 'Review role fundamentals' : 'Light review and rest';
  }
  const categories = [...new Set(questions.map((q) => q.category))];
  if (dayIndex === 0) return `Priority focus: ${categories[0] ?? 'core topics'}`;
  if (dayIndex === totalDays - 1) return 'Final review and weak spots';
  return `Practice: ${categories.join(', ')}`;
}

/**
 * Deterministic schedule allocation. Exactly `daysAvailable` days.
 * Harder / must-have material earlier. Integer minutes only.
 */
export function allocateSchedule(
  questions: KitQuestion[],
  requirements: KitRequirement[],
  daysAvailable: number,
): { days_available: number; days: ScheduleDay[] } {
  const n = Math.max(1, Math.floor(daysAvailable));
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const mustIds = requirements.filter((r) => r.priority === 'must').map((r) => r.id);

  const sorted = [...questions].sort((a, b) => {
    const diff = questionScore(b, reqById) - questionScore(a, reqById);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  const days: ScheduleDay[] = Array.from({ length: n }, (_, i) => ({
    day: i + 1,
    focus: '',
    question_ids: [] as string[],
    minutes: 0,
  }));

  const scheduledQuestions = new Set<string>();
  const coveredMust = new Set<string>();

  // Ensure every must-have requirement appears via at least one question early.
  for (const mustId of mustIds) {
    const candidates = sorted.filter(
      (q) => q.requirement_ids.includes(mustId) && !scheduledQuestions.has(q.id),
    );
    const pick = candidates[0] ?? sorted.find((q) => !scheduledQuestions.has(q.id));
    if (!pick) continue;
    // Prefer earliest days that still have room; day 0 for highest priority.
    const dayIndex = Math.min(
      days.findIndex((d) => d.question_ids.length < Math.ceil(sorted.length / n) + 2) >= 0
        ? days.findIndex((d) => d.question_ids.length < Math.ceil(sorted.length / n) + 2)
        : 0,
      n - 1,
    );
    const target = Math.max(0, Math.min(dayIndex, Math.floor(n * 0.4)));
    days[target].question_ids.push(pick.id);
    days[target].minutes += minutesForQuestion(pick);
    scheduledQuestions.add(pick.id);
    for (const rid of pick.requirement_ids) {
      if (mustIds.includes(rid)) coveredMust.add(rid);
    }
  }

  // Round-robin remaining questions starting from day 0 (harder already sorted first).
  let cursor = 0;
  for (const q of sorted) {
    if (scheduledQuestions.has(q.id)) continue;
    days[cursor % n].question_ids.push(q.id);
    days[cursor % n].minutes += minutesForQuestion(q);
    scheduledQuestions.add(q.id);
    cursor += 1;
  }

  // If somehow a must is still uncovered (no linked questions), put a placeholder focus note
  // by ensuring day 1 has review focus mentioning the gap — questions may be empty for thin kits.
  for (let i = 0; i < n; i++) {
    const qs = days[i].question_ids
      .map((id) => questions.find((q) => q.id === id))
      .filter((q): q is KitQuestion => Boolean(q));
    days[i].focus = focusForDay(qs, i, n);
    days[i].minutes = Math.max(0, Math.round(days[i].minutes));
    if (days[i].question_ids.length === 0) {
      days[i].minutes = i === 0 ? 45 : 30;
      if (!days[i].focus) days[i].focus = 'Review company brief and role notes';
    }
  }

  // Verify must requirements appear in schedule when linked questions exist
  const scheduledReq = new Set<string>();
  for (const d of days) {
    for (const qid of d.question_ids) {
      const q = questions.find((x) => x.id === qid);
      q?.requirement_ids.forEach((r) => scheduledReq.add(r));
    }
  }
  for (const mustId of mustIds) {
    if (scheduledReq.has(mustId)) continue;
    const linked = questions.find((q) => q.requirement_ids.includes(mustId));
    if (!linked) continue;
    if (!days[0].question_ids.includes(linked.id)) {
      days[0].question_ids.unshift(linked.id);
      days[0].minutes += minutesForQuestion(linked);
      days[0].minutes = Math.round(days[0].minutes);
    }
  }

  return { days_available: n, days };
}
