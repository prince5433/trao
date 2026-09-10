import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from './apiBaseUrl';

describe('resolveApiBaseUrl', () => {
  it('forces same-origin proxy in the browser even when NEXT_PUBLIC_API_URL is set', () => {
    expect(resolveApiBaseUrl('https://prep-api-sshw.onrender.com', 'browser')).toBe('');
    expect(resolveApiBaseUrl('https://prep-api-sshw.onrender.com/', 'browser')).toBe('');
  });

  it('uses configured URL on the server when provided', () => {
    expect(resolveApiBaseUrl('https://prep-api-sshw.onrender.com', 'server')).toBe(
      'https://prep-api-sshw.onrender.com',
    );
  });

  it('defaults to empty string on the server when unset', () => {
    expect(resolveApiBaseUrl(undefined, 'server')).toBe('');
  });
});
