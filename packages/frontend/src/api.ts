/**
 * API client. The app is served same-origin with the API (Vite proxy in dev,
 * Vercel rewrites in production) so the session cookie can stay
 * sameSite=strict. VITE_API_URL exists for non-proxied setups; note that a
 * cross-site API breaks strict cookies by design.
 *
 * Every state-changing request echoes the CSRF cookie in the x-csrf-token
 * header (double-submit pattern).
 */
const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const CSRF_COOKIE = 'sentinel_csrf';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function ensureCsrfToken(): Promise<string> {
  let token = readCookie(CSRF_COOKIE);
  if (!token) {
    await fetch(`${API_BASE}/api/csrf`, { credentials: 'include' });
    token = readCookie(CSRF_COOKIE);
  }
  return token ?? '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrfToken();

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

/**
 * Multipart upload (CSV import). The browser sets the multipart boundary
 * itself, so no Content-Type header here; the CSRF token is echoed exactly
 * like JSON mutations.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'x-csrf-token': await ensureCsrfToken() },
    credentials: 'include',
    body: form,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}
