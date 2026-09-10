import { z } from 'zod';
import type { PrepKit } from '../types.js';

const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});

const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

export const prepKitSchema = z
  .object({
    source: z.object({
      company: z.string(),
      company_url: z.string(),
      role: z.string(),
      location: z.string(),
      jd_chars: z.number().int().nonnegative(),
      researched_at: z.string(),
      pages_used: z.array(z.string()),
    }),
    company_brief: z.object({
      summary: z.string(),
      what_they_do: z.string(),
      sources: z.array(z.string()),
    }),
    role: z.object({
      title: z.string(),
      seniority: z.string(),
      responsibilities: z.array(z.string()),
      requirements: z.array(requirementSchema),
    }),
    questions: z.array(questionSchema),
    flashcards: z.array(flashcardSchema),
    schedule: z.object({
      days_available: z.number().int().positive(),
      days: z.array(scheduleDaySchema),
    }),
    coverage: z.object({
      uncovered_requirement_ids: z.array(z.string()),
      passes: z.number().int().nonnegative(),
    }),
  })
  .superRefine((kit, ctx) => {
    const reqIds = new Set(kit.role.requirements.map((r) => r.id));
    const qIds = new Set(kit.questions.map((q) => q.id));

    if (kit.schedule.days.length !== kit.schedule.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `schedule.days length (${kit.schedule.days.length}) must equal days_available (${kit.schedule.days_available})`,
        path: ['schedule', 'days'],
      });
    }

    for (const q of kit.questions) {
      for (const rid of q.requirement_ids) {
        if (!reqIds.has(rid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `question ${q.id} references unknown requirement ${rid}`,
            path: ['questions'],
          });
        }
      }
    }

    for (const day of kit.schedule.days) {
      for (const qid of day.question_ids) {
        if (!qIds.has(qid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `schedule day ${day.day} references unknown question ${qid}`,
            path: ['schedule', 'days'],
          });
        }
      }
      if (!Number.isInteger(day.minutes)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `minutes must be integer on day ${day.day}`,
          path: ['schedule', 'days'],
        });
      }
    }

    for (const uid of kit.coverage.uncovered_requirement_ids) {
      if (!reqIds.has(uid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `coverage references unknown requirement ${uid}`,
          path: ['coverage', 'uncovered_requirement_ids'],
        });
      }
    }
  });

export type PrepKitValidated = z.infer<typeof prepKitSchema>;

export function validateKit(kit: unknown): {
  ok: true;
  kit: PrepKit;
} | {
  ok: false;
  errors: string[];
} {
  const result = prepKitSchema.safeParse(kit);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { ok: true, kit: result.data as PrepKit };
}

export function assertValidKit(kit: unknown): PrepKit {
  const result = validateKit(kit);
  if (!result.ok) {
    throw new Error(`Invalid kit structure: ${result.errors.join('; ')}`);
  }
  return result.kit;
}
