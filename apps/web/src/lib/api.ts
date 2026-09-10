import type { PrepKit } from '@prep/core/browser';

/**
 * Use same-origin `/api/*` by default so session cookies work on Vercel.
 * next.config.js rewrites `/api` to the Render backend (API_PROXY_TARGET).
 * Set NEXT_PUBLIC_API_URL only to bypass the proxy (e.g. local debugging).
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

export type KitSummary = {
  id: string;
  status: string;
  company_url: string;
  days: number;
  role: string;
  company: string;
  updatedAt: string;
  createdAt: string;
};

export type KitRecord = {
  id: string;
  status: string;
  jd: string;
  company_url: string;
  days: number;
  progress: {
    step: string;
    completedSteps: string[];
    errors: string[];
    message: string;
  };
  content: PrepKit | null;
  itemMeta: Record<string, { origin: string; pinned: boolean }>;
  practice: { cards: Record<string, { confidence: number | null; covered: boolean }> };
  researchMeta: Record<string, unknown>;
  warnings: Array<{ code: string; message: string }>;
  error?: { code: string; message: string };
};

export { API_URL };
