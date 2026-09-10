export type RequirementKind = 'technical' | 'behavioural' | 'domain';
export type RequirementPriority = 'must' | 'nice';
export type QuestionCategory =
  | 'technical'
  | 'behavioural'
  | 'system-design'
  | 'company-fit';

export interface KitRequirement {
  id: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface KitQuestion {
  id: string;
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface KitFlashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface ScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

export interface PrepKit {
  source: {
    company: string;
    company_url: string;
    role: string;
    location: string;
    jd_chars: number;
    researched_at: string;
    pages_used: string[];
  };
  company_brief: {
    summary: string;
    what_they_do: string;
    sources: string[];
  };
  role: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: KitRequirement[];
  };
  questions: KitQuestion[];
  flashcards: KitFlashcard[];
  schedule: {
    days_available: number;
    days: ScheduleDay[];
  };
  coverage: {
    uncovered_requirement_ids: string[];
    passes: number;
  };
}

export type ItemOrigin = 'generated' | 'edited' | 'manual';

export interface ItemMeta {
  origin: ItemOrigin;
  pinned: boolean;
  updatedAt: string;
}

export type ProgressStep =
  | 'validating_jd'
  | 'checking_company_site'
  | 'discovering_pages'
  | 'researching_company'
  | 'searching_interview_info'
  | 'extracting_requirements'
  | 'generating_technical'
  | 'generating_behavioural'
  | 'generating_system_design'
  | 'generating_company_fit'
  | 'generating_flashcards'
  | 'checking_coverage'
  | 'filling_gaps'
  | 'allocating_schedule'
  | 'validating_kit'
  | 'saving_kit';

export const PROGRESS_STEPS: ProgressStep[] = [
  'validating_jd',
  'checking_company_site',
  'discovering_pages',
  'researching_company',
  'searching_interview_info',
  'extracting_requirements',
  'generating_technical',
  'generating_behavioural',
  'generating_system_design',
  'generating_company_fit',
  'generating_flashcards',
  'checking_coverage',
  'filling_gaps',
  'allocating_schedule',
  'validating_kit',
  'saving_kit',
];

export interface ProgressEvent {
  step: ProgressStep;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  message?: string;
  detail?: Record<string, unknown>;
}

export interface PipelineWarning {
  code: string;
  message: string;
}

export interface PipelineInput {
  jd: string;
  company_url: string;
  days: number;
  caseId?: string;
}

export interface PipelineResult {
  kit: PrepKit;
  warnings: PipelineWarning[];
  research: {
    thin_jd: boolean;
    hiring_page_found: boolean;
    about_page_found: boolean;
    interview_discussion_found: boolean;
    pages_attempted: string[];
    pages_failed: string[];
    pages: Array<{
      url: string;
      title: string;
      text: string;
      score: number;
      kind: 'home' | 'hiring' | 'about' | 'other';
    }>;
  };
}

export interface BatchCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export interface BatchError {
  code: string;
  message: string;
}

export interface BatchKitResult {
  id: string;
  status: 'ok' | 'failed';
  kit: PrepKit | null;
  error: BatchError | null;
}

export interface BatchOutput {
  version: '1.0';
  generated_at: string;
  kits: BatchKitResult[];
}

export class PipelineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PipelineError';
  }
}
