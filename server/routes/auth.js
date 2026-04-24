import express from 'express';
import cookieParser from 'cookie-parser';
import User from '../models/user.js';
import {
  createPasswordResetPlainToken,
  GOOGLE_NONCE_TTL_MS,
  hashPassword,
  hashPasswordResetToken,
  loginWithStore,
  PASSWORD_RESET_TTL_MS,
  registerWithStore,
  resolveGoogleUserWithStore,
  resolvePublicAppOrigin,
  signAuthToken,
  validateEmail,
  validatePassword,
  verifyAuthToken,
  verifyLinkGoogleToken,
} from '../lib/authService.js';
import { createGoogleAuthClient } from '../lib/googleAuthClient.js';
import { hasMailTransport, sendPasswordResetEmail } from '../lib/passwordResetMail.js';

const COOKIE_NAME = 'mindmap_auth';
const GOOGLE_NONCE_COOKIE = 'mindmap_google_nonce';

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  };
}

function nonceCookieOptions() {
  return {
    ...cookieOptions(),
    maxAge: GOOGLE_NONCE_TTL_MS,
  };
}

function resolveAllowedHd(env = process.env) {
  const raw = String(env.GOOGLE_OAUTH_ALLOWED_HD || '').trim();
  if (!raw) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Lazy singleton verifier so we only instantiate `google-auth-library` once
 * per process and route-level tests can still inject their own via
 * `createAuthRouter({ googleVerifier })`.
 */
let cachedGoogleVerifier = null;
function defaultGoogleVerifier() {
  if (cachedGoogleVerifier) return cachedGoogleVerifier;
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (!clientId) return null;
  cachedGoogleVerifier = createGoogleAuthClient({
    clientId,
    allowedHd: resolveAllowedHd(),
  });
  return cachedGoogleVerifier;
}

function getTokenFromReq(req) {
  const bearer = req.headers?.authorization;
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
    return bearer.slice('Bearer '.length).trim();
  }
  return req.cookies?.[COOKIE_NAME];
}

async function getAuthenticatedUser(req) {
  const token = getTokenFromReq(req);
  if (!token) {
    return { error: { status: 401, body: { success: false, error: 'Not authenticated', code: 'NOT_AUTHENTICATED' } } };
  }
  try {
    const decoded = verifyAuthToken(token);
    const userId = decoded?.sub ? String(decoded.sub) : null;
    if (!userId) {
      return { error: { status: 401, body: { success: false, error: 'Invalid token', code: 'INVALID_TOKEN' } } };
    }
    const user = await User.findById(userId);
    if (!user) {
      return { error: { status: 401, body: { success: false, error: 'Unknown user', code: 'UNKNOWN_USER' } } };
    }
    return { user };
  } catch {
    return { error: { status: 401, body: { success: false, error: 'Invalid token', code: 'INVALID_TOKEN' } } };
  }
}

function userPublicJson(user) {
  return {
    id: String(user._id),
    email: user.emailLower,
    name: user.name || '',
    avatarUrl: user.avatarUrl || null,
    provider: user.provider || 'password',
  };
}

export function installAuthCookieParsing(app) {
  app.use(cookieParser());
}

/**
 * @param {object} [deps]
 * @param {Function} [deps.googleVerifier] Inject a stubbed verifier for tests; in
 *        production omitted so the router reads GOOGLE_OAUTH_CLIENT_ID and lazily
 *        constructs one. When neither env var is set nor verifier is injected,
 *        the Google endpoints respond 503 so the password flow stays available
 *        for local dev without a Google client id.
 */
export default function createAuthRouter({ googleVerifier = null } = {}) {
  const router = express.Router();

  const store = {
    async findUserByEmail(emailLower) {
      return User.findOne({ emailLower });
    },
    async findUserByGoogleId(googleId) {
      return User.findOne({ googleId });
    },
    async createUser({ emailLower, passwordHash, name }) {
      const u = new User({ emailLower, passwordHash, name: name || '' });
      await u.save();
      return u;
    },
    async createGoogleUser({ emailLower, googleId, name, avatarUrl, emailVerified }) {
      const u = new User({
        emailLower,
        googleId,
        name: name || '',
        avatarUrl: avatarUrl || null,
        emailVerified: emailVerified === true,
        provider: 'google',
        passwordHash: null,
      });
      await u.save();
      return u;
    },
    async updateGoogleUserProfile(user, { name, avatarUrl }) {
      let changed = false;
      if (name !== undefined && name !== user.name) {
        user.name = name;
        changed = true;
      }
      if (avatarUrl !== undefined && avatarUrl !== user.avatarUrl) {
        user.avatarUrl = avatarUrl;
        changed = true;
      }
      if (changed) await user.save();
      return user;
    },
  };

  function getGoogleVerifier() {
    return googleVerifier || defaultGoogleVerifier();
  }

  router.post('/register', async (req, res) => {
    const { email, password, name } = req.body || {};
    const r = await registerWithStore(store, { email, password });
    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: r.error, code: r.code });
    }
    if (typeof name === 'string' && name.trim() !== '') {
      r.user.name = name.trim();
      await r.user.save();
    }
    const token = signAuthToken({ sub: String(r.user._id) });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ success: true, user: userPublicJson(r.user) });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    const r = await loginWithStore(store, { email, password });
    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: r.error, code: r.code });
    }
    const token = signAuthToken({ sub: String(r.user._id) });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ success: true, user: userPublicJson(r.user) });
  });

  router.post('/logout', async (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.json({ success: true });
  });

  router.get('/me', async (req, res) => {
    const result = await getAuthenticatedUser(req);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    return res.json({ success: true, user: userPublicJson(result.user) });
  });

  router.patch('/me', async (req, res) => {
    const result = await getAuthenticatedUser(req);
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }
    const { name } = req.body || {};
    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ success: false, error: 'name must be a string', code: 'INVALID_NAME' });
      }
      const trimmed = name.trim();
      if (trimmed.length > 120) {
        return res.status(400).json({ success: false, error: 'name is too long (max 120)', code: 'INVALID_NAME' });
      }
      result.user.name = trimmed;
      await result.user.save();
    }
    return res.json({ success: true, user: userPublicJson(result.user) });
  });

  const forgotPasswordResponse = {
    success: true,
    message:
      'If an account exists for that email, we sent a reset link. It expires in one hour.',
  };

  router.post('/forgot-password', async (req, res) => {
    const { email } = req.body || {};
    const emailLower = String(email || '').trim().toLowerCase();
    if (!validateEmail(emailLower)) {
      return res.status(400).json({ success: false, error: 'Invalid email', code: 'INVALID_EMAIL' });
    }
    const user = await User.findOne({ emailLower });
    if (!user) {
      return res.json(forgotPasswordResponse);
    }
    const publicOrigin = resolvePublicAppOrigin();
    if (!publicOrigin) {
      console.error(
        '[auth] Password reset skipped: set APP_PUBLIC_ORIGIN to your SPA origin (e.g. https://app.example.com)'
      );
      return res.json(forgotPasswordResponse);
    }
    if (process.env.NODE_ENV === 'production' && !hasMailTransport()) {
      console.error(
        '[auth] Password reset skipped: set SMTP_URL or SMTP_HOST so reset emails can be sent'
      );
      return res.json(forgotPasswordResponse);
    }
    const plainToken = createPasswordResetPlainToken();
    user.passwordResetTokenHash = hashPasswordResetToken(plainToken);
    user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save();
    const resetUrl = `${publicOrigin}/reset-password?token=${encodeURIComponent(plainToken)}`;
    try {
      await sendPasswordResetEmail({ to: emailLower, resetUrl });
    } catch (e) {
      console.error('[auth] Password reset email failed', e);
      user.passwordResetTokenHash = null;
      user.passwordResetExpiresAt = null;
      await user.save();
    }
    return res.json(forgotPasswordResponse);
  });

  router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Reset token is required',
        code: 'TOKEN_REQUIRED',
      });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
        code: 'INVALID_PASSWORD',
      });
    }
    const tokenHash = hashPasswordResetToken(token.trim());
    if (!tokenHash) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset link',
        code: 'INVALID_RESET_TOKEN',
      });
    }
    const now = new Date();
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: now },
    });
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset link',
        code: 'INVALID_RESET_TOKEN',
      });
    }
    user.passwordHash = await hashPassword(password);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();
    const jwt = signAuthToken({ sub: String(user._id) });
    res.cookie(COOKIE_NAME, jwt, cookieOptions());
    return res.json({ success: true, user: userPublicJson(user) });
  });

  // --- #102 Google Sign-In (GIS) -----------------------------------------

  /**
   * Issue a one-shot nonce the client forwards to GIS init; we verify the
   * signed ID token's `nonce` claim matches this cookie to prevent replay of
   * a captured credential. Cookie is httpOnly + short-lived (5 min).
   */
  router.post('/google/nonce', (_req, res) => {
    const nonce = createPasswordResetPlainToken(); // same crypto; 32 bytes
    res.cookie(GOOGLE_NONCE_COOKIE, nonce, nonceCookieOptions());
    return res.json({ success: true, nonce });
  });

  /**
   * Verify a Google ID token and route to one of three outcomes:
   *   - `existing-google` → reissue our session cookie.
   *   - `link-required`  → return 409 + a short-lived `linkToken` the client
   *                        presents back at /google/link after user consent.
   *   - `new`            → provision a Google-provider user and issue session.
   *
   * Dev fallback: when GOOGLE_OAUTH_CLIENT_ID is unset and no verifier is
   * injected, return 503 GOOGLE_SIGN_IN_DISABLED so the client can hide the
   * Google button cleanly instead of crashing.
   */
  router.post('/google', async (req, res) => {
    const verifier = getGoogleVerifier();
    if (!verifier) {
      return res.status(503).json({
        success: false,
        error: 'Google Sign-In is not configured on this server',
        code: 'GOOGLE_SIGN_IN_DISABLED',
      });
    }
    const credential = req.body?.credential;
    const nonceFromBody = typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : '';
    const nonceFromCookie = typeof req.cookies?.[GOOGLE_NONCE_COOKIE] === 'string'
      ? req.cookies[GOOGLE_NONCE_COOKIE].trim()
      : '';
    // Require the nonce to round-trip through our short-lived cookie. This
    // protects us when the same credential would otherwise be replayable.
    const expectedNonce = nonceFromCookie && nonceFromBody && nonceFromCookie === nonceFromBody
      ? nonceFromCookie
      : null;
    if (nonceFromBody && !expectedNonce) {
      return res.status(401).json({ success: false, error: 'Nonce mismatch', code: 'GOOGLE_NONCE_MISMATCH' });
    }

    const verified = await verifier({ credential, expectedNonce });
    if (!verified.ok) {
      return res.status(verified.status || 401).json({
        success: false,
        error: verified.error,
        code: verified.code,
      });
    }

    const resolved = await resolveGoogleUserWithStore(store, { payload: verified.payload });
    if (!resolved.ok) {
      return res.status(resolved.status || 500).json({
        success: false,
        error: resolved.error,
        code: resolved.code,
      });
    }

    // Clear nonce cookie once consumed; one-shot.
    res.clearCookie(GOOGLE_NONCE_COOKIE, cookieOptions());

    if (resolved.outcome === 'link-required') {
      return res.status(409).json({
        success: false,
        code: 'LINK_REQUIRED',
        error:
          'An account with this email already exists. Confirm to link your Google account to it.',
        linkToken: resolved.linkToken,
        email: resolved.emailLower,
      });
    }

    const token = signAuthToken({ sub: String(resolved.user._id) });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({
      success: true,
      outcome: resolved.outcome, // 'existing-google' | 'new'
      user: userPublicJson(resolved.user),
    });
  });

  /**
   * Finalize the link after the user explicitly confirmed in the UI. We verify
   * the signed link token, ensure the referenced user still exists and has no
   * conflicting googleId, and write `googleId` / `avatarUrl` onto the row.
   */
  router.post('/google/link', async (req, res) => {
    const { linkToken } = req.body || {};
    if (typeof linkToken !== 'string' || linkToken.trim() === '') {
      return res.status(400).json({ success: false, error: 'Link token is required', code: 'LINK_TOKEN_REQUIRED' });
    }
    const decoded = verifyLinkGoogleToken(linkToken.trim());
    if (!decoded.ok) {
      return res.status(400).json({ success: false, error: decoded.error, code: decoded.code });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found', code: 'UNKNOWN_USER' });
    }
    if (user.googleId && user.googleId !== decoded.googleSub) {
      return res.status(409).json({
        success: false,
        error: 'Account is already linked to a different Google identity',
        code: 'GOOGLE_ID_CONFLICT',
      });
    }
    // Extra safety: if somebody else beat us to the Google sub.
    const otherWithSameGoogleId = await User.findOne({ googleId: decoded.googleSub });
    if (otherWithSameGoogleId && String(otherWithSameGoogleId._id) !== String(user._id)) {
      return res.status(409).json({
        success: false,
        error: 'This Google identity is already linked to a different account',
        code: 'GOOGLE_ID_CONFLICT',
      });
    }
    user.googleId = decoded.googleSub;
    user.emailVerified = true;
    await user.save();
    const token = signAuthToken({ sub: String(user._id) });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ success: true, user: userPublicJson(user) });
  });

  /**
   * Dual action on sign-out: always clears our session + nonce cookies.
   * Client is responsible for calling `google.accounts.id.disableAutoSelect()`
   * so GIS doesn't silently re-sign on the next page load.
   */
  router.post('/google/revoke', async (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.clearCookie(GOOGLE_NONCE_COOKIE, cookieOptions());
    return res.json({ success: true });
  });

  return router;
}

