import { z } from 'zod';
import type { LlmClient } from '../llm/client.js';
import { UNTRUSTED_DATA_PREAMBLE, wrapUntrusted } from '../llm/client.js';
import type { KitRequirement, RequirementKind, RequirementPriority } from '../types.js';

const extractionSchema = z.object({
  title: z.string().default(''),
  seniority: z.string().default(''),
  location: z.string().optional().default(''),
  responsibilities: z.array(z.string()).default([]),
  requirements: z
    .array(
      z.object({
        text: z.string(),
        kind: z.enum(['technical', 'behavioural', 'domain']),
        priority: z.enum(['must', 'nice']),
      }),
    )
    .default([]),
});

const MUST_HINTS =
  /\b(required|must have|must-have|you need|minimum|mandatory|essential|necessary|you will)\b/i;
const NICE_HINTS =
  /\b(nice to have|nice-to-have|bonus|preferred|plus|optional|advantage|good to have)\b/i;

export function inferPriorityFromText(text: string, sectionHint?: string): RequirementPriority {
  const hay = `${sectionHint ?? ''} ${text}`;
  if (NICE_HINTS.test(hay)) return 'nice';
  if (MUST_HINTS.test(hay)) return 'must';
  if (sectionHint && /nice|preferred|bonus|plus/i.test(sectionHint)) return 'nice';
  if (sectionHint && /require|must|qualification|minimum/i.test(sectionHint)) return 'must';
  return 'must';
}

export function heuristicExtract(jd: string): {
  title: string;
  seniority: string;
  location: string;
  responsibilities: string[];
  requirements: Array<{ text: string; kind: RequirementKind; priority: RequirementPriority }>;
  thin: boolean;
} {
  const lines = jd
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const thin = lines.length <= 3 && jd.trim().length < 280;

  const title = lines[0]?.slice(0, 120) || 'Role';
  let seniority = '';
  if (/senior|staff|principal/i.test(jd)) seniority = 'senior';
  else if (/junior|entry/i.test(jd)) seniority = 'junior';
  else if (/mid|intermediate/i.test(jd)) seniority = 'mid';
  else seniority = 'unspecified';

  const locationMatch = jd.match(/\b(remote|hybrid|on[\s-]?site|[A-Z][a-z]+(?:,\s*[A-Z]{2})?)\b/);
  const location = locationMatch?.[0] ?? '';

  const bulletLines = lines.filter((l) => /^[-*•]/.test(l) || /^\d+\./.test(l));
  const reqs: Array<{ text: string; kind: RequirementKind; priority: RequirementPriority }> = [];
  const responsibilities: string[] = [];

  let section: 'requirements' | 'nice' | 'responsibilities' = 'requirements';
  for (const line of lines) {
    if (/nice to have|preferred|bonus|plus\b/i.test(line) && line.length < 80) {
      section = 'nice';
      continue;
    }
    if (
      /^(requirements?|qualifications?|must[- ]haves?|what you.?ll need|you (must|need))\b/i.test(
        line,
      ) &&
      line.length < 80
    ) {
      section = 'requirements';
      continue;
    }
    if (/^(responsibilities|what you.?ll do|you will)\b/i.test(line) && line.length < 80) {
      section = 'responsibilities';
      continue;
    }

    const isBullet = /^[-*•]/.test(line) || /^\d+\./.test(line);
    if (!isBullet && bulletLines.length > 0) continue;

    const text = line.replace(/^[-*•\d.]+\s*/, '').trim();
    if (text.length < 3) continue;

    if (section === 'responsibilities') {
      responsibilities.push(text);
      continue;
    }

    const priority =
      section === 'nice' ? 'nice' : inferPriorityFromText(text, section);
    let kind: RequirementKind = 'technical';
    if (/(mentor|lead|communicat|collaborat|stakeholder|team)/i.test(text)) kind = 'behavioural';
    else if (/(domain|fintech|healthcare|industry|regulated)/i.test(text)) kind = 'domain';
    reqs.push({ text, kind, priority });
  }

  if (reqs.length === 0 && !thin) {
    reqs.push({
      text: title,
      kind: 'technical',
      priority: 'must',
    });
  }

  if (responsibilities.length === 0) {
    const fallback = (bulletLines.length ? bulletLines : lines.slice(1))
      .filter((l) => /build|design|own|lead|develop|ship/i.test(l))
      .slice(0, 8)
      .map((l) => l.replace(/^[-*•\d.]+\s*/, ''));
    responsibilities.push(...fallback);
  }

  return {
    title,
    seniority,
    location,
    responsibilities: responsibilities.slice(0, 12),
    requirements: reqs.slice(0, 30),
    thin,
  };
}

export async function extractRequirements(
  llm: LlmClient,
  jd: string,
): Promise<{
  title: string;
  seniority: string;
  location: string;
  responsibilities: string[];
  requirements: KitRequirement[];
  thin: boolean;
}> {
  const heuristic = heuristicExtract(jd);

  if (heuristic.thin) {
    const requirements: KitRequirement[] = heuristic.requirements.map((r, i) => ({
      id: `r${i + 1}`,
      ...r,
    }));
    if (requirements.length === 0) {
      requirements.push({
        id: 'r1',
        text: heuristic.title || 'General role fit from a thin job description',
        kind: 'technical',
        priority: 'must',
      });
    }
    return { ...heuristic, requirements, thin: true };
  }

  try {
    const raw = await llm.completeJson<unknown>({
      messages: [
        {
          role: 'system',
          content: `${UNTRUSTED_DATA_PREAMBLE}

Extract role details from the job description. Do NOT invent requirements that are not present.
Mark priority "must" vs "nice" from how the posting phrases them (Required/Must have vs Nice to have/Bonus/Preferred).
kind must be technical | behavioural | domain.
Return JSON: { "title", "seniority", "location", "responsibilities": string[], "requirements": [{ "text", "kind", "priority" }] }`,
        },
        {
          role: 'user',
          content: wrapUntrusted('job_description', jd),
        },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    });

    const parsed = extractionSchema.parse(raw);
    // Re-assert priority from phrasing when model is unsure
    const requirements: KitRequirement[] = parsed.requirements
      .filter((r) => r.text.trim().length > 0)
      .slice(0, 30)
      .map((r, i) => {
        const phrasing = inferPriorityFromText(r.text);
        // Prefer explicit phrasing signals; otherwise trust model when no cue either way
        const priority =
          NICE_HINTS.test(r.text) || MUST_HINTS.test(r.text) ? phrasing : r.priority;
        return {
          id: `r${i + 1}`,
          text: r.text.trim(),
          kind: r.kind,
          priority,
        };
      });

    // Prefer model requirements but fall back if empty
    if (requirements.length === 0) {
      return {
        title: parsed.title || heuristic.title,
        seniority: parsed.seniority || heuristic.seniority,
        location: parsed.location || heuristic.location,
        responsibilities: parsed.responsibilities.length
          ? parsed.responsibilities
          : heuristic.responsibilities,
        requirements: heuristic.requirements.map((r, i) => ({ id: `r${i + 1}`, ...r })),
        thin: false,
      };
    }

    return {
      title: parsed.title || heuristic.title,
      seniority: parsed.seniority || heuristic.seniority,
      location: parsed.location || heuristic.location,
      responsibilities: parsed.responsibilities,
      requirements,
      thin: false,
    };
  } catch {
    return {
      ...heuristic,
      requirements: heuristic.requirements.map((r, i) => ({ id: `r${i + 1}`, ...r })),
    };
  }
}
