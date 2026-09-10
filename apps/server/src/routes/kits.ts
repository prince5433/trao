import {
  fingerprintInput,
  initialItemMeta,
  markEdited,
  markManual,
  regenerateBrief,
  regenerateCategory,
  regenerateSchedule,
  runPipeline,
  createLlmClient,
  buildWeakSpotsReport,
  orderFlashcardsForPractice,
  assertValidKit,
  type PrepKit,
  type ProgressStep,
  type QuestionCategory,
} from '@prep/core';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../auth.js';
import { config } from '../config.js';
import { Kit } from '../models.js';
import type { ProgressEvent, PipelineWarning } from '@prep/core';

function userIdOf(req: Request): string {
  return (req as unknown as AuthedRequest).userId;
}

const createSchema = z.object({
  jd: z.string().min(1).max(100_000),
  company_url: z.string().url(),
  days: z.coerce.number().int().min(1).max(90),
});

const batchSchema = z.object({
  cases: z.array(
    z.object({
      jd: z.string().min(1),
      company_url: z.string().url(),
      days: z.coerce.number().int().min(1).max(90).default(5),
      id: z.string().optional(),
    }),
  ),
});

type ProgressListener = (payload: unknown) => void;
const listeners = new Map<string, Set<ProgressListener>>();

function subscribe(kitId: string, fn: ProgressListener) {
  if (!listeners.has(kitId)) listeners.set(kitId, new Set());
  listeners.get(kitId)!.add(fn);
  return () => listeners.get(kitId)?.delete(fn);
}

function publish(kitId: string, payload: unknown) {
  for (const fn of listeners.get(kitId) ?? []) fn(payload);
}

async function runGeneration(kitId: string, userId: string) {
  const kit = await Kit.findOne({ _id: kitId, userId });
  if (!kit) return;

  kit.status = 'generating';
  kit.generationLock = true;
  kit.progress = {
    step: 'validating_jd',
    completedSteps: [],
    errors: [],
    message: 'Starting generation',
    updatedAt: new Date(),
  };
  await kit.save();
  publish(kitId, { type: 'progress', progress: kit.progress, status: kit.status });

  try {
    const result = await runPipeline(
      {
        jd: kit.jd,
        company_url: kit.companyUrl,
        days: kit.daysAvailable,
      },
      {
        allowLocalhost: config.allowLocalhostFetch || !config.isProd,
        onProgress: async (event: ProgressEvent) => {
          const completed = new Set(kit.progress?.completedSteps ?? []);
          if (event.status === 'completed' || event.status === 'skipped') {
            completed.add(event.step);
          }
          kit.progress = {
            step: event.step,
            completedSteps: [...completed],
            errors:
              event.status === 'failed'
                ? [...(kit.progress?.errors ?? []), event.message ?? 'step failed']
                : kit.progress?.errors ?? [],
            message: event.message ?? event.status,
            updatedAt: new Date(),
          };
          await Kit.updateOne({ _id: kitId, userId }, { progress: kit.progress });
          publish(kitId, { type: 'progress', progress: kit.progress, status: 'generating' });
        },
      },
    );

    const partial =
      result.warnings.some((w: PipelineWarning) =>
        ['NO_HIRING_PAGE', 'NO_ABOUT_PAGE', 'NO_INTERVIEW_DISCUSSION', 'THIN_JD'].includes(w.code),
      ) || !result.research.hiring_page_found;

    kit.content = result.kit;
    kit.itemMeta = initialItemMeta(result.kit);
    kit.warnings = result.warnings;
    kit.researchMeta = result.research;
    kit.status = partial ? 'partial' : 'ready';
    kit.generationLock = false;
    kit.progress = {
      step: 'saving_kit',
      completedSteps: [...(kit.progress?.completedSteps ?? []), 'saving_kit'],
      errors: kit.progress?.errors ?? [],
      message: 'Kit saved',
      updatedAt: new Date(),
    };
    kit.error = undefined;
    await kit.save();
    publish(kitId, { type: 'done', status: kit.status, kit: serializeKit(kit) });
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'GENERATION_FAILED';
    const message = err instanceof Error ? err.message : String(err);
    kit.status = 'failed';
    kit.generationLock = false;
    kit.error = { code, message };
    kit.progress = {
      step: kit.progress?.step ?? 'validating_jd',
      completedSteps: kit.progress?.completedSteps ?? [],
      errors: [...(kit.progress?.errors ?? []), message],
      message,
      updatedAt: new Date(),
    };
    await kit.save();
    publish(kitId, { type: 'error', error: kit.error, status: 'failed' });
  }
}

function serializeKit(kit: InstanceType<typeof Kit>) {
  return {
    id: kit._id.toString(),
    status: kit.status,
    jd: kit.jd,
    company_url: kit.companyUrl,
    days: kit.daysAvailable,
    progress: kit.progress,
    content: kit.content,
    itemMeta: kit.itemMeta,
    practice: kit.practice,
    researchMeta: kit.researchMeta,
    warnings: kit.warnings,
    error: kit.error,
    createdAt: kit.createdAt,
    updatedAt: kit.updatedAt,
  };
}

export const kitsRouter = Router();
kitsRouter.use(requireAuth);

kitsRouter.get('/', async (req, res) => {
  const userId = userIdOf(req);
  const kits = await Kit.find({ userId }).sort({ updatedAt: -1 }).select('-jd');
  res.json({
    kits: kits.map((k) => ({
      id: k._id.toString(),
      status: k.status,
      company_url: k.companyUrl,
      days: k.daysAvailable,
      role: (k.content as PrepKit | null)?.role?.title ?? '',
      company: (k.content as PrepKit | null)?.source?.company ?? '',
      updatedAt: k.updatedAt,
      createdAt: k.createdAt,
    })),
  });
});

kitsRouter.post('/', async (req, res) => {
  const userId = userIdOf(req);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
  }

  const fp = fingerprintInput(parsed.data.jd, parsed.data.company_url);
  const existing = await Kit.findOne({
    userId,
    inputFingerprint: fp,
    status: { $in: ['ready', 'partial', 'generating'] },
  }).sort({ updatedAt: -1 });

  if (existing && existing.status === 'generating') {
    return res.status(202).json({ kit: serializeKit(existing), reused: true });
  }

  if (existing && (existing.status === 'ready' || existing.status === 'partial') && req.query.force !== '1') {
    return res.status(200).json({ kit: serializeKit(existing), reused: true });
  }

  const kit = await Kit.create({
    userId,
    jd: parsed.data.jd,
    companyUrl: parsed.data.company_url,
    daysAvailable: parsed.data.days,
    inputFingerprint: fp,
    status: 'pending',
  });

  void runGeneration(kit._id.toString(), userId);
  return res.status(202).json({ kit: serializeKit(kit), reused: false });
});

kitsRouter.post('/batch', async (req, res) => {
  const userId = userIdOf(req);
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
  }
  const created = [];
  for (const c of parsed.data.cases) {
    const fp = fingerprintInput(c.jd, c.company_url);
    const kit = await Kit.create({
      userId,
      jd: c.jd,
      companyUrl: c.company_url,
      daysAvailable: c.days,
      inputFingerprint: fp,
      status: 'pending',
    });
    void runGeneration(kit._id.toString(), userId);
    created.push(serializeKit(kit));
  }
  res.status(202).json({ kits: created });
});

kitsRouter.get('/:id', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  res.json({ kit: serializeKit(kit) });
});

kitsRouter.get('/:id/events', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  send({ type: 'snapshot', kit: serializeKit(kit) });

  const unsub = subscribe(kit._id.toString(), send);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsub();
  });
});

kitsRouter.patch('/:id', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  if (!kit.content) {
    return res.status(400).json({ error: { code: 'NOT_READY', message: 'Kit has no content yet' } });
  }

  const body = req.body as {
    content?: PrepKit;
    editedIds?: string[];
    manualIds?: string[];
  };

  if (!body.content) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'content required' } });
  }

  let validated: PrepKit;
  try {
    validated = assertValidKit(body.content);
  } catch (err) {
    return res.status(400).json({
      error: { code: 'INVALID_KIT', message: err instanceof Error ? err.message : String(err) },
    });
  }

  let itemMeta = { ...(kit.itemMeta ?? {}) };
  for (const id of body.editedIds ?? []) itemMeta = markEdited(itemMeta, id);
  for (const id of body.manualIds ?? []) itemMeta = markManual(itemMeta, id);

  kit.content = validated;
  kit.itemMeta = itemMeta;
  await kit.save();
  res.json({ kit: serializeKit(kit) });
});

kitsRouter.post('/:id/regenerate', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit?.content) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  }

  const section = z
    .object({
      section: z.enum(['company_brief', 'questions', 'schedule']),
      category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).optional(),
    })
    .safeParse(req.body);

  if (!section.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: section.error.message } });
  }

  const llm = createLlmClient();
  try {
    if (section.data.section === 'schedule') {
      kit.content = regenerateSchedule(kit.content);
    } else if (section.data.section === 'company_brief') {
      const result = await regenerateBrief(
        kit.content,
        kit.itemMeta ?? {},
        llm,
        (kit.researchMeta as { pages?: unknown })?.pages
          ? []
          : (kit.content.source.pages_used || []).map((url: string) => ({
              url,
              title: '',
              text: kit.content!.company_brief.summary,
              score: 1,
              kind: 'other' as const,
            })),
      );
      kit.content = result.kit;
      kit.itemMeta = result.itemMeta;
    } else {
      const category = section.data.category;
      if (!category) {
        return res.status(400).json({
          error: { code: 'VALIDATION', message: 'category required for question regeneration' },
        });
      }
      const result = await regenerateCategory(
        kit.content,
        category as QuestionCategory,
        kit.itemMeta ?? {},
        llm,
        kit.jd,
      );
      kit.content = result.kit;
      kit.itemMeta = result.itemMeta;
    }
    await kit.save();
    res.json({ kit: serializeKit(kit) });
  } catch (err) {
    res.status(500).json({
      error: {
        code: 'REGEN_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
});

kitsRouter.get('/:id/practice', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit?.content) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  }
  const practice = (kit.practice as { cards: Record<string, unknown> }) ?? { cards: {} };
  const ordered = orderFlashcardsForPractice(kit.content.flashcards, practice as never);
  res.json({
    practice,
    orderedIds: ordered.map((f: { id: string }) => f.id),
    flashcards: kit.content.flashcards,
  });
});

kitsRouter.post('/:id/practice', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit?.content) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  }
  const parsed = z
    .object({
      flashcardId: z.string(),
      confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.error.message } });
  }
  const cards = { ...(kit.practice?.cards as Record<string, unknown>) };
  cards[parsed.data.flashcardId] = {
    confidence: parsed.data.confidence,
    covered: true,
    lastSeenAt: new Date().toISOString(),
  };
  kit.practice = { cards };
  await kit.save();
  res.json({ practice: kit.practice });
});

kitsRouter.get('/:id/weak-spots', async (req, res) => {
  const userId = userIdOf(req);
  const kit = await Kit.findOne({ _id: req.params.id, userId });
  if (!kit?.content) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
  }
  const report = buildWeakSpotsReport(
    kit.content,
    (kit.practice as { cards: Record<string, never> }) ?? { cards: {} },
  );
  res.json({ report });
});

// silence unused
void (0 as unknown as ProgressStep);
export { runGeneration, serializeKit, subscribe };
