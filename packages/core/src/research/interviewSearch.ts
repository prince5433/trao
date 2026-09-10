import * as cheerio from 'cheerio';
import { safeFetch } from '../fetch/safeFetch.js';
import type { PipelineWarning } from '../types.js';

export interface InterviewResearch {
  found: boolean;
  snippets: Array<{ title: string; url: string; excerpt: string }>;
  warnings: PipelineWarning[];
}

/**
 * Public interview discussion search via DuckDuckGo HTML (no API key).
 * If nothing useful is found, report honestly — never fabricate.
 */
export async function searchInterviewDiscussion(
  companyName: string,
  companyUrl: string,
): Promise<InterviewResearch> {
  const warnings: PipelineWarning[] = [];
  const host = (() => {
    try {
      return new URL(companyUrl).hostname.replace(/^www\./, '');
    } catch {
      return companyName;
    }
  })();

  const query = `${companyName || host} interview process OR hiring OR "system design" OR "take-home"`;
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const res = await safeFetch(searchUrl, {
      allowLocalhost: false,
      timeoutMs: 12000,
      headers: { Accept: 'text/html' },
    });
    if (res.status >= 400) {
      warnings.push({
        code: 'INTERVIEW_SEARCH_FAILED',
        message: `Interview search HTTP ${res.status}`,
      });
      return { found: false, snippets: [], warnings };
    }

    const $ = cheerio.load(res.body);
    const snippets: InterviewResearch['snippets'] = [];
    $('.result').each((_, el) => {
      if (snippets.length >= 5) return;
      const title = $(el).find('.result__a').text().trim();
      const href = $(el).find('.result__a').attr('href') || '';
      const excerpt = $(el).find('.result__snippet').text().trim();
      if (!title || !excerpt) return;
      const hay = `${title} ${excerpt}`.toLowerCase();
      if (!/(interview|hiring|recruit|take-?home|onsite|system design)/.test(hay)) return;
      snippets.push({ title, url: href, excerpt: excerpt.slice(0, 400) });
    });

    if (snippets.length === 0) {
      warnings.push({
        code: 'NO_INTERVIEW_DISCUSSION',
        message: 'No useful public interview discussion found',
      });
      return { found: false, snippets: [], warnings };
    }

    return { found: true, snippets, warnings };
  } catch (err) {
    warnings.push({
      code: 'INTERVIEW_SEARCH_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
    return { found: false, snippets: [], warnings };
  }
}
