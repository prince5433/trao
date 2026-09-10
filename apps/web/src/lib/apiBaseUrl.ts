/**
 * Resolve the API base URL for fetch calls.
 *
 * In the browser we always use same-origin `/api/*` so session cookies stay
 * first-party (Next.js rewrites to API_PROXY_TARGET / Render). Cross-origin
 * requests to Render with `credentials: "include"` fail in modern browsers
 * because third-party session cookies are blocked.
 */
export function resolveApiBaseUrl(
  configuredUrl: string | undefined,
  runtime: 'browser' | 'server',
): string {
  if (runtime === 'browser') {
    return '';
  }
  return configuredUrl?.replace(/\/$/, '') ?? '';
}
