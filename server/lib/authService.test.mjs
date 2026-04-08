import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginWithStore, registerWithStore } from './authService.js';

function makeStore() {
  const byEmail = new Map();
  return {
    async findUserByEmail(emailLower) {
      return byEmail.get(emailLower) || null;
    },
    async createUser({ emailLower, passwordHash }) {
      const user = { id: `u_${byEmail.size + 1}`, email: emailLower, passwordHash };
      byEmail.set(emailLower, user);
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

