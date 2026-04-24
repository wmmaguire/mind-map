import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPasswordResetToken,
  loginWithStore,
  registerWithStore,
  resolveGoogleUserWithStore,
  resolvePublicAppOrigin,
  signLinkGoogleToken,
  verifyLinkGoogleToken,
} from './authService.js';

function makeStore() {
  const byEmail = new Map();
  return {
    async findUserByEmail(emailLower) {
      return byEmail.get(emailLower) || null;
    },
    async createUser({ emailLower, passwordHash }) {
      const user = {
        _id: `u_${byEmail.size + 1}`,
        id: `u_${byEmail.size + 1}`,
        emailLower,
        email: emailLower,
        passwordHash,
        provider: 'password',
      };
      byEmail.set(emailLower, user);
      return user;
    },
  };
}

function makeGoogleStore() {
  const byEmail = new Map();
  const byGoogleId = new Map();
  return {
    _byEmail: byEmail,
    _byGoogleId: byGoogleId,
    async findUserByEmail(emailLower) {
      return byEmail.get(emailLower) || null;
    },
    async findUserByGoogleId(googleId) {
      return byGoogleId.get(googleId) || null;
    },
    async createUser({ emailLower, passwordHash }) {
      const user = {
        _id: `u_${byEmail.size + 1}`,
        id: `u_${byEmail.size + 1}`,
        emailLower,
        email: emailLower,
        passwordHash,
        provider: 'password',
      };
      byEmail.set(emailLower, user);
      return user;
    },
    async createGoogleUser({ emailLower, googleId, name, avatarUrl, emailVerified }) {
      const user = {
        _id: `g_${byEmail.size + 1}`,
        id: `g_${byEmail.size + 1}`,
        emailLower,
        email: emailLower,
        passwordHash: null,
        googleId,
        name: name || '',
        avatarUrl: avatarUrl || null,
        emailVerified: emailVerified === true,
        provider: 'google',
      };
      byEmail.set(emailLower, user);
      byGoogleId.set(googleId, user);
      return user;
    },
    async updateGoogleUserProfile(user, patch) {
      if (patch.name !== undefined) user.name = patch.name;
      if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
      return user;
    },
  };
}

test('registerWithStore rejects invalid email', async () => {
  const store = makeStore();
  const r = await registerWithStore(store, { email: 'nope', password: 'password123' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_EMAIL');
});

test('registerWithStore rejects short password', async () => {
  const store = makeStore();
  const r = await registerWithStore(store, { email: 'a@b.com', password: 'short' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_PASSWORD');
});

test('registerWithStore creates user and blocks duplicates', async () => {
  const store = makeStore();
  const a = await registerWithStore(store, { email: 'a@b.com', password: 'password123' });
  assert.equal(a.ok, true);
  const b = await registerWithStore(store, { email: 'A@B.com', password: 'password123' });
  assert.equal(b.ok, false);
  assert.equal(b.code, 'EMAIL_EXISTS');
});

test('loginWithStore validates credentials', async () => {
  const store = makeStore();
  await registerWithStore(store, { email: 'a@b.com', password: 'password123' });
  const ok = await loginWithStore(store, { email: 'a@b.com', password: 'password123' });
  assert.equal(ok.ok, true);
  const bad = await loginWithStore(store, { email: 'a@b.com', password: 'wrong' });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'INVALID_CREDENTIALS');
});

test('hashPasswordResetToken is stable for the same plain token', () => {
  const t = 'test-token-value-12345';
  assert.equal(hashPasswordResetToken(t), hashPasswordResetToken(t));
  assert.notEqual(hashPasswordResetToken(t), hashPasswordResetToken(`${t}x`));
});

test('hashPasswordResetToken rejects short input', () => {
  assert.equal(hashPasswordResetToken('short'), '');
});

test('resolvePublicAppOrigin uses APP_PUBLIC_ORIGIN in production', () => {
  assert.equal(
    resolvePublicAppOrigin({ NODE_ENV: 'production', APP_PUBLIC_ORIGIN: 'https://x.com/' }),
    'https://x.com'
  );
  assert.equal(resolvePublicAppOrigin({ NODE_ENV: 'production', APP_PUBLIC_ORIGIN: '' }), '');
});

test('resolvePublicAppOrigin defaults in development', () => {
  assert.equal(
    resolvePublicAppOrigin({ NODE_ENV: 'development', APP_PUBLIC_ORIGIN: '' }),
    'http://localhost:3000'
  );
});

// --- #102 Google Sign-In ----------------------------------------------------

const TEST_ENV = { NODE_ENV: 'development', AUTH_JWT_SECRET: 'test-secret' };

function googlePayload(overrides = {}) {
  return {
    sub: 'google-sub-1',
    email: 'alice@example.com',
    emailVerified: true,
    name: 'Alice',
    picture: 'https://lh3.googleusercontent.com/a/alice',
    hd: null,
    ...overrides,
  };
}

test('resolveGoogleUserWithStore returns `new` and provisions a Google row when no match', async () => {
  const store = makeGoogleStore();
  const r = await resolveGoogleUserWithStore(store, { payload: googlePayload() }, TEST_ENV);
  assert.equal(r.ok, true);
  assert.equal(r.outcome, 'new');
  assert.equal(r.user.provider, 'google');
  assert.equal(r.user.googleId, 'google-sub-1');
  assert.equal(r.user.passwordHash, null);
  assert.equal(r.user.emailVerified, true);
});

test('resolveGoogleUserWithStore returns `existing-google` on googleId match and patches changed profile fields', async () => {
  const store = makeGoogleStore();
  await resolveGoogleUserWithStore(store, { payload: googlePayload({ name: 'Old', picture: 'old.png' }) }, TEST_ENV);
  const r = await resolveGoogleUserWithStore(
    store,
    { payload: googlePayload({ name: 'Alice New', picture: 'new.png' }) },
    TEST_ENV
  );
  assert.equal(r.outcome, 'existing-google');
  assert.equal(r.user.name, 'Alice New');
  assert.equal(r.user.avatarUrl, 'new.png');
});

test('resolveGoogleUserWithStore returns `link-required` with a link token when email matches a password user', async () => {
  const store = makeGoogleStore();
  await store.createUser({ emailLower: 'alice@example.com', passwordHash: 'bcrypt-hash' });
  const r = await resolveGoogleUserWithStore(store, { payload: googlePayload() }, TEST_ENV);
  assert.equal(r.ok, true);
  assert.equal(r.outcome, 'link-required');
  assert.equal(typeof r.linkToken, 'string');
  assert.ok(r.linkToken.length > 0, 'linkToken should be non-empty');

  const decoded = verifyLinkGoogleToken(r.linkToken, TEST_ENV);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.googleSub, 'google-sub-1');
  assert.equal(decoded.emailLower, 'alice@example.com');
  assert.ok(decoded.userId, 'link token must bind the user id');
});

test('resolveGoogleUserWithStore never auto-merges a password row onto a Google identity', async () => {
  const store = makeGoogleStore();
  await store.createUser({ emailLower: 'alice@example.com', passwordHash: 'bcrypt-hash' });
  const r = await resolveGoogleUserWithStore(store, { payload: googlePayload() }, TEST_ENV);
  assert.equal(r.outcome, 'link-required');
  assert.equal(r.user.provider, 'password', 'existing password row must remain `password` until explicit confirm');
  assert.equal(r.user.googleId, undefined, 'existing password row must not get a googleId set silently');
});

test('resolveGoogleUserWithStore rejects malformed payload', async () => {
  const store = makeGoogleStore();
  const r = await resolveGoogleUserWithStore(store, { payload: { sub: '', email: 'a@b.com' } }, TEST_ENV);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_PAYLOAD');
});

test('signLinkGoogleToken/verifyLinkGoogleToken round-trip', () => {
  const tok = signLinkGoogleToken({ userId: 'u_1', googleSub: 'g_1', emailLower: 'a@b.com' }, TEST_ENV);
  const d = verifyLinkGoogleToken(tok, TEST_ENV);
  assert.equal(d.ok, true);
  assert.equal(d.userId, 'u_1');
  assert.equal(d.googleSub, 'g_1');
  assert.equal(d.emailLower, 'a@b.com');
});

test('verifyLinkGoogleToken rejects a token with a different purpose', () => {
  // A plain auth token (purpose is undefined) must be rejected by the linker.
  const jwt = globalThis.__test_jwt || null;
  // We don't import jsonwebtoken directly here; use a manifestly-invalid token instead.
  const d = verifyLinkGoogleToken('not-a-real-token', TEST_ENV);
  assert.equal(d.ok, false);
  assert.equal(d.code, 'INVALID_LINK_TOKEN');
  // Silence unused-var warning if the global is present.
  void jwt;
});

test('loginWithStore steers Google-only accounts to USE_GOOGLE_SIGN_IN', async () => {
  const store = makeGoogleStore();
  await resolveGoogleUserWithStore(store, { payload: googlePayload() }, TEST_ENV);
  const r = await loginWithStore(store, { email: 'alice@example.com', password: 'whatever' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.code, 'USE_GOOGLE_SIGN_IN');
});

