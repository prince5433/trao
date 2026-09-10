import type { KitQuestion, KitRequirement } from '../types.js';

export interface CoverageResult {
  uncovered_requirement_ids: string[];
  uncovered_must_ids: string[];
  invalid_requirement_refs: string[];
  covered_ids: string[];
}

/**
 * Deterministic coverage check: never ask the LLM whether requirements are covered.
 */
export function checkCoverage(
  requirements: KitRequirement[],
  questions: KitQuestion[],
): CoverageResult {
  const reqIds = new Set(requirements.map((r) => r.id));
  const covered = new Set<string>();
  const invalidRefs = new Set<string>();

  for (const q of questions) {
    for (const rid of q.requirement_ids) {
      if (!reqIds.has(rid)) {
        invalidRefs.add(rid);
        continue;
      }
      covered.add(rid);
    }
  }

  const uncovered = requirements
    .filter((r) => !covered.has(r.id))
    .map((r) => r.id);

  const uncoveredMust = requirements
    .filter((r) => r.priority === 'must' && !covered.has(r.id))
    .map((r) => r.id);

  return {
    uncovered_requirement_ids: uncovered,
    uncovered_must_ids: uncoveredMust,
    invalid_requirement_refs: [...invalidRefs],
    covered_ids: [...covered],
  };
}
