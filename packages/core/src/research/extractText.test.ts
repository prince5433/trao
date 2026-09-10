import { describe, expect, it } from 'vitest';
import {
  buildFallbackBriefSnippet,
  extractPageText,
  sortPagesForBrief,
} from './extractText.js';

const BOILERPLATE_HOME = `<!doctype html>
<html>
<head><title>Contoso Corp</title></head>
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <div>Trace Id is missing</div>
  <header role="banner">
    <nav role="navigation">
      <a href="/">Home</a>
      <a href="/products">Products</a>
      <a href="/pricing">Pricing</a>
      <a href="/support">Support</a>
      <a href="/deals">Deals</a>
    </nav>
  </header>
  <main id="main">
    <h1>Empowering every person and organization</h1>
    <p>Contoso builds cloud software that helps teams collaborate securely across the globe.</p>
    <p>Our platform powers millions of workflows for enterprises, startups, and public sector teams.</p>
    <a href="/about">About us</a>
  </main>
  <footer role="contentinfo">
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms of Use</a>
    <a href="/accessibility">Accessibility</a>
  </footer>
</body>
</html>`;

describe('extractPageText', () => {
  it('keeps main content while stripping navigation and boilerplate chrome', () => {
    const { title, text } = extractPageText(BOILERPLATE_HOME);
    expect(title).toBe('Contoso Corp');
    expect(text).toContain('Contoso builds cloud software');
    expect(text).toContain('millions of workflows');
    expect(text).not.toMatch(/skip to main content/i);
    expect(text).not.toMatch(/trace id is missing/i);
    expect(text).not.toContain('Privacy');
    expect(text).not.toContain('Terms of Use');
    expect(text).not.toContain('Deals');
    expect(text).not.toContain('Support');
  });

  it('falls back to body text when no paragraph blocks are available', () => {
    const html = `<html><body><div>Short only</div></body></html>`;
    const { text } = extractPageText(html);
    expect(text).toBe('Short only');
  });
});

describe('sortPagesForBrief', () => {
  it('prioritizes about and hiring pages over the homepage', () => {
    const pages = [
      { url: 'https://example.com/', kind: 'home' as const, score: 100 },
      { url: 'https://example.com/about', kind: 'about' as const, score: 7 },
      { url: 'https://example.com/careers', kind: 'hiring' as const, score: 12 },
    ];
    const ordered = sortPagesForBrief(pages);
    expect(ordered.map((p) => p.kind)).toEqual(['about', 'hiring', 'home']);
  });
});

describe('buildFallbackBriefSnippet', () => {
  it('uses substantive extracted blocks instead of navigation labels', () => {
    const { text } = extractPageText(BOILERPLATE_HOME);
    const snippet = buildFallbackBriefSnippet([{ text }]);
    expect(snippet).toContain('cloud software');
    expect(snippet).not.toMatch(/skip to main content/i);
    expect(snippet).not.toContain('Deals');
  });
});
