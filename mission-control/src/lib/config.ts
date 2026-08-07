/**
 * config — resolves where the backend lives.
 *
 * Priority:
 *   1. VITE_API_BASE      — explicit (e.g. https://abyssal-twin...workers.dev)
 *   2. VITE_SSE_URL       — derive the origin from the SSE endpoint
 *   3. "" (same origin)   — dev (vite proxy) or dashboard served beside the API
 *
 * In dev, the Vite server proxies /api to the local Worker (see vite.config.ts),
 * so relative URLs work without CORS. In production the dashboard is often on a
 * different origin than the Worker, so deployments set VITE_API_BASE.
 */
export function apiBase(): string {
  const env = import.meta.env.VITE_API_BASE as string | undefined;
  if (env) return env.replace(/\/+$/, "");
  const sse = import.meta.env.VITE_SSE_URL as string | undefined;
  if (sse) {
    try {
      return new URL(sse).origin;
    } catch {
      /* fall through to relative */
    }
  }
  return "";
}

export function apiUrl(path: string): string {
  return `${apiBase()}${path}`;
}
