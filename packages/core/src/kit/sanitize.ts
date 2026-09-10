import type { KitFlashcard, KitQuestion, PrepKit } from '../types.js';

/** Strip invalid requirement references before validation. */
export function sanitizeKitReferences(kit: PrepKit): PrepKit {
  const reqIds = new Set(kit.role.requirements.map((r) => r.id));
  const questions: KitQuestion[] = kit.questions.map((q) => ({
    ...q,
    requirement_ids: q.requirement_ids.filter((id) => reqIds.has(id)),
  }));
  const flashcards: KitFlashcard[] = kit.flashcards.map((f) => ({
    ...f,
    requirement_ids: f.requirement_ids.filter((id) => reqIds.has(id)),
  }));
  return { ...kit, questions, flashcards };
}
