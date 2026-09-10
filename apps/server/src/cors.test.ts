import { describe, expect, it } from 'vitest';
import { parseClientOrigins } from './config.js';

describe('parseClientOrigins', () => {
  it('parses comma-separated origins and strips trailing slashes', () => {
    expect(parseClientOrigins('https://a.vercel.app/, https://b.vercel.app')).toEqual([
      'https://a.vercel.app',
      'https://b.vercel.app',
    ]);
  });
});
