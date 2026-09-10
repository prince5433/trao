import { createHash } from 'node:crypto';
import { checkCoverage } from '../coverage/check.js';
import { extractRequirements } from '../extract/requirements.js';
import { assertSafeUrl } from '../fetch/safeFetch.js';
import {
  generateCompanyBrief,
  generateFlashcards,
  generateGapQuestions,
  generateQuestionsForCategory,
} from '../generate/content.js';
import { createLlmClient, type LlmClient } from '../llm/client.js';
import { assertValidKit } from '../kit/schema.js';
import { sanitizeKitReferences } from '../kit/sanitize.js';
import { crawlCompanySite } from '../research/crawl.js';
import { searchInterviewDiscussion } from '../research/interviewSearch.js';
import { allocateSchedule } from '../schedule/allocate.js';
import type {
  PipelineInput,
  PipelineResult,
  PipelineWarning,
  ProgressEvent,
  ProgressStep,
  QuestionCategory,
} from '../types.js';
import { PipelineError } from '../types.js';

export type ProgressHandler = (event: ProgressEvent) => void | Promise<void>;

export interface RunPipelineOptions {
  llm?: LlmClient;
  onProgress?: ProgressHandler;
  allowLocalhost?: boolean;
  maxCoveragePasses?: number;
  skipInterviewSearch?: boolean;
}

async function emit(
  onProgress: ProgressHandler | undefined,
  step: ProgressStep,
  status: ProgressEvent['status'],
  message?: string,
  detail?: Record<string, unknown>,
) {
  await onProgress?.({ step, status, message, detail });
}

export function fingerprintInput(jd: string, companyUrl: string): string {
  const normalized = `${jd.trim().toLowerCase().replace(/\s+/g, ' ')}|${companyUrl.trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex');
}

export async function runPipeline(
  input: PipelineInput,
  options: RunPipelineOptions = {},
): Promise<PipelineResult> {
  const warnings: PipelineWarning[] = [];
  const onProgress = options.onProgress;
  const llm = options.llm ?? createLlmClient();
  const allowLocalhost =
    options.allowLocalhost ?? process.env.ALLOW_LOCALHOST_FETCH === 'true';
  const maxPasses = options.maxCoveragePasses ?? Number(process.env.COVERAGE_MAX_PASSES ?? 3);

  const jd = (input.jd ?? '').trim();
  const days = Number(input.days);
  if (!jd) {
    throw new PipelineError('INVALID_JD', 'Job description is empty');
  }
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    throw new PipelineError('INVALID_DAYS', 'days must be an integer between 1 and 90');
  }
  if (!input.company_url?.trim()) {
    throw new PipelineError('INVALID_URL', 'company_url is required');
  }

  await emit(onProgress, 'validating_jd', 'started');
  await assertSafeUrl(input.company_url.trim(), allowLocalhost);
  await emit(onProgress, 'validating_jd', 'completed');

  await emit(onProgress, 'checking_company_site', 'started');
  let crawl;
  try {
    crawl = await crawlCompanySite(input.company_url.trim(), { allowLocalhost });
    warnings.push(...crawl.warnings);
    if (crawl.pages.length === 0) {
      throw new PipelineError(
        'COMPANY_UNREACHABLE',
        `Company site unreachable after retries (attempted: ${crawl.pages_attempted.join(', ') || input.company_url})`,
      );
    }
    await emit(onProgress, 'checking_company_site', 'completed', undefined, {
      pages: crawl.pages.length,
    });
  } catch (err) {
    await emit(onProgress, 'checking_company_site', 'failed', err instanceof Error ? err.message : String(err));
    if (err instanceof PipelineError) throw err;
    throw new PipelineError(
      'COMPANY_UNREACHABLE',
      err instanceof Error ? err.message : 'Company site unreachable',
    );
  }

  await emit(onProgress, 'discovering_pages', 'started');
  await emit(onProgress, 'discovering_pages', 'completed', undefined, {
    attempted: crawl.pages_attempted.length,
    used: crawl.pages.length,
  });

  await emit(onProgress, 'researching_company', 'started');
  let interview = {
    found: false,
    snippets: [] as Array<{ title: string; url: string; excerpt: string }>,
    warnings: [] as PipelineWarning[],
  };
  // company brief generated after interview search for richer context, but we need pages first
  await emit(onProgress, 'researching_company', 'completed');

  await emit(onProgress, 'searching_interview_info', 'started');
  if (!options.skipInterviewSearch) {
    interview = await searchInterviewDiscussion(crawl.company_name_guess, input.company_url);
    warnings.push(...interview.warnings);
  } else {
    warnings.push({
      code: 'NO_INTERVIEW_DISCUSSION',
      message: 'Interview search skipped',
    });
  }
  await emit(
    onProgress,
    'searching_interview_info',
    interview.found ? 'completed' : 'skipped',
    interview.found ? undefined : 'No useful public interview discussion found',
  );

  const brief = await generateCompanyBrief(
    llm,
    crawl.pages,
    crawl.company_name_guess,
    interview,
  );

  await emit(onProgress, 'extracting_requirements', 'started');
  const extracted = await extractRequirements(llm, jd);
  if (extracted.thin) {
    warnings.push({
      code: 'THIN_JD',
      message: 'Job description is thin; produced an honest limited extraction',
    });
  }
  await emit(onProgress, 'extracting_requirements', 'completed', undefined, {
    count: extracted.requirements.length,
    thin: extracted.thin,
  });

  const interviewNotes = interview.found
    ? interview.snippets.map((s) => `${s.title}: ${s.excerpt}`).join('\n')
    : '';

  const context = {
    companyBrief: `${brief.summary}\n${brief.what_they_do}`,
    roleTitle: extracted.title,
    interviewNotes,
    jd,
  };

  const categories: QuestionCategory[] = [
    'technical',
    'behavioural',
    'system-design',
    'company-fit',
  ];
  const stepFor: Record<QuestionCategory, ProgressStep> = {
    technical: 'generating_technical',
    behavioural: 'generating_behavioural',
    'system-design': 'generating_system_design',
    'company-fit': 'generating_company_fit',
  };

  let questions = [];
  let nextId = 1;
  for (const category of categories) {
    const step = stepFor[category];
    await emit(onProgress, step, 'started');
    const generated = await generateQuestionsForCategory(
      llm,
      category,
      extracted.requirements,
      context,
      nextId,
    );
    nextId += generated.length || 1;
    questions.push(...generated);
    await emit(onProgress, step, 'completed', undefined, { count: generated.length });
  }

  await emit(onProgress, 'generating_flashcards', 'started');
  const flashcards = await generateFlashcards(llm, extracted.requirements, questions);
  await emit(onProgress, 'generating_flashcards', 'completed', undefined, {
    count: flashcards.length,
  });

  let passes = 0;
  let coverage = checkCoverage(extracted.requirements, questions);
  await emit(onProgress, 'checking_coverage', 'started');
  passes = 1;
  await emit(onProgress, 'checking_coverage', 'completed', undefined, {
    uncovered_must: coverage.uncovered_must_ids,
  });

  while (coverage.uncovered_must_ids.length > 0 && passes < maxPasses) {
    await emit(onProgress, 'filling_gaps', 'started', undefined, {
      uncovered: coverage.uncovered_must_ids,
      pass: passes,
    });
    const uncoveredReqs = extracted.requirements.filter((r) =>
      coverage.uncovered_must_ids.includes(r.id),
    );
    const gaps = await generateGapQuestions(llm, uncoveredReqs, questions, nextId);
    nextId += gaps.length || 1;
    questions = [...questions, ...gaps];
    coverage = checkCoverage(extracted.requirements, questions);
    passes += 1;
    await emit(onProgress, 'filling_gaps', 'completed', undefined, {
      still_uncovered: coverage.uncovered_must_ids,
      passes,
    });
    await emit(onProgress, 'checking_coverage', 'completed', undefined, {
      uncovered_must: coverage.uncovered_must_ids,
      passes,
    });
  }

  await emit(onProgress, 'allocating_schedule', 'started');
  const schedule = allocateSchedule(questions, extracted.requirements, days);
  await emit(onProgress, 'allocating_schedule', 'completed');

  await emit(onProgress, 'validating_kit', 'started');
  const sanitized = sanitizeKitReferences({
    source: {
      company: crawl.company_name_guess,
      company_url: input.company_url.trim(),
      role: extracted.title,
      location: extracted.location || '',
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: crawl.pages.map((p) => p.url),
    },
    company_brief: brief,
    role: {
      title: extracted.title,
      seniority: extracted.seniority,
      responsibilities: extracted.responsibilities,
      requirements: extracted.requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered_must_ids,
      passes,
    },
  });
  // Re-check coverage on sanitized output so stripped invalid refs cannot mask gaps.
  const finalCoverage = checkCoverage(sanitized.role.requirements, sanitized.questions);
  const kit = assertValidKit({
    ...sanitized,
    coverage: {
      uncovered_requirement_ids: finalCoverage.uncovered_must_ids,
      passes,
    },
  });
  await emit(onProgress, 'validating_kit', 'completed');
  await emit(onProgress, 'saving_kit', 'completed');

  return {
    kit,
    warnings,
    research: {
      thin_jd: extracted.thin,
      hiring_page_found: crawl.hiring_page_found,
      about_page_found: crawl.about_page_found,
      interview_discussion_found: interview.found,
      pages_attempted: crawl.pages_attempted,
      pages_failed: crawl.pages_failed,
    },
  };
}
