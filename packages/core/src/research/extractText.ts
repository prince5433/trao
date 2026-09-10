import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

const CHROME_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'template',
  'picture',
  'source',
  'nav',
  'header',
  'footer',
  'aside',
  'menu',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="search"]',
  '[aria-hidden="true"]',
  '.skip-link',
  '.skip-to-content',
  '[class*="skip-to"]',
  '[class*="skip-link"]',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[id*="cookie-banner"]',
  '[class*="gdpr"]',
];

const MAIN_SELECTORS = ['main', '[role="main"]', 'article', '#main', '#content', '.main-content'];

const BOILERPLATE_LINE =
  /^(skip to (main )?content|trace id is missing|privacy|terms of use|accessibility|sitemap|contact us|sign in|log in)$/i;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function dedupeBlocks(blocks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const key = block.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(block);
  }
  return out;
}

function isSubstantiveBlock(text: string): boolean {
  const normalized = collapseWhitespace(text);
  if (normalized.length < 30) return false;
  if (BOILERPLATE_LINE.test(normalized)) return false;
  const words = normalized.split(' ').filter(Boolean);
  if (words.length < 4 && normalized.length < 60) return false;
  return true;
}

function pickContentRoot($: CheerioAPI) {
  for (const selector of MAIN_SELECTORS) {
    const candidate = $(selector).first();
    if (candidate.length && collapseWhitespace(candidate.text()).length > 80) {
      return candidate;
    }
  }
  return $('body');
}

function extractBlocks($: CheerioAPI, root: ReturnType<CheerioAPI>): string[] {
  const blocks: string[] = [];
  root.find('p, h1, h2, h3, h4, blockquote, li').each((_, el) => {
    const text = collapseWhitespace($(el).text());
    if (isSubstantiveBlock(text)) blocks.push(text);
  });
  return dedupeBlocks(blocks);
}

export function extractPageText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);

  for (const selector of CHROME_SELECTORS) {
    $(selector).remove();
  }
  $('[hidden]').remove();

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    '';

  const root = pickContentRoot($);
  const blocks = extractBlocks($, root);
  const text = blocks.length >= 2 ? blocks.join('\n\n') : collapseWhitespace(root.text());

  return { title, text: text.slice(0, 20000) };
}

type BriefPageKind = 'home' | 'hiring' | 'about' | 'other';

const BRIEF_KIND_WEIGHT: Record<BriefPageKind, number> = {
  about: 4,
  hiring: 3,
  other: 2,
  home: 1,
};

export function sortPagesForBrief<T extends { kind: BriefPageKind; score: number }>(pages: T[]): T[] {
  return [...pages].sort((a, b) => {
    const byKind = BRIEF_KIND_WEIGHT[b.kind] - BRIEF_KIND_WEIGHT[a.kind];
    if (byKind !== 0) return byKind;
    return b.score - a.score;
  });
}

export function buildFallbackBriefSnippet(pages: Array<{ text: string }>, maxChars = 400): string {
  for (const page of pages) {
    const blocks = page.text
      .split(/\n{2,}/)
      .map((block) => collapseWhitespace(block))
      .filter(isSubstantiveBlock);
    if (blocks.length > 0) {
      return blocks.join(' ').slice(0, maxChars);
    }
  }
  return '';
}
