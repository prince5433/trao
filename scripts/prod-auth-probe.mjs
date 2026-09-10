#!/usr/bin/env node
/** Probe production auth without printing secrets/cookies. */
const API = process.env.API_URL || 'https://prep-api-sshw.onrender.com';
const ORIGIN = process.env.ORIGIN || 'https://trao-interview-prep.vercel.app';
const email = `probe-${Date.now()}@example.com`;
const password = 'password12345';

function redact(setCookie) {
  if (!setCookie) return '(none)';
  return setCookie.replace(/=([^;]+)/, '=***');
}

async function main() {
  const reg = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const regBody = await reg.json();
  const regCookie = reg.headers.get('set-cookie');
  console.log('REGISTER', reg.status, regBody.error ? regBody.error.code : 'ok', 'set-cookie:', redact(regCookie));

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  const loginCookie = login.headers.get('set-cookie');
  console.log('LOGIN', login.status, loginBody.error ? loginBody.error.code : 'ok', 'set-cookie:', redact(loginCookie));

  const cookie = loginCookie || regCookie || '';
  const me = await fetch(`${API}/api/auth/me`, {
    headers: { Origin: ORIGIN, Cookie: cookie.split(';')[0] || '' },
    credentials: 'include',
  });
  const meBody = await me.json();
  console.log('ME(with cookie header)', me.status, meBody.error ? meBody.error.code : 'ok');

  const meNoCookie = await fetch(`${API}/api/auth/me`, {
    headers: { Origin: ORIGIN },
    credentials: 'include',
  });
  const meNoBody = await meNoCookie.json();
  console.log('ME(no cookie)', meNoCookie.status, meNoBody.error ? meNoBody.error.code : 'ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
