import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuthClient } from './googleAuthClient.js';

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

function fakeTicket(payload) {
  return { getPayload: () => payload };
}

function stubVerifier(payloadOrError) {
  return async () => {
    if (payloadOrError instanceof Error) throw payloadOrError;
    return fakeTicket(payloadOrError);
  };
}

function validPayload(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '118313123123123',
    email: 'alice@example.com',
    email_verified: true,
    name: 'Alice',
    picture: 'https://lh3.googleusercontent.com/a/alice',
    ...overrides,
  };
}

test('createGoogleAuthClient rejects missing clientId', () => {
  assert.throws(() => createGoogleAuthClient({ clientId: '' }));
});

test('verifier accepts a valid token and normalizes the payload', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload()),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, true);
  assert.equal(r.payload.sub, '118313123123123');
  assert.equal(r.payload.email, 'alice@example.com');
  assert.equal(r.payload.emailVerified, true);
  assert.equal(r.payload.name, 'Alice');
});

test('verifier lowercases the email claim', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ email: 'ALICE@Example.COM' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, true);
  assert.equal(r.payload.email, 'alice@example.com');
});

test('verifier rejects a missing credential', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload()),
  });
  const r = await verify({ credential: '' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CREDENTIAL_REQUIRED');
});

test('verifier surfaces google-auth-library verification errors as INVALID_GOOGLE_CREDENTIAL', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(new Error('Token used too late')),
  });
  const r = await verify({ credential: 'expired-id-token' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
  assert.equal(r.code, 'INVALID_GOOGLE_CREDENTIAL');
});

test('verifier rejects wrong audience', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ aud: 'other-client-id' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_GOOGLE_AUDIENCE');
});

test('verifier rejects untrusted issuer', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ iss: 'https://evil.example/' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INVALID_GOOGLE_ISSUER');
});

test('verifier accepts the bare accounts.google.com issuer variant', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ iss: 'accounts.google.com' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, true);
});

test('verifier rejects a missing email claim', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ email: '' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'GOOGLE_EMAIL_REQUIRED');
});

test('verifier rejects nonce mismatch when expectedNonce is provided', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ nonce: 'one' })),
  });
  const r = await verify({ credential: 'id-token', expectedNonce: 'two' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'GOOGLE_NONCE_MISMATCH');
});

test('verifier accepts matching nonce', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    verifyIdTokenFn: stubVerifier(validPayload({ nonce: 'abc' })),
  });
  const r = await verify({ credential: 'id-token', expectedNonce: 'abc' });
  assert.equal(r.ok, true);
});

test('verifier honours allowedHd allow-list', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    allowedHd: ['example.com'],
    verifyIdTokenFn: stubVerifier(validPayload({ hd: 'other.com' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'GOOGLE_HD_NOT_ALLOWED');
});

test('verifier permits a matching hd', async () => {
  const verify = createGoogleAuthClient({
    clientId: CLIENT_ID,
    allowedHd: ['example.com'],
    verifyIdTokenFn: stubVerifier(validPayload({ hd: 'example.com' })),
  });
  const r = await verify({ credential: 'id-token' });
  assert.equal(r.ok, true);
});
