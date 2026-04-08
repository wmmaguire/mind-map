import express from 'express';
import cookieParser from 'cookie-parser';
import User from '../models/user.js';
import { loginWithStore, registerWithStore, signAuthToken, verifyAuthToken } from '../lib/authService.js';

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
    return res.json({ success: true, user: { id: String(r.user._id), email: r.user.emailLower, name: r.user.name || '' } });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    const r = await loginWithStore(store, { email, password });
    if (!r.ok) {
      return res.status(r.status).json({ success: false, error: r.error, code: r.code });
    }
    const token = signAuthToken({ sub: String(r.user._id) });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ success: true, user: { id: String(r.user._id), email: r.user.emailLower, name: r.user.name || '' } });
  });

  router.post('/logout', async (_req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.json({ success: true });
  });

  router.get('/me', async (req, res) => {
    const token = getTokenFromReq(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
    }
    try {
      const decoded = verifyAuthToken(token);
      const userId = decoded?.sub ? String(decoded.sub) : null;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unknown user', code: 'UNKNOWN_USER' });
      }
      return res.json({ success: true, user: { id: String(user._id), email: user.emailLower, name: user.name || '' } });
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
  });

  return router;
}

