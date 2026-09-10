import http from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { runPipeline } from '../pipeline/run.js';
import type { LlmClient } from '../llm/client.js';
import { assertValidKit } from '../kit/schema.js';
import { checkCoverage } from '../coverage/check.js';

function mockLlm(): LlmClient {
  return {
    async completeJson<T>(options): Promise<T> {
      const user = options.messages.map((m) => m.content).join('\n');
      if (user.includes('Category: technical')) {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              prompt: 'Explain Node event loop',
              answer_outline: 'Phases, libuv',
              difficulty: 2,
            },
          ],
        } as T;
      }
      if (user.includes('Category: behavioural')) {
        return {
          questions: [
            {
              requirement_ids: ['r2'],
              prompt: 'Tell me about mentoring',
              answer_outline: 'STAR example',
              difficulty: 2,
            },
          ],
        } as T;
      }
      if (user.includes('Category: system-design')) {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              prompt: 'Design a job queue',
              answer_outline: 'Workers, retries',
              difficulty: 3,
            },
          ],
        } as T;
      }
      if (user.includes('Category: company-fit')) {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              prompt: 'Why Acme?',
              answer_outline: 'Mission fit',
              difficulty: 1,
            },
          ],
        } as T;
      }
      if (user.includes('Uncovered requirements')) {
        return {
          questions: [
            {
              requirement_ids: ['r2'],
              prompt: 'Gap mentoring question',
              answer_outline: 'Examples',
              difficulty: 2,
              category: 'behavioural',
            },
          ],
        } as T;
      }
      if (user.includes('Create flashcards') || user.includes('"flashcards"')) {
        return {
          flashcards: [
            { front: 'Event loop', back: 'libuv phases', requirement_ids: ['r1'] },
            { front: 'Mentoring', back: 'Feedback loops', requirement_ids: ['r2'] },
          ],
        } as T;
      }
      if (user.includes('company_pages') || user.includes('Write an honest company brief')) {
        return {
          summary: 'Acme builds developer tools.',
          what_they_do: 'API productivity software.',
        } as T;
      }
      if (user.includes('Extract role details')) {
        return {
          title: 'Senior Backend Engineer',
          seniority: 'senior',
          location: 'Remote',
          responsibilities: ['Own APIs'],
          requirements: [
            { text: '5+ years Node.js', kind: 'technical', priority: 'must' },
            { text: 'Mentoring juniors', kind: 'behavioural', priority: 'must' },
            { text: 'GraphQL', kind: 'technical', priority: 'nice' },
          ],
        } as T;
      }
      return {} as T;
    },
  };
}

async function withCompanyServer<T>(
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n');
      return;
    }
    if (url === '/' || url === '/acme' || url === '/acme/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><head><title>Acme</title></head><body>
        <h1>Acme Corp</h1>
        <p>We build developer productivity tools.</p>
        <a href="/acme/about">About</a>
        <a href="/acme/careers">Careers</a>
      </body></html>`);
      return;
    }
    if (url.includes('about')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>About Acme</title></head><body><p>About our mission and culture.</p></body></html>');
      return;
    }
    if (url.includes('career') || url.includes('hiring')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Careers</title></head><body><p>Hiring process: take-home then system design.</p></body></html>');
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/acme/`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe('runPipeline integration', () => {
  it('produces a valid Appendix A kit with coverage and exact schedule days', async () => {
    await withCompanyServer(async (companyUrl) => {
      const steps: string[] = [];
      const result = await runPipeline(
        {
          jd: `Senior Backend Engineer

Required:
- 5+ years with Node.js and TypeScript
- Mentoring junior engineers

Nice to have:
- GraphQL

You will own services end to end.`,
          company_url: companyUrl,
          days: 5,
        },
        {
          llm: mockLlm(),
          allowLocalhost: true,
          skipInterviewSearch: true,
          onProgress: (e) => {
            if (e.status === 'completed' || e.status === 'skipped') steps.push(e.step);
          },
        },
      );

      const kit = assertValidKit(result.kit);
      expect(kit.schedule.days).toHaveLength(5);
      expect(kit.role.requirements.some((r) => r.priority === 'must')).toBe(true);
      expect(kit.role.requirements.some((r) => r.priority === 'nice')).toBe(true);
      const coverage = checkCoverage(kit.role.requirements, kit.questions);
      expect(coverage.uncovered_must_ids).toEqual([]);
      expect(kit.coverage.passes).toBeGreaterThanOrEqual(1);
      expect(steps).toContain('extracting_requirements');
      expect(steps).toContain('allocating_schedule');
      expect(result.research.hiring_page_found || result.warnings.some((w) => w.code === 'NO_HIRING_PAGE')).toBe(true);
    });
  }, 60000);

  it('handles thin JD honestly', async () => {
    await withCompanyServer(async (companyUrl) => {
      const result = await runPipeline(
        {
          jd: 'Frontend. React.',
          company_url: companyUrl,
          days: 1,
        },
        {
          llm: mockLlm(),
          allowLocalhost: true,
          skipInterviewSearch: true,
        },
      );
      expect(result.research.thin_jd).toBe(true);
      expect(result.kit.schedule.days).toHaveLength(1);
      assertValidKit(result.kit);
    });
  }, 60000);

  it('fails cleanly for unreachable company', async () => {
    await expect(
      runPipeline(
        {
          jd: 'Engineer with TypeScript experience required.',
          company_url: 'http://127.0.0.1:1/',
          days: 3,
        },
        {
          llm: mockLlm(),
          allowLocalhost: true,
          skipInterviewSearch: true,
        },
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/UNREACHABLE|TIMEOUT|INVALID/) });
  }, 30000);
});
