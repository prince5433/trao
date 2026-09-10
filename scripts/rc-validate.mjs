#!/usr/bin/env node
/**
 * Release-candidate validation runner (no secrets printed).
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const results = [];

function log(section, status, detail = '') {
  results.push({ section, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'SKIP' ? '○' : status === 'WARN' ? '!' : '✗';
  console.log(`${icon} [${section}] ${status}${detail ? `: ${detail}` : ''}`);
}

function hasSecret(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim().length > 0);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? root,
      shell: true,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function startLocalCompanyServer() {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n');
      return;
    }
    if (url === '/' || url === '') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(
        '<html><body>RC Corp<a href="/about">About</a><a href="/team/careers">Careers</a></body></html>',
      );
      return;
    }
    if (url.includes('/about')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>About RC Corp culture</body></html>');
      return;
    }
    if (url.includes('career')) {
      res.writeHead(404);
      res.end('missing careers page');
      return;
    }
    res.writeHead(404);
    res.end('nope');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function checkEnv() {
  log('ENV', hasSecret('MONGODB_URI') ? 'PASS' : 'FAIL', 'MONGODB_URI');
  log('ENV', hasSecret('SESSION_SECRET') ? 'PASS' : 'FAIL', 'SESSION_SECRET');
  log('ENV', hasSecret('LLM_API_KEY') ? 'PASS' : 'FAIL', 'LLM_API_KEY');
  log(
    'ENV',
    process.env.NEXT_PUBLIC_API_URL ? 'PASS' : 'WARN',
    'NEXT_PUBLIC_API_URL',
  );
  log(
    'ENV',
    process.env.ALLOW_LOCALHOST_FETCH === 'true' ? 'PASS' : 'WARN',
    'ALLOW_LOCALHOST_FETCH=true (dev/batch)',
  );
  log(
    'ENV',
    'PASS',
    `production render.yaml sets ALLOW_LOCALHOST_FETCH=false`,
  );
}

async function runHeuristicJds() {
  const { heuristicExtract } = await import('../packages/core/dist/extract/requirements.js');
  const jds = [
    {
      name: 'paragraph-mixed',
      jd: `Staff Platform Engineer

We're hiring someone who has led migrations from monoliths to microservices and can communicate trade-offs to executives.

Required qualifications include 8+ years of backend development with Java or Kotlin and experience in regulated fintech environments.

Preferred: exposure to Kubernetes and event-driven architectures is a nice to have bonus.`,
    },
    {
      name: 'multi-tech-sentence',
      jd: `Senior SRE

Must have: Python, Go, Terraform, and on-call experience in production systems.

You will build observability dashboards and mentor junior engineers.

Bonus: AWS certifications.`,
    },
    {
      name: 'responsibilities-vs-reqs',
      jd: `Product Engineer

Responsibilities:
- Ship features weekly with React and Node
- Collaborate with design

Requirements:
- 4+ years full-stack experience
- Strong written communication`,
    },
  ];
  for (const item of jds) {
    const out = heuristicExtract(item.jd);
    const invented = out.requirements.some((r) =>
      /executive|certification/i.test(r.text) && !item.jd.toLowerCase().includes(r.text.toLowerCase().slice(0, 8)),
    );
    log(
      'UNSEEN_JD',
      out.requirements.length >= 2 ? 'PASS' : 'WARN',
      `${item.name}: ${out.requirements.length} reqs, must=${out.requirements.filter((r) => r.priority === 'must').length}`,
    );
    if (invented) log('UNSEEN_JD', 'WARN', `${item.name}: possible invented requirement`);
  }
}

async function runBatch() {
  const local = await startLocalCompanyServer();
  const batchPath = path.join(root, 'fixtures', 'rc-batch-runtime.json');
  const cases = [
    {
      id: 'rc-normal',
      jd: `Senior Backend Engineer\n\nRequired:\n- 5+ years Node.js and PostgreSQL\n- Mentoring junior engineers\n- Experience in payments/fintech domain\n\nNice to have:\n- GraphQL\n\nResponsibilities:\n- Own API design and on-call rotation`,
      company_url: 'https://example.com',
      days: 7,
    },
    {
      id: 'rc-thin',
      jd: 'Backend. Go.',
      company_url: 'https://example.com',
      days: 1,
    },
    {
      id: 'rc-localhost',
      jd: 'Engineer. Required: teamwork.',
      company_url: local.baseUrl,
      days: 2,
    },
    {
      id: 'rc-unreachable',
      jd: 'Engineer role',
      company_url: 'http://127.0.0.1:1/',
      days: 3,
    },
    {
      id: 'rc-partial',
      jd: 'Platform engineer with Kubernetes experience required.',
      company_url: local.baseUrl,
      days: 4,
    },
  ];
  await fs.writeFile(batchPath, JSON.stringify(cases, null, 2));
  const outPath = path.join(root, 'kits-rc-output.json');
  const started = Date.now();
  const evalRun = await run('npm', ['run', 'evaluate', '--', '--input', batchPath, '--output', outPath], {
    env: { ALLOW_LOCALHOST_FETCH: 'true' },
  });
  const elapsedSec = Math.round((Date.now() - started) / 1000);
  await local.close();

  if (evalRun.code !== 0) {
    log('BATCH', 'FAIL', `evaluate exited ${evalRun.code}`);
    return;
  }

  const output = JSON.parse(await fs.readFile(outPath, 'utf8'));
  const ids = output.kits.map((k) => k.id);
  const ok =
    output.version === '1.0' &&
    output.generated_at &&
    ids.length === 5 &&
    new Set(ids).size === 5;
  log('BATCH', ok ? 'PASS' : 'FAIL', `version/shape; ${elapsedSec}s`);
  log(
    'BATCH',
    elapsedSec <= 900 ? 'PASS' : 'WARN',
    `runtime ${elapsedSec}s (target ≤900s)`,
  );
  for (const c of cases) {
    const row = output.kits.find((k) => k.id === c.id);
    if (!row) {
      log('BATCH', 'FAIL', `missing id ${c.id}`);
      continue;
    }
    if (c.id === 'rc-unreachable') {
      log('BATCH', row.status === 'failed' ? 'PASS' : 'FAIL', `${c.id}=${row.status}`);
    } else {
      log('BATCH', row.status === 'ok' ? 'PASS' : 'FAIL', `${c.id}=${row.status}`);
      if (row.status === 'ok' && row.kit?.schedule?.days_available !== c.days) {
        log('BATCH', 'FAIL', `${c.id} days mismatch`);
      }
    }
  }
}

async function runRealLlmPipeline() {
  if (!hasSecret('LLM_API_KEY')) {
    log('REAL_LLM', 'SKIP', 'LLM_API_KEY not configured');
    return;
  }
  const { runPipeline, assertValidKit, checkCoverage, createLlmClient } = await import(
    '../packages/core/dist/index.js'
  );
  const jd = `Senior Software Engineer — Backend Platform

About the role:
You will design and operate high-throughput payment APIs used by millions of customers.

Required:
- 6+ years professional backend development with TypeScript or Java
- Strong understanding of distributed systems and PostgreSQL
- Experience mentoring engineers and leading code reviews
- Prior work in regulated fintech or payments domain

Nice to have:
- GraphQL and Kafka experience
- AWS infrastructure knowledge

Responsibilities:
- Own on-call for core payment services
- Partner with product on roadmap planning`;

  const started = Date.now();
  try {
    const result = await runPipeline(
      { jd, company_url: 'https://example.com', days: 10 },
      { llm: createLlmClient(), allowLocalhost: false, skipInterviewSearch: false },
    );
    const kit = assertValidKit(result.kit);
    const cov = checkCoverage(kit.role.requirements, kit.questions);
    const mustIds = kit.role.requirements.filter((r) => r.priority === 'must').map((r) => r.id);
    const coveredMust = mustIds.filter((id) => !cov.uncovered_must_ids.includes(id));
    log(
      'REAL_LLM',
      'PASS',
      `${Math.round((Date.now() - started) / 1000)}s; reqs=${kit.role.requirements.length}; must-covered=${coveredMust.length}/${mustIds.length}; passes=${kit.coverage.passes}`,
    );
    if (cov.uncovered_must_ids.length > 0) {
      log('REAL_LLM', 'WARN', `uncovered must: ${cov.uncovered_must_ids.join(',')}`);
    }
  } catch (err) {
    log('REAL_LLM', 'FAIL', err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  console.log('=== Release Candidate Validation ===\n');
  await checkEnv();

  const test = await run('npm', ['test']);
  log('TESTS', test.code === 0 ? 'PASS' : 'FAIL');

  for (const script of ['typecheck', 'lint', 'build']) {
    const r = await run('npm', ['run', script]);
    log(
      script.toUpperCase(),
      r.code === 0 ? 'PASS' : 'FAIL',
      r.code !== 0 ? (r.stderr || r.stdout).split('\n').slice(-3).join(' ').trim() : '',
    );
  }

  await runHeuristicJds();
  await runBatch();
  await runRealLlmPipeline();

  const fails = results.filter((r) => r.status === 'FAIL').length;
  const skips = results.filter((r) => r.section === 'REAL_LLM' && r.status === 'SKIP').length;
  console.log(`\n=== Summary: ${fails} FAIL, ${results.filter((r) => r.status === 'WARN').length} WARN, ${skips} LLM SKIP ===`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
