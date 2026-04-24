/**
 * Google Identity Services (GIS) integration helpers (#102).
 *
 * The GIS script is loaded async+defer in `public/index.html`. On slow networks
 * it may not be ready when `AuthProvider` mounts; `waitForGoogleIdentity()`
 * polls briefly and resolves once `window.google.accounts.id` is available.
 *
 * Nonce handling: we round-trip a per-sign-in nonce through our own
 * `/api/auth/google/nonce` endpoint (which sets the `mindmap_google_nonce`
 * httpOnly cookie) so GIS's `nonce` init option and our server verification
 * read the same value. The cookie is short-lived (5min).
 */

export function getGoogleClientId() {
  const raw = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isGoogleSignInConfigured() {
  return getGoogleClientId() !== '';
}

/**
 * @returns {boolean} True if the GIS script has finished loading and mounted the
 *   `google.accounts.id` namespace on `window`.
 */
export function isGoogleIdentityReady() {
  if (typeof window === 'undefined') return false;
  const g = window.google;
  return Boolean(g && g.accounts && g.accounts.id && typeof g.accounts.id.initialize === 'function');
}

const DEFAULT_POLL_INTERVAL_MS = 60;
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Resolve once GIS is ready, or reject after `timeoutMs`. Does not load the
 * script; the script tag in `public/index.html` is responsible for that.
 */
export function waitForGoogleIdentity({ timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (isGoogleIdentityReady()) {
      resolve(window.google.accounts.id);
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (isGoogleIdentityReady()) {
        resolve(window.google.accounts.id);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Google Identity Services script did not load in time'));
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
