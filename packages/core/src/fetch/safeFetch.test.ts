import { describe, expect, it } from 'vitest';
import { assertSafeUrl } from './safeFetch.js';

describe('assertSafeUrl production SSRF', () => {
  it('blocks loopback when localhost not allowed', async () => {
    await expect(assertSafeUrl('http://127.0.0.1:4000/', false)).rejects.toMatchObject({
      code: 'SSRF_BLOCKED',
    });
    await expect(assertSafeUrl('http://localhost/', false)).rejects.toMatchObject({
      code: 'SSRF_BLOCKED',
    });
  });

  it('allows loopback when explicitly enabled for fixtures', async () => {
    const url = await assertSafeUrl('http://127.0.0.1:8765/', true);
    expect(url.hostname).toBe('127.0.0.1');
  });

  it('rejects non-http protocols', async () => {
    await expect(assertSafeUrl('file:///etc/passwd', false)).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
  });
});
