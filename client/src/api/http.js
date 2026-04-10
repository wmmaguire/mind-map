import { apiUrl } from '../config';

/**
 * Normalized API failure (non-2xx or unreachable server).
 * `status` 0 means a network / fetch failure before an HTTP response.
 */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, code?: string, details?: string, body?: object, cause?: Error }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = meta.status ?? 0;
    this.code = meta.code;
    this.details = meta.details;
    this.body = meta.body;
    if (meta.cause) {
      this.cause = meta.cause;
    }
  }
}

export function getApiErrorMessage(err) {
  if (err instanceof ApiError) return err.message;
  return err?.message || 'Something went wrong';
}

/** True when the browser could not reach the server (no HTTP response). */
export function isNetworkError(err) {
  return err instanceof ApiError && err.status === 0;
}

/**
 * Optional MindMap auth for user-scoped listing and writes (GitHub #32 / #33).
 * Never log or persist tokens in client code — pass stable user ids only.
 *
 * @param {Headers} headers
 * @param {{ userId?: string | null }} [auth]
 */
export function applyMindmapAuthHeaders(headers, auth) {
  if (!auth?.userId) return;
  headers.set('X-Mindmap-User-Id', auth.userId);
}

/**
 * Shared JSON API client using {@link apiUrl} and consistent error bodies (`error`, `details`, `code`).
 *
 * @param {string} path - e.g. `/api/files` (prepends API origin) or absolute URL
 * @param {RequestInit & { json?: object, auth?: { userId?: string | null } }} [options] - pass `json` to set body and `Content-Type` (omit for FormData); `auth` adds `X-Mindmap-User-Id` when `userId` is set
 * @returns {Promise<object>} Parsed JSON body (empty object if no JSON)
 */
export async function apiRequest(path, options = {}) {
  const { json, auth, ...init } = options;
  const headers = new Headers(init.headers || {});
  applyMindmapAuthHeaders(headers, auth);
  let body = init.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const url = path.startsWith('http') ? path : apiUrl(path);

  let response;
  try {
    response = await fetch(url, { ...init, headers, body, credentials: 'include' });
  } catch (e) {
    const msg =
      e?.message === 'Failed to fetch' || e?.name === 'TypeError'
        ? 'Cannot reach the API server. Start it on port 5001 (from the repo root: `npm run dev`, or `cd server && npm run dev`). Open the app at http://localhost:3000.'
        : e?.message || 'Network error';
    throw new ApiError(msg, { status: 0, cause: e });
  }

  if (response.status === 204) {
    return {};
  }

  const ct = response.headers.get('content-type') || '';
  let data = {};

  if (ct.includes('application/json')) {
    const text = await response.text();
    if (text.length === 0) {
      data = {};
    } else {
      try {
        data = JSON.parse(text);
      } catch {
        data = { _parseError: true };
      }
    }
  } else {
    const text = await response.text();
    data = { _raw: text };
  }

  if (!response.ok) {
    const detail =
      (typeof data === 'object' &&
        data !== null &&
        (data.details || data.message || data.error)) ||
      (typeof data === 'object' && data._raw) ||
      `HTTP ${response.status}`;
    const msg =
      typeof detail === 'string'
        ? detail
        : (() => {
          try {
            return JSON.stringify(detail);
          } catch {
            return String(detail);
          }
        })();
    throw new ApiError(msg, {
      status: response.status,
      code: typeof data === 'object' && data?.code,
      details: typeof data === 'object' && data?.details,
      body: data,
    });
  }

  return data;
}
