import type { ItemMeta, KitQuestion, PrepKit, QuestionCategory } from '../types.js';
import { checkCoverage } from '../coverage/check.js';
import { allocateSchedule } from '../schedule/allocate.js';
import { assertValidKit } from '../kit/schema.js';
import type { LlmClient } from '../llm/client.js';
import {
  generateCompanyBrief,
  generateGapQuestions,
  generateQuestionsForCategory,
} from '../generate/content.js';
import type { PageContent } from '../research/crawl.js';

export function shouldPreserveItem(meta: ItemMeta | undefined): boolean {
  if (!meta) return false;
  if (meta.pinned) return true;
  return meta.origin === 'edited' || meta.origin === 'manual';
}

export function mergeCategoryQuestions(
  existing: KitQuestion[],
  generated: KitQuestion[],
  category: QuestionCategory,
  itemMeta: Record<string, ItemMeta>,
): { questions: KitQuestion[]; itemMeta: Record<string, ItemMeta> } {
  const preserved = existing.filter(
    (q) => q.category === category && shouldPreserveItem(itemMeta[q.id]),
  );
  const other = existing.filter((q) => q.category !== category);
  const preservedIds = new Set(preserved.map((q) => q.id));

  // Drop old generated questions in this category
  const nextMeta = { ...itemMeta };
  for (const q of existing) {
    if (q.category === category && !preservedIds.has(q.id)) {
      delete nextMeta[q.id];
    }
  }

  let maxNum = 0;
  for (const q of [...other, ...preserved, ...generated]) {
    const m = /^q(\d+)$/.exec(q.id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  }

  const fresh: KitQuestion[] = [];
  for (const g of generated) {
    maxNum += 1;
    const id = `q${maxNum}`;
    fresh.push({ ...g, id });
    nextMeta[id] = {
      origin: 'generated',
      pinned: false,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    questions: [...other, ...preserved, ...fresh],
    itemMeta: nextMeta,
  };
}

export async function regenerateCategory(
  kit: PrepKit,
  category: QuestionCategory,
  itemMeta: Record<string, ItemMeta>,
  llm: LlmClient,
  jd: string,
): Promise<{ kit: PrepKit; itemMeta: Record<string, ItemMeta> }> {
  const generated = await generateQuestionsForCategory(
    llm,
    category,
    kit.role.requirements,
    {
      companyBrief: `${kit.company_brief.summary}\n${kit.company_brief.what_they_do}`,
      roleTitle: kit.role.title,
      interviewNotes: '',
      jd,
    },
    1,
  );
  const merged = mergeCategoryQuestions(kit.questions, generated, category, itemMeta);

  let questions = merged.questions;
  let coverage = checkCoverage(kit.role.requirements, questions);
  let passes = kit.coverage.passes;
  if (coverage.uncovered_must_ids.length) {
    const gaps = await generateGapQuestions(
      llm,
      kit.role.requirements.filter((r) => coverage.uncovered_must_ids.includes(r.id)),
      questions,
      questions.length + 1,
    );
    const withGaps = mergeCategoryQuestions(
      questions,
      gaps,
      category,
      merged.itemMeta,
    );
    // gap questions may be other categories — append preserving meta
    const existingIds = new Set(questions.map((q) => q.id));
    for (const g of gaps) {
      if (existingIds.has(g.id)) continue;
      questions.push(g);
      merged.itemMeta[g.id] = {
        origin: 'generated',
        pinned: false,
        updatedAt: new Date().toISOString(),
      };
    }
    questions = [...questions];
    coverage = checkCoverage(kit.role.requirements, questions);
    passes += 1;
  }

  const schedule = allocateSchedule(
    questions,
    kit.role.requirements,
    kit.schedule.days_available,
  );

  const next = assertValidKit({
    ...kit,
    questions,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered_must_ids,
      passes,
    },
  });

  return { kit: next, itemMeta: merged.itemMeta };
}

export async function regenerateBrief(
  kit: PrepKit,
  itemMeta: Record<string, ItemMeta>,
  llm: LlmClient,
  pages: PageContent[],
): Promise<{ kit: PrepKit; itemMeta: Record<string, ItemMeta> }> {
  if (shouldPreserveItem(itemMeta.company_brief)) {
    return { kit, itemMeta };
  }
  const brief = await generateCompanyBrief(
    llm,
    pages,
    kit.source.company,
    { found: false, snippets: [], warnings: [] },
  );
  const next = assertValidKit({
    ...kit,
    company_brief: brief,
  });
  return {
    kit: next,
    itemMeta: {
      ...itemMeta,
      company_brief: {
        origin: 'generated',
        pinned: false,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function regenerateSchedule(kit: PrepKit): PrepKit {
  const schedule = allocateSchedule(
    kit.questions,
    kit.role.requirements,
    kit.schedule.days_available,
  );
  return assertValidKit({ ...kit, schedule });
}

export function markEdited(
  itemMeta: Record<string, ItemMeta>,
  id: string,
): Record<string, ItemMeta> {
  return {
    ...itemMeta,
    [id]: {
      origin: 'edited',
      pinned: itemMeta[id]?.pinned ?? false,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function markManual(
  itemMeta: Record<string, ItemMeta>,
  id: string,
): Record<string, ItemMeta> {
  return {
    ...itemMeta,
    [id]: {
      origin: 'manual',
      pinned: true,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function initialItemMeta(kit: PrepKit): Record<string, ItemMeta> {
  const now = new Date().toISOString();
  const meta: Record<string, ItemMeta> = {
    company_brief: { origin: 'generated', pinned: false, updatedAt: now },
  };
  for (const q of kit.questions) {
    meta[q.id] = { origin: 'generated', pinned: false, updatedAt: now };
  }
  for (const f of kit.flashcards) {
    meta[f.id] = { origin: 'generated', pinned: false, updatedAt: now };
  }
  return meta;
}
