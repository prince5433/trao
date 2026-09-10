import type { KitFlashcard, KitQuestion, KitRequirement, PrepKit } from '../types.js';

export interface PracticeCardState {
  confidence: 1 | 2 | 3 | null;
  covered: boolean;
  lastSeenAt: string | null;
}

export interface PracticeState {
  cards: Record<string, PracticeCardState>;
}

export interface WeakSpotsReport {
  weakest_requirements: Array<{ id: string; text: string; avgConfidence: number | null }>;
  weakest_categories: Array<{ category: string; avgConfidence: number | null }>;
  low_confidence_flashcards: Array<{ id: string; front: string; confidence: number | null }>;
  recommended_focus: string[];
}

export function orderFlashcardsForPractice(
  flashcards: KitFlashcard[],
  practice: PracticeState,
): KitFlashcard[] {
  return [...flashcards].sort((a, b) => {
    const ca = practice.cards[a.id]?.confidence;
    const cb = practice.cards[b.id]?.confidence;
    const sa = ca == null ? 0 : ca;
    const sb = cb == null ? 0 : cb;
    if (sa !== sb) return sa - sb; // lower confidence first; null treated as 0 (highest priority)
    const ua = practice.cards[a.id]?.covered ? 1 : 0;
    const ub = practice.cards[b.id]?.covered ? 1 : 0;
    if (ua !== ub) return ua - ub;
    return a.id.localeCompare(b.id);
  });
}

export function buildWeakSpotsReport(
  kit: PrepKit,
  practice: PracticeState,
): WeakSpotsReport {
  const reqStats = new Map<string, { sum: number; n: number; text: string }>();
  for (const r of kit.role.requirements) {
    reqStats.set(r.id, { sum: 0, n: 0, text: r.text });
  }

  const catStats = new Map<string, { sum: number; n: number }>();
  const low: WeakSpotsReport['low_confidence_flashcards'] = [];

  for (const card of kit.flashcards) {
    const st = practice.cards[card.id];
    const conf = st?.confidence ?? null;
    if (conf != null && conf <= 2) {
      low.push({ id: card.id, front: card.front, confidence: conf });
    }
    if (conf != null) {
      for (const rid of card.requirement_ids) {
        const s = reqStats.get(rid);
        if (s) {
          s.sum += conf;
          s.n += 1;
        }
      }
    }
  }

  for (const q of kit.questions) {
    // Use linked flashcard confidences if any; else skip
    const linked = kit.flashcards.filter((f) =>
      f.requirement_ids.some((r) => q.requirement_ids.includes(r)),
    );
    const confs = linked
      .map((f) => practice.cards[f.id]?.confidence)
      .filter((c): c is 1 | 2 | 3 => c != null);
    if (!confs.length) continue;
    const avg = confs.reduce((a, b) => a + b, 0) / confs.length;
    const s = catStats.get(q.category) ?? { sum: 0, n: 0 };
    s.sum += avg;
    s.n += 1;
    catStats.set(q.category, s);
  }

  const weakest_requirements = [...reqStats.entries()]
    .map(([id, s]) => ({
      id,
      text: s.text,
      avgConfidence: s.n ? s.sum / s.n : null,
    }))
    .filter((x) => x.avgConfidence != null)
    .sort((a, b) => (a.avgConfidence ?? 99) - (b.avgConfidence ?? 99))
    .slice(0, 5);

  const weakest_categories = [...catStats.entries()]
    .map(([category, s]) => ({
      category,
      avgConfidence: s.n ? s.sum / s.n : null,
    }))
    .sort((a, b) => (a.avgConfidence ?? 99) - (b.avgConfidence ?? 99));

  const recommended_focus: string[] = [];
  for (const r of weakest_requirements.slice(0, 3)) {
    recommended_focus.push(`Revisit requirement: ${r.text}`);
  }
  for (const c of weakest_categories.slice(0, 2)) {
    if ((c.avgConfidence ?? 3) <= 2) {
      recommended_focus.push(`Practice more ${c.category} questions`);
    }
  }
  if (!recommended_focus.length) {
    recommended_focus.push('Complete a practice session to unlock weak-spot insights');
  }

  return {
    weakest_requirements,
    weakest_categories,
    low_confidence_flashcards: low.sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)),
    recommended_focus,
  };
}

// silence unused type imports in some TS configs
export type _Keep = KitQuestion | KitRequirement;
