import express from 'express';
import cookieParser from 'cookie-parser';
import User from '../models/user.js';
import {
  createPasswordResetPlainToken,
  hashPassword,
  hashPasswordResetToken,
  loginWithStore,
  PASSWORD_RESET_TTL_MS,
  registerWithStore,
  resolvePublicAppOrigin,
  signAuthToken,
  validateEmail,
  validatePassword,
  verifyAuthToken,
} from '../lib/authService.js';
import { hasMailTransport, sendPasswordResetEmail } from '../lib/passwordResetMail.js';

const COOKIE_NAME = 'mindmap_auth';

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  };
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
  return { id: String(user._id), email: user.emailLower, name: user.name || '' };
}

export function installAuthCookieParsing(app) {
  app.use(cookieParser());
}

export default function createAuthRouter() {
  const router = express.Router();

  const store = {
    async findUserByEmail(emailLower) {
      return User.findOne({ emailLower });
    },
    async createUser({ emailLower, passwordHash, name }) {
      const u = new User({ emailLower, passwordHash, name: name || '' });
      await u.save();
      return u;
    },
  };

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

  return router;
}

