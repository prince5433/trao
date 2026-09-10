import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Normalize and parse comma-separated browser origins (no trailing slash). */
export function parseClientOrigins(raw?: string, fallback = 'http://localhost:3000'): string[] {
  const values = (raw ?? fallback)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));
  return values.length > 0 ? values : [fallback.replace(/\/$/, '')];
}

const clientOrigins = parseClientOrigins(process.env.CLIENT_ORIGIN);

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/interview-prep-kit'),
  sessionSecret: required('SESSION_SECRET', 'dev-session-secret-change-me'),
  clientOrigins,
  /** Primary origin (first listed) for backwards compatibility. */
  clientOrigin: clientOrigins[0],
  allowLocalhostFetch: process.env.ALLOW_LOCALHOST_FETCH === 'true',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
};
