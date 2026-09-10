import { z } from 'zod';
import type { LlmClient } from '../llm/client.js';
import { UNTRUSTED_DATA_PREAMBLE, wrapUntrusted } from '../llm/client.js';
import type {
  KitFlashcard,
  KitQuestion,
  KitRequirement,
  QuestionCategory,
} from '../types.js';
import type { PageContent } from '../research/crawl.js';
import type { InterviewResearch } from '../research/interviewSearch.js';

const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        requirement_ids: z.array(z.string()).default([]),
        prompt: z.string(),
        answer_outline: z.string(),
        difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
      }),
    )
    .default([]),
});

const briefSchema = z.object({
  summary: z.string().default(''),
  what_they_do: z.string().default(''),
});

const flashSchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string(),
        back: z.string(),
        requirement_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

function reqsForCategory(requirements: KitRequirement[], category: QuestionCategory) {
  if (category === 'technical') {
    return requirements.filter((r) => r.kind === 'technical');
  }
  if (category === 'behavioural') {
    return requirements.filter((r) => r.kind === 'behavioural');
  }
  if (category === 'system-design') {
    return requirements.filter(
      (r) =>
        r.kind === 'technical' &&
        /(system|architect|distributed|scale|design|infra)/i.test(r.text),
    );
  }
  return requirements;
}

export async function generateCompanyBrief(
  llm: LlmClient,
  pages: PageContent[],
  companyName: string,
  interview: InterviewResearch,
): Promise<{ summary: string; what_they_do: string; sources: string[] }> {
  const sources = pages.map((p) => p.url);
  const corpus = pages
    .map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${p.text.slice(0, 4000)}`)
    .join('\n\n---\n\n');

  if (!pages.length) {
    return {
      summary: `Limited public information was available for ${companyName}.`,
      what_they_do: 'Could not retrieve enough company pages to describe what they do.',
      sources: [],
    };
  }

  try {
    const raw = await llm.completeJson<unknown>({
      messages: [
        {
          role: 'system',
          content: `${UNTRUSTED_DATA_PREAMBLE}
Write an honest company brief from the crawled pages only. If information is missing, say so.
Do not invent products, funding, or culture claims.
Return JSON: { "summary": string, "what_they_do": string }`,
        },
        {
          role: 'user',
          content: `${wrapUntrusted('company_pages', corpus)}
${interview.found ? wrapUntrusted('interview_snippets', JSON.stringify(interview.snippets)) : 'No public interview discussion found.'}
Company name guess: ${companyName}`,
        },
      ],
    });
    const parsed = briefSchema.parse(raw);
    return {
      summary: parsed.summary || `Overview of ${companyName} based on limited sources.`,
      what_they_do: parsed.what_they_do || 'Not enough detail on the site to describe offerings.',
      sources,
    };
  } catch {
    const snippet = pages[0]?.text.slice(0, 400) || '';
    return {
      summary: snippet
        ? `${companyName}: ${snippet}`
        : `Limited information retrieved for ${companyName}.`,
      what_they_do: snippet || 'Not enough crawled content to describe what they do.',
      sources,
    };
  }
}

export async function generateQuestionsForCategory(
  llm: LlmClient,
  category: QuestionCategory,
  requirements: KitRequirement[],
  context: {
    companyBrief: string;
    roleTitle: string;
    interviewNotes: string;
    jd: string;
  },
  startId: number,
): Promise<KitQuestion[]> {
  const relevant = reqsForCategory(requirements, category);
  const targetReqs = relevant.length ? relevant : requirements.filter((r) => r.priority === 'must').slice(0, 5);
  if (targetReqs.length === 0 && category !== 'company-fit') return [];

  const fallback = (): KitQuestion[] => {
    const base = (targetReqs.length ? targetReqs : requirements.slice(0, 3)).slice(0, 4);
    return base.map((r, i) => ({
      id: `q${startId + i}`,
      requirement_ids: [r.id],
      category,
      prompt:
        category === 'company-fit'
          ? `Why do you want to join this company as a ${context.roleTitle}?`
          : category === 'behavioural'
            ? `Tell me about a time related to: ${r.text}`
            : category === 'system-design'
              ? `Design a system that relates to: ${r.text}`
              : `Explain your experience with: ${r.text}`,
      answer_outline: `Cover motivation/experience for: ${r.text}. Use concrete examples.`,
      difficulty: (r.priority === 'must' ? 2 : 1) as 1 | 2 | 3,
    }));
  };

  try {
    const raw = await llm.completeJson<unknown>({
      messages: [
        {
          role: 'system',
          content: `${UNTRUSTED_DATA_PREAMBLE}
Generate ${category} interview questions grounded in the listed requirements.
Each question MUST include requirement_ids from the provided list when applicable.
difficulty is 1-3. Return JSON: { "questions": [{ "requirement_ids", "prompt", "answer_outline", "difficulty" }] }
Generate 3-6 questions. Do not invent requirements.`,
        },
        {
          role: 'user',
          content: `Category: ${category}
Role: ${context.roleTitle}
Company brief: ${context.companyBrief.slice(0, 1500)}
Interview notes: ${context.interviewNotes.slice(0, 1000) || 'None found'}
Requirements JSON: ${JSON.stringify(targetReqs)}
${wrapUntrusted('job_description_excerpt', context.jd.slice(0, 4000))}`,
        },
      ],
      maxTokens: 2200,
    });
    const parsed = questionsSchema.parse(raw);
    const validIds = new Set(requirements.map((r) => r.id));
    return parsed.questions.slice(0, 8).map((q, i) => ({
      id: `q${startId + i}`,
      requirement_ids: (q.requirement_ids.length
        ? q.requirement_ids.filter((id) => validIds.has(id))
        : targetReqs[0]
          ? [targetReqs[i % targetReqs.length].id]
          : []
      ),
      category,
      prompt: q.prompt,
      answer_outline: q.answer_outline,
      difficulty: q.difficulty,
    }));
  } catch {
    return fallback();
  }
}

export async function generateGapQuestions(
  llm: LlmClient,
  uncovered: KitRequirement[],
  existing: KitQuestion[],
  startId: number,
): Promise<KitQuestion[]> {
  if (!uncovered.length) return [];
  try {
    const raw = await llm.completeJson<unknown>({
      messages: [
        {
          role: 'system',
          content: `${UNTRUSTED_DATA_PREAMBLE}
Generate interview questions that specifically cover the uncovered requirements.
Pick the best category per requirement (technical|behavioural|system-design|company-fit).
Return JSON: { "questions": [{ "requirement_ids", "prompt", "answer_outline", "difficulty", "category": "technical"|"behavioural"|"system-design"|"company-fit" }] }`,
        },
        {
          role: 'user',
          content: `Uncovered requirements: ${JSON.stringify(uncovered)}
Existing question prompts (avoid duplicates): ${JSON.stringify(existing.map((q) => q.prompt).slice(0, 30))}`,
        },
      ],
    });
    const schema = z.object({
      questions: z.array(
        z.object({
          requirement_ids: z.array(z.string()),
          prompt: z.string(),
          answer_outline: z.string(),
          difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
          category: z
            .enum(['technical', 'behavioural', 'system-design', 'company-fit'])
            .default('technical'),
        }),
      ),
    });
    const parsed = schema.parse(raw);
    return parsed.questions.map((q, i) => {
      const validIds = q.requirement_ids.filter((id) => uncovered.some((u) => u.id === id));
      const fallbackId = uncovered[i % uncovered.length]?.id ?? uncovered[0]?.id;
      return {
        id: `q${startId + i}`,
        requirement_ids: validIds.length ? validIds : fallbackId ? [fallbackId] : [],
        category: q.category,
        prompt: q.prompt,
        answer_outline: q.answer_outline,
        difficulty: q.difficulty,
      };
    }).filter((q) => q.requirement_ids.length > 0);
  } catch {
    return uncovered.map((r, i) => ({
      id: `q${startId + i}`,
      requirement_ids: [r.id],
      category:
        r.kind === 'behavioural'
          ? 'behavioural'
          : /(system|architect|distributed)/i.test(r.text)
            ? 'system-design'
            : 'technical',
      prompt: `Discuss how you meet this requirement: ${r.text}`,
      answer_outline: `Explain experience, trade-offs, and evidence for: ${r.text}`,
      difficulty: 2,
    }));
  }
}

export async function generateFlashcards(
  llm: LlmClient,
  requirements: KitRequirement[],
  questions: KitQuestion[],
): Promise<KitFlashcard[]> {
  try {
    const raw = await llm.completeJson<unknown>({
      messages: [
        {
          role: 'system',
          content: `${UNTRUSTED_DATA_PREAMBLE}
Create flashcards for interview prep. Return JSON: { "flashcards": [{ "front", "back", "requirement_ids" }] }
Create 6-12 cards tied to requirements.`,
        },
        {
          role: 'user',
          content: `Requirements: ${JSON.stringify(requirements.slice(0, 20))}
Sample questions: ${JSON.stringify(questions.slice(0, 10).map((q) => q.prompt))}`,
        },
      ],
    });
    const parsed = flashSchema.parse(raw);
    const valid = new Set(requirements.map((r) => r.id));
    return parsed.flashcards.slice(0, 16).map((f, i) => ({
      id: `f${i + 1}`,
      front: f.front,
      back: f.back,
      requirement_ids: f.requirement_ids.filter((id) => valid.has(id)),
    }));
  } catch {
    return requirements.slice(0, 10).map((r, i) => ({
      id: `f${i + 1}`,
      front: r.text,
      back: `Be ready to explain experience and examples for: ${r.text}`,
      requirement_ids: [r.id],
    }));
  }
}
