import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

/** One-time password reset link lifetime (email link). */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Short-lived JWT used to confirm Google ↔ password account linking (#102).
 * The client hits /api/auth/google/link with this token after the user explicitly
 * confirms "Link your Google account?" in the UI. Five minutes is enough for a
 * modal round-trip without leaving a large replay window.
 */
export const LINK_GOOGLE_TOKEN_TTL_SECONDS = 5 * 60;

/**
 * Short-lived httpOnly cookie holding the per-page Google One Tap nonce (#102).
 * Server verifies the ID token's `nonce` claim matches this cookie so an
 * attacker can't replay a captured Google credential at our endpoint.
 */
export const GOOGLE_NONCE_TTL_MS = 5 * 60 * 1000;

export function createPasswordResetPlainToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(plainToken) {
  if (typeof plainToken !== 'string' || plainToken.length < 16) {
    return '';
  }
  return crypto.createHash('sha256').update(plainToken, 'utf8').digest('hex');
}

/**
 * Public SPA origin for links in outbound email (no trailing slash).
 * Set **APP_PUBLIC_ORIGIN** in production (e.g. `https://mindmap.example.com`).
 */
export function resolvePublicAppOrigin(env = process.env) {
  const raw = (env.APP_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (raw) return raw;
  if (env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }
  return '';
}

export function getAuthConfig(env = process.env) {
  const secret = (env.AUTH_JWT_SECRET || '').trim();
  const isProd = env.NODE_ENV === 'production';
  if (isProd && !secret) {
    throw new Error('AUTH_JWT_SECRET must be set in production');
  }
  return {
    jwtSecret: secret || 'dev-insecure-secret',
    tokenTtlSeconds: parseInt(env.AUTH_TOKEN_TTL_SECONDS || '', 10) || DEFAULT_TOKEN_TTL_SECONDS
  };
}

export async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function signAuthToken(payload, env = process.env) {
  const { jwtSecret, tokenTtlSeconds } = getAuthConfig(env);
  return jwt.sign(payload, jwtSecret, { expiresIn: tokenTtlSeconds });
}

export function verifyAuthToken(token, env = process.env) {
  const { jwtSecret } = getAuthConfig(env);
  return jwt.verify(token, jwtSecret);
}

export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const s = email.trim().toLowerCase();
  if (s.length < 3 || s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function validatePassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 256;
}

/**
 * Store interface:
 * - findUserByEmail(emailLower) -> user | null
 * - createUser({ emailLower, passwordHash }) -> user
 */
export async function registerWithStore(store, { email, password }) {
  const emailLower = String(email || '').trim().toLowerCase();
  if (!validateEmail(emailLower)) {
    return { ok: false, status: 400, code: 'INVALID_EMAIL', error: 'Invalid email' };
  }
  if (!validatePassword(password)) {
    return { ok: false, status: 400, code: 'INVALID_PASSWORD', error: 'Password must be at least 8 characters' };
  }

  const existing = await store.findUserByEmail(emailLower);
  if (existing) {
    return { ok: false, status: 409, code: 'EMAIL_EXISTS', error: 'Email already registered' };
  }

  const passwordHash = await hashPassword(password);
  const user = await store.createUser({ emailLower, passwordHash });
  return { ok: true, user };
}

/**
 * Store interface:
 * - findUserByEmail(emailLower) -> user | null (must include passwordHash, provider)
 */
export async function loginWithStore(store, { email, password }) {
  const emailLower = String(email || '').trim().toLowerCase();
  if (!validateEmail(emailLower)) {
    return { ok: false, status: 400, code: 'INVALID_EMAIL', error: 'Invalid email' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, status: 400, code: 'PASSWORD_REQUIRED', error: 'Password is required' };
  }
  const user = await store.findUserByEmail(emailLower);
  if (!user) {
    return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid credentials' };
  }
  // #102 — Google-only accounts (no password set) must be steered to the Google
  // sign-in button; a generic INVALID_CREDENTIALS would be confusing and would
  // also leak account existence via timing (bcrypt runs on user.passwordHash).
  if (user.provider === 'google' && (!user.passwordHash || user.passwordHash === '')) {
    return {
      ok: false,
      status: 400,
      code: 'USE_GOOGLE_SIGN_IN',
      error: 'This account was created with Google. Please sign in with Google.',
    };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid credentials' };
  }
  return { ok: true, user };
}

/**
 * Issue a short-lived signed token that proves a user ↔ Google subject binding
 * was presented to the client. The client must present it back with explicit
 * consent for us to write `googleId` onto the existing password row (#102).
 *
 * The token is not stored server-side (stateless): `verifyLinkGoogleToken` only
 * accepts the token if its bound `googleSub` matches what the client claims on
 * the /link endpoint, protecting against a replay with a different Google user.
 */
export function signLinkGoogleToken({ userId, googleSub, emailLower }, env = process.env) {
  const { jwtSecret } = getAuthConfig(env);
  return jwt.sign(
    { purpose: 'link-google', sub: String(userId), gsub: String(googleSub), em: emailLower },
    jwtSecret,
    { expiresIn: LINK_GOOGLE_TOKEN_TTL_SECONDS }
  );
}

export function verifyLinkGoogleToken(token, env = process.env) {
  try {
    const { jwtSecret } = getAuthConfig(env);
    const decoded = jwt.verify(token, jwtSecret);
    if (!decoded || decoded.purpose !== 'link-google') {
      return { ok: false, code: 'INVALID_LINK_TOKEN', error: 'Invalid link token' };
    }
    if (typeof decoded.sub !== 'string' || typeof decoded.gsub !== 'string') {
      return { ok: false, code: 'INVALID_LINK_TOKEN', error: 'Invalid link token' };
    }
    return { ok: true, userId: decoded.sub, googleSub: decoded.gsub, emailLower: decoded.em || '' };
  } catch (e) {
    return { ok: false, code: 'INVALID_LINK_TOKEN', error: e?.message || 'Invalid link token' };
  }
}

/**
 * Resolve a verified Google payload to one of four outcomes:
 *   - `existing-google`: row with matching googleId exists → just re-issue session.
 *     (also patches avatarUrl/name from payload if they changed.)
 *   - `link-required`: password row with matching email exists but no googleId →
 *     client must show a confirm dialog before we mutate the row. Returns a
 *     signed link token to present back at /api/auth/google/link.
 *   - `new`: no matching row → create a fresh google-provider user.
 *   - `error`: store failure bubbles up as a generic 500.
 *
 * Store interface (#102 additions):
 *   - findUserByGoogleId(googleId) -> user | null
 *   - findUserByEmail(emailLower) -> user | null
 *   - createGoogleUser({ emailLower, googleId, name, avatarUrl, emailVerified }) -> user
 *   - updateGoogleUserProfile(user, { name?, avatarUrl? }) -> user (may be a no-op)
 *
 * Pure store-shape so tests don't need Mongo (matches register/loginWithStore).
 */
export async function resolveGoogleUserWithStore(store, { payload }, env = process.env) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, status: 400, code: 'INVALID_PAYLOAD', error: 'Missing verified Google payload' };
  }
  const googleId = String(payload.sub || '').trim();
  const emailLower = String(payload.email || '').trim().toLowerCase();
  if (googleId === '' || emailLower === '') {
    return { ok: false, status: 400, code: 'INVALID_PAYLOAD', error: 'Google payload missing sub/email' };
  }

  try {
    const byGoogle = await store.findUserByGoogleId(googleId);
    if (byGoogle) {
      let user = byGoogle;
      const patch = {};
      if (payload.name && payload.name !== byGoogle.name) patch.name = payload.name;
      if (payload.picture && payload.picture !== byGoogle.avatarUrl) patch.avatarUrl = payload.picture;
      if (Object.keys(patch).length > 0 && typeof store.updateGoogleUserProfile === 'function') {
        user = await store.updateGoogleUserProfile(byGoogle, patch);
      }
      return { ok: true, outcome: 'existing-google', user };
    }

    const byEmail = await store.findUserByEmail(emailLower);
    if (byEmail) {
      // Existing password user; never auto-link — prevents silent takeover where
      // someone registers `victim@gmail.com` via Google first and we merge the
      // existing password row on a later sign-in.
      const linkToken = signLinkGoogleToken({
        userId: String(byEmail._id || byEmail.id),
        googleSub: googleId,
        emailLower,
      }, env);
      return {
        ok: true,
        outcome: 'link-required',
        user: byEmail,
        linkToken,
        emailLower,
      };
    }

    const created = await store.createGoogleUser({
      emailLower,
      googleId,
      name: payload.name || '',
      avatarUrl: payload.picture || null,
      emailVerified: payload.emailVerified === true,
    });
    return { ok: true, outcome: 'new', user: created };
  } catch (err) {
    return { ok: false, status: 500, code: 'GOOGLE_RESOLVE_FAILED', error: err?.message || 'Failed to resolve Google user' };
  }
}

