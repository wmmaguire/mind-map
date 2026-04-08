import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

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
 * - findUserByEmail(emailLower) -> user | null (must include passwordHash)
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
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { ok: false, status: 401, code: 'INVALID_CREDENTIALS', error: 'Invalid credentials' };
  }
  return { ok: true, user };
}

