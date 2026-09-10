import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { normalizeUrl, safeFetch, withRetry } from '../fetch/safeFetch.js';
import type { PipelineWarning } from '../types.js';
import { extractPageText } from './extractText.js';

type Robots = {
  isAllowed(url: string, ua?: string): boolean | undefined;
};

function parseRobots(url: string, body: string): Robots {
  const fn = robotsParser as unknown as (u: string, b: string) => Robots;
  return fn(url, body);
}

const RANK_KEYWORDS: Array<{ term: string; weight: number }> = [
  { term: 'careers', weight: 12 },
  { term: 'jobs', weight: 11 },
  { term: 'hiring', weight: 11 },
  { term: 'interview', weight: 10 },
  { term: 'recruiting', weight: 9 },
  { term: 'handbook', weight: 9 },
  { term: 'engineering', weight: 8 },
  { term: 'culture', weight: 7 },
  { term: 'about', weight: 7 },
  { term: 'company', weight: 6 },
  { term: 'teams', weight: 6 },
  { term: 'values', weight: 5 },
  { term: 'mission', weight: 5 },
  { term: 'blog', weight: 3 },
  { term: 'people', weight: 4 },
  { term: 'join', weight: 8 },
  { term: 'work-with', weight: 7 },
  { term: 'open-roles', weight: 10 },
];

export interface PageContent {
  url: string;
  title: string;
  text: string;
  score: number;
  kind: 'home' | 'hiring' | 'about' | 'other';
}

export interface CrawlResult {
  pages: PageContent[];
  pages_attempted: string[];
  pages_failed: string[];
  hiring_page_found: boolean;
  about_page_found: boolean;
  warnings: PipelineWarning[];
  company_name_guess: string;
}

function cleanText(html: string): { title: string; text: string } {
  return extractPageText(html);
}

export function scoreLink(url: string, anchorText = ''): number {
  const hay = `${url} ${anchorText}`.toLowerCase();
  let score = 0;
  for (const { term, weight } of RANK_KEYWORDS) {
    if (hay.includes(term)) score += weight;
  }
  return score;
}

function classifyPage(url: string, title: string, text: string): PageContent['kind'] {
  const hay = `${url} ${title} ${text.slice(0, 500)}`.toLowerCase();
  if (/(career|hiring|job|recruit|interview|open.?role)/.test(hay)) return 'hiring';
  if (/(about|company|mission|culture|who we are)/.test(hay)) return 'about';
  return 'other';
}

function extractLinks(html: string, baseUrl: string): Array<{ href: string; text: string }> {
  const $ = cheerio.load(html);
  const out: Array<{ href: string; text: string }> = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    try {
      const absolute = normalizeUrl(href, baseUrl);
      const u = new URL(absolute);
      const base = new URL(baseUrl);
      if (u.hostname !== base.hostname) return;
      out.push({ href: absolute, text: $(el).text().trim() });
    } catch {
      // ignore bad links
    }
  });
  return out;
}

async function loadRobots(origin: string, allowLocalhost: boolean) {
  try {
    const robotsUrl = new URL('/robots.txt', origin).toString();
    const res = await safeFetch(robotsUrl, { allowLocalhost, timeoutMs: 8000 });
    if (res.status >= 400) return null;
    return parseRobots(robotsUrl, res.body);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function crawlCompanySite(
  companyUrl: string,
  options: { maxPages?: number; rateMs?: number; allowLocalhost?: boolean } = {},
): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? Number(process.env.CRAWL_MAX_PAGES ?? 6);
  const rateMs = options.rateMs ?? Number(process.env.CRAWL_RATE_MS ?? 400);
  const allowLocalhost =
    options.allowLocalhost ?? process.env.ALLOW_LOCALHOST_FETCH === 'true';

  const warnings: PipelineWarning[] = [];
  const pages_attempted: string[] = [];
  const pages_failed: string[] = [];
  const pages: PageContent[] = [];
  const seen = new Set<string>();

  let start: string;
  try {
    start = normalizeUrl(companyUrl);
  } catch {
    throw Object.assign(new Error(`Invalid company URL: ${companyUrl}`), {
      code: 'INVALID_URL',
    });
  }

  const origin = new URL(start).origin;
  const robots = await loadRobots(origin, allowLocalhost);
  const ua = 'InterviewPrepKitBot';

  const candidates: Array<{ url: string; score: number }> = [{ url: start, score: 100 }];

  async function fetchPage(url: string, score: number) {
    if (seen.has(url) || pages.length >= maxPages) return;
    if (robots && !robots.isAllowed(url, ua)) {
      warnings.push({ code: 'ROBOTS_SKIPPED', message: `Skipped by robots.txt: ${url}` });
      return;
    }
    seen.add(url);
    pages_attempted.push(url);
    await sleep(rateMs);
    try {
      const res = await withRetry(
        () => safeFetch(url, { allowLocalhost }),
        { retries: 2, baseMs: 400 },
      );
      if (res.status === 404) {
        pages_failed.push(url);
        warnings.push({ code: 'PAGE_404', message: `404 for ${url}` });
        return;
      }
      if (res.status >= 400) {
        pages_failed.push(url);
        warnings.push({ code: 'PAGE_ERROR', message: `HTTP ${res.status} for ${url}` });
        return;
      }
      const { title, text } = cleanText(res.body);
      const kind = url === start ? 'home' : classifyPage(url, title, text);
      pages.push({ url: res.finalUrl, title, text, score, kind });

      // Discover links from every fetched page so hiring info buried off-home is reachable.
      for (const link of extractLinks(res.body, res.finalUrl)) {
        const s = scoreLink(link.href, link.text);
        if (s > 0 && !seen.has(link.href)) {
          candidates.push({ url: link.href, score: s });
        }
      }
    } catch (err) {
      pages_failed.push(url);
      warnings.push({
        code: 'PAGE_FETCH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await fetchPage(start, 100);

  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (pages.length >= maxPages) break;
    await fetchPage(c.url, c.score);
  }

  const hiring_page_found = pages.some((p) => p.kind === 'hiring');
  const about_page_found = pages.some((p) => p.kind === 'about');
  if (!hiring_page_found) {
    warnings.push({
      code: 'NO_HIRING_PAGE',
      message: 'No discoverable hiring/careers page found',
    });
  }
  if (!about_page_found) {
    warnings.push({
      code: 'NO_ABOUT_PAGE',
      message: 'No discoverable about page found',
    });
  }

  const company_name_guess =
    pages[0]?.title.split(/[|\-–—]/)[0]?.trim() ||
    new URL(start).hostname.replace(/^www\./, '');

  return {
    pages,
    pages_attempted,
    pages_failed,
    hiring_page_found,
    about_page_found,
    warnings,
    company_name_guess,
  };
}
