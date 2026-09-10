import { describe, expect, it } from 'vitest';
import { generateCompanyBrief } from './content.js';
import type { LlmClient } from '../llm/client.js';

describe('generateCompanyBrief', () => {
  it('uses substantive fallback text when the LLM call fails', async () => {
    const llm: LlmClient = {
      async completeJson() {
        throw new Error('LLM unavailable');
      },
    };

    const brief = await generateCompanyBrief(
      llm,
      [
        {
          url: 'https://example.com/',
          title: 'Contoso',
          kind: 'home',
          score: 100,
          text:
            'Skip to main content Deals Support Privacy\n\nContoso builds cloud software for global teams.\n\nOur platform helps enterprises ship faster.',
        },
        {
          url: 'https://example.com/about',
          title: 'About Contoso',
          kind: 'about',
          score: 7,
          text: 'Contoso was founded to make secure collaboration accessible to every organization.',
        },
      ],
      'Contoso',
      { found: false, snippets: [], warnings: [] },
    );

    expect(brief.summary).toContain('Contoso');
    expect(brief.summary).toMatch(/cloud software|secure collaboration/i);
    expect(brief.summary).not.toMatch(/skip to main content/i);
    expect(brief.summary).not.toContain('Deals');
    expect(brief.what_they_do).not.toContain('Privacy');
  });
});
