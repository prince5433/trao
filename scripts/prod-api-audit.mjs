#!/usr/bin/env node
const BASE = process.env.BASE_URL || 'https://trao-interview-prep.vercel.app';
const email = `audit-${Date.now()}@example.com`;
const password = 'password12345';

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}

async function json(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include',
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { res, body };
}

let cookie = '';

try {
  const health = await json('/api/health');
  record('GET /api/health', health.res.ok, String(health.res.status));

  const reg = await json('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const regCookie = reg.res.headers.get('set-cookie') || '';
  record('POST /api/auth/register', reg.res.ok, String(reg.res.status));

  const login = await json('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  cookie = login.res.headers.get('set-cookie') || regCookie;
  record('POST /api/auth/login', login.res.ok, String(login.res.status));

  const me = await json('/api/auth/me', { headers: { Cookie: cookie.split(';')[0] || '' } });
  record('GET /api/auth/me', me.res.ok && me.body?.user?.email === email, String(me.res.status));

  const kits = await json('/api/kits', { headers: { Cookie: cookie.split(';')[0] || '' } });
  record('GET /api/kits', kits.res.ok, `status ${kits.res.status}, count ${Array.isArray(kits.body?.kits) ? kits.body.kits.length : 'n/a'}`);

  const create = await json('/api/kits', {
    method: 'POST',
    headers: { Cookie: cookie.split(';')[0] || '' },
    body: JSON.stringify({
      jd: 'Software Engineer Intern\nRequired:\n- Programming fundamentals',
      company_url: 'https://stripe.com',
      days: 3,
    }),
  });
  const kitId = create.body?.kit?.id || create.body?.id;
  record('POST /api/kits', create.res.status === 202 || create.res.ok, `status ${create.res.status}, id ${kitId || 'missing'}`);

  if (kitId) {
    for (let i = 0; i < 40; i++) {
      const kit = await json(`/api/kits/${kitId}`, { headers: { Cookie: cookie.split(';')[0] || '' } });
      const status = kit.body?.status;
      if (status === 'ready' || status === 'partial' || status === 'failed') {
        record('GET /api/kits/:id generation', status !== 'failed', `status ${status}`);
        if (status !== 'generating') break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    const patch = await json(`/api/kits/${kitId}`, {
      method: 'PATCH',
      headers: { Cookie: cookie.split(';')[0] || '' },
      body: JSON.stringify({ title: 'Audit kit title' }),
    });
    record('PATCH /api/kits/:id', patch.res.ok, String(patch.res.status));

    const regen = await json(`/api/kits/${kitId}/regenerate`, {
      method: 'POST',
      headers: { Cookie: cookie.split(';')[0] || '' },
      body: JSON.stringify({ section: 'schedule' }),
    });
    record('POST /api/kits/:id/regenerate schedule', regen.res.ok, String(regen.res.status));

    const practice = await json(`/api/kits/${kitId}/practice`, {
      method: 'POST',
      headers: { Cookie: cookie.split(';')[0] || '' },
      body: JSON.stringify({ flashcard_id: 'f1', confidence: 3 }),
    });
    record('POST /api/kits/:id/practice', practice.res.status === 200 || practice.res.status === 400, `status ${practice.res.status}`);

    const weak = await json(`/api/kits/${kitId}/weak-spots`, { headers: { Cookie: cookie.split(';')[0] || '' } });
    record('GET /api/kits/:id/weak-spots', weak.res.ok, String(weak.res.status));

    const events = await json(`/api/kits/${kitId}/events`, { headers: { Cookie: cookie.split(';')[0] || '' } });
    record('GET /api/kits/:id/events', events.res.status === 200 || events.res.status === 404, `status ${events.res.status}`);
  } else {
    record('kit flow', false, 'no kit id from create');
  }

  const logout = await json('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookie.split(';')[0] || '' },
  });
  record('POST /api/auth/logout', logout.res.ok, String(logout.res.status));
} catch (err) {
  record('audit runner', false, err instanceof Error ? err.message : String(err));
}

const failed = results.filter((r) => !r.ok);
console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
