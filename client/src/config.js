/**
 * Backend API origin — single place to configure how the SPA reaches the server.
 *
 * - **REACT_APP_API_URL** — optional. Set in `.env` / CI when the API is not
 *   same-origin as the built app (no trailing slash), e.g. `https://api.example.com`.
 * - If unset in production builds, the empty origin yields **relative** URLs
 *   (`/api/...`), which match a co-hosted API.
 * - In development (`npm start`), defaults to **`http://localhost:5001`** (direct to the
 *   API; CORS allows `http://localhost:3000`). The `proxy` field in `package.json` is a
 *   fallback only. Override with **`REACT_APP_API_URL`** if needed.
 */
export function getApiOrigin() {
  const fromEnv = process.env.REACT_APP_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.trim().replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5001';
  }
  return '';
}

/**
 * Full URL for an API path. `path` must start with `/`, e.g. `/api/upload`.
 */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${p}`;
}
