import http from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { crawlCompanySite } from './crawl.js';

async function withSite(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe('crawlCompanySite', () => {
  it('follows relative links and discovers hiring pages buried off-home', async () => {
    await withSite((req, res) => {
      const url = req.url || '/';
      if (url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nAllow: /\n');
        return;
      }
      if (url === '/' || url === '') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body><a href="/about">About us</a></body></html>`);
        return;
      }
      if (url.startsWith('/about')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><body><p>Company culture</p><a href="/deep/careers">Join us</a></body></html>`);
        return;
      }
      if (url.includes('/deep/careers')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body><h1>Careers</h1><p>Our hiring process includes a take-home.</p></body></html>');
        return;
      }
      res.writeHead(404);
      res.end('missing');
    }, async (baseUrl) => {
      const result = await crawlCompanySite(baseUrl, {
        allowLocalhost: true,
        maxPages: 6,
        rateMs: 0,
      });
      expect(result.pages.some((p) => p.kind === 'hiring')).toBe(true);
      expect(result.pages.some((p) => p.url.includes('careers'))).toBe(true);
    });
  }, 30000);

  it('extracts substantive homepage text without navigation chrome', async () => {
    await withSite((req, res) => {
      const url = req.url || '/';
      if (url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Allow: /');
        return;
      }
      if (url === '/' || url === '') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><head><title>Acme</title></head><body>
          <a class="skip-link">Skip to main content</a>
          <nav><a>Products</a><a>Support</a><a>Deals</a></nav>
          <main>
            <h1>Acme</h1>
            <p>Acme builds developer productivity tools for distributed engineering teams.</p>
          </main>
          <footer><a>Privacy</a><a>Terms</a></footer>
        </body></html>`);
        return;
      }
      res.writeHead(404);
      res.end('nope');
    }, async (baseUrl) => {
      const result = await crawlCompanySite(baseUrl, { allowLocalhost: true, rateMs: 0, maxPages: 1 });
      const home = result.pages[0];
      expect(home.text).toContain('developer productivity tools');
      expect(home.text).not.toMatch(/skip to main content/i);
      expect(home.text).not.toContain('Deals');
      expect(home.text).not.toContain('Privacy');
    });
  }, 20000);

  it('continues when a secondary page fails but home works', async () => {
    await withSite((req, res) => {
      const url = req.url || '/';
      if (url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('Allow: /');
        return;
      }
      if (url === '/' || url === '') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body>Acme homepage<a href="/broken-careers">Broken careers</a></body></html>');
        return;
      }
      if (url.includes('broken-careers')) {
        res.writeHead(404);
        res.end('nope');
        return;
      }
      res.writeHead(404);
      res.end('nope');
    }, async (baseUrl) => {
      const result = await crawlCompanySite(baseUrl, { allowLocalhost: true, rateMs: 0 });
      expect(result.pages.length).toBeGreaterThan(0);
      expect(result.pages_failed.length).toBeGreaterThan(0);
    });
  }, 20000);
});
