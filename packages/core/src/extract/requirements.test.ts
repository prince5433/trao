import { describe, expect, it } from 'vitest';
import { inferPriorityFromText, heuristicExtract } from '../extract/requirements.js';
import { scoreLink } from '../research/crawl.js';
import { fingerprintInput } from '../pipeline/run.js';

describe('requirement priority heuristics', () => {
  it('marks must vs nice from phrasing', () => {
    expect(inferPriorityFromText('Must have 5 years of React')).toBe('must');
    expect(inferPriorityFromText('Nice to have GraphQL')).toBe('nice');
    expect(inferPriorityFromText('Bonus: Rust experience')).toBe('nice');
    expect(inferPriorityFromText('Required: TypeScript')).toBe('must');
  });

  it('produces thin honest extraction for stub JDs', () => {
    const result = heuristicExtract('Frontend Engineer. React.');
    expect(result.thin).toBe(true);
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('keeps section-scoped must vs nice from JD structure', () => {
    const result = heuristicExtract(`Senior Backend Engineer

Required:
- 5+ years with Node.js
- Mentoring junior engineers

Nice to have:
- GraphQL
- Kafka experience
`);
    expect(result.requirements.some((r) => r.priority === 'must' && /Node/i.test(r.text))).toBe(
      true,
    );
    expect(result.requirements.some((r) => r.priority === 'nice' && /GraphQL/i.test(r.text))).toBe(
      true,
    );
  });
});

describe('link ranking', () => {
  it('scores careers-like paths higher than random blog posts', () => {
    expect(scoreLink('https://x.com/careers/engineering')).toBeGreaterThan(
      scoreLink('https://x.com/blog/hello'),
    );
    expect(scoreLink('https://x.com/handbook/hiring')).toBeGreaterThan(0);
  });
});

describe('fingerprint', () => {
  it('is stable for normalized JD + URL', () => {
    const a = fingerprintInput('Hello   World', 'https://Example.com/');
    const b = fingerprintInput('hello world', 'https://example.com/');
    expect(a).toBe(b);
  });
});
