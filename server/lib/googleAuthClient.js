/**
 * Google Identity Services (GIS) ID-token verifier wrapper (#102).
 *
 * Responsibilities:
 *   - Validate `aud` (client id), `iss` (accounts.google.com / https://accounts.google.com),
 *     `exp`, and an optional expected `nonce` (replay protection).
 *   - Normalize the returned payload into the shape our store layer consumes.
 *
 * Design:
 *   - Accepts an injectable `verifyIdTokenFn` so tests exercise the full code path
 *     without a real Google client id or network round-trip. In production the
 *     factory lazily constructs an `OAuth2Client` from `google-auth-library`.
 *   - Pure returning `{ ok, payload }` / `{ ok:false, code, error }` so callers
 *     don't need try/catch boilerplate.
 */

const ALLOWED_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/**
 * Build a verifier closed over the configured client id + optional HD allow-list.
 *
 * @param {object} opts
 * @param {string} opts.clientId - GOOGLE_OAUTH_CLIENT_ID; required.
 * @param {string[]} [opts.allowedHd] - optional Google Workspace domain allow-list.
 * @param {(args: {idToken: string, audience: string}) => Promise<{getPayload: () => object}>} [opts.verifyIdTokenFn]
 *        Inject a stub in tests; production default lazily imports google-auth-library.
 * @returns {(args: {credential: string, expectedNonce?: string|null}) => Promise<
 *   {ok: true, payload: GooglePayload} | {ok: false, status: number, code: string, error: string}
 * >}
 */
export function createGoogleAuthClient({ clientId, allowedHd = null, verifyIdTokenFn = null } = {}) {
  if (typeof clientId !== 'string' || clientId.trim() === '') {
    throw new Error('createGoogleAuthClient: clientId is required');
  }
  const normalizedHd = Array.isArray(allowedHd) && allowedHd.length
    ? new Set(allowedHd.map((d) => String(d).trim().toLowerCase()).filter(Boolean))
    : null;

  const verify = verifyIdTokenFn || (async ({ idToken, audience }) => {
    const mod = await import('google-auth-library');
    const OAuth2Client = mod.OAuth2Client || mod.default?.OAuth2Client;
    const client = new OAuth2Client(audience);
    return client.verifyIdToken({ idToken, audience });
  });

  return async function verifyGoogleCredential({ credential, expectedNonce = null }) {
    if (typeof credential !== 'string' || credential.trim() === '') {
      return { ok: false, status: 400, code: 'CREDENTIAL_REQUIRED', error: 'Google credential is required' };
    }

    let ticket;
    try {
      ticket = await verify({ idToken: credential, audience: clientId });
    } catch (e) {
      return { ok: false, status: 401, code: 'INVALID_GOOGLE_CREDENTIAL', error: e?.message || 'Invalid Google credential' };
    }

    const payload = typeof ticket?.getPayload === 'function' ? ticket.getPayload() : ticket;
    if (!payload || typeof payload !== 'object') {
      return { ok: false, status: 401, code: 'INVALID_GOOGLE_CREDENTIAL', error: 'Malformed Google credential' };
    }

    if (!ALLOWED_ISSUERS.has(String(payload.iss || ''))) {
      return { ok: false, status: 401, code: 'INVALID_GOOGLE_ISSUER', error: 'Untrusted token issuer' };
    }
    if (String(payload.aud || '') !== clientId) {
      return { ok: false, status: 401, code: 'INVALID_GOOGLE_AUDIENCE', error: 'Token audience does not match' };
    }
    if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
      return { ok: false, status: 401, code: 'INVALID_GOOGLE_SUBJECT', error: 'Token missing subject' };
    }
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (email === '') {
      return { ok: false, status: 401, code: 'GOOGLE_EMAIL_REQUIRED', error: 'Token missing email claim' };
    }
    if (expectedNonce) {
      if (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce) {
        return { ok: false, status: 401, code: 'GOOGLE_NONCE_MISMATCH', error: 'Nonce mismatch' };
      }
    }
    if (normalizedHd) {
      const hd = String(payload.hd || '').trim().toLowerCase();
      if (!hd || !normalizedHd.has(hd)) {
        return { ok: false, status: 403, code: 'GOOGLE_HD_NOT_ALLOWED', error: 'Google Workspace domain is not permitted' };
      }
    }

    return {
      ok: true,
      payload: {
        sub: payload.sub,
        email,
        emailVerified: payload.email_verified === true,
        name: typeof payload.name === 'string' ? payload.name : '',
        picture: typeof payload.picture === 'string' ? payload.picture : '',
        hd: typeof payload.hd === 'string' ? payload.hd : null,
      },
    };
  };
}

/**
 * @typedef {object} GooglePayload
 * @property {string} sub
 * @property {string} email
 * @property {boolean} emailVerified
 * @property {string} name
 * @property {string} picture
 * @property {string|null} hd
 */
