#!/usr/bin/env node
import { crawlCompanySite } from '../packages/core/dist/research/crawl.js';
import { buildFallbackBriefSnippet, sortPagesForBrief } from '../packages/core/dist/research/extractText.js';

const sites = [
  { name: 'Microsoft', url: 'https://www.microsoft.com' },
  { name: 'Stripe', url: 'https://stripe.com' },
  { name: 'Shopify', url: 'https://www.shopify.com' },
];

async function probe({ name, url }) {
  console.log(`\n=== ${name} (${url}) ===`);
  try {
    const result = await crawlCompanySite(url, { maxPages: 4, rateMs: 500 });
    console.log('pages:', result.pages.length, 'failed:', result.pages_failed.length);
    console.log('warnings:', result.warnings.map((w) => w.code).join(', ') || 'none');
    const ordered = sortPagesForBrief(result.pages);
    for (const page of ordered) {
      const preview = page.text.slice(0, 220).replace(/\s+/g, ' ');
      console.log(`- [${page.kind}] ${page.url}`);
      console.log(`  title: ${page.title}`);
      console.log(`  text: ${preview}${page.text.length > 220 ? '…' : ''}`);
    }
    const snippet = buildFallbackBriefSnippet(ordered);
    console.log('fallback snippet:', snippet.slice(0, 280).replace(/\s+/g, ' ') || '(empty)');
    const navNoise = /skip to main content|trace id is missing|privacy|terms of use/i.test(snippet);
    console.log('nav noise in fallback:', navNoise ? 'YES' : 'no');
  } catch (err) {
    console.log('ERROR:', err instanceof Error ? err.message : String(err));
  }
}

for (const site of sites) {
  await probe(site);
}
