import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timingSafeEqualString,
  evaluateOwnedGraphRead,
  redactGraphMetadataForResponse,
  stripShareSecretFromSaveMetadata,
} from './graphShareRead.js';

test('timingSafeEqualString rejects length mismatch and non-strings', () => {
  assert.equal(timingSafeEqualString('a', 'ab'), false);
  assert.equal(timingSafeEqualString('', ''), true);
  assert.equal(timingSafeEqualString('x', 'x'), true);
  assert.equal(timingSafeEqualString(null, 'x'), false);
});

test('evaluateOwnedGraphRead: session-only graph always allowed', () => {
  const r = evaluateOwnedGraphRead({ sessionId: 's' }, '', '');
  assert.equal(r.allowed, true);
  assert.equal(r.viaShare, false);
});

test('evaluateOwnedGraphRead: owner header', () => {
  const r = evaluateOwnedGraphRead({ userId: 'u1' }, 'u1', '');
  assert.equal(r.allowed, true);
  assert.equal(r.viaShare, false);
});

test('evaluateOwnedGraphRead: wrong header without token', () => {
  const r = evaluateOwnedGraphRead({ userId: 'u1' }, 'u2', '');
  assert.equal(r.allowed, false);
});

test('evaluateOwnedGraphRead: share token', () => {
  const r = evaluateOwnedGraphRead(
    { userId: 'u1', shareReadToken: 'abc' },
    '',
    'abc'
  );
  assert.equal(r.allowed, true);
  assert.equal(r.viaShare, true);
});

test('evaluateOwnedGraphRead: bad share token', () => {
  const r = evaluateOwnedGraphRead(
    { userId: 'u1', shareReadToken: 'abc' },
    '',
    'wrong'
  );
  assert.equal(r.allowed, false);
});

test('redactGraphMetadataForResponse strips secrets', () => {
  const m = redactGraphMetadataForResponse(
    { name: 'G', shareReadToken: 'x', dbId: 'y' },
    { shareViewer: true }
  );
  assert.equal(m.name, 'G');
  assert.equal('shareReadToken' in m, false);
  assert.equal('dbId' in m, false);
});

test('redactGraphMetadataForResponse keeps dbId for owner responses', () => {
  const m = redactGraphMetadataForResponse(
    { name: 'G', shareReadToken: 'x', dbId: 'y' },
    { shareViewer: false }
  );
  assert.equal(m.dbId, 'y');
  assert.equal('shareReadToken' in m, false);
});

test('stripShareSecretFromSaveMetadata removes shareReadToken only', () => {
  const out = stripShareSecretFromSaveMetadata({
    name: 'G',
    userId: 'u1',
    shareReadToken: 'should-not-persist-from-client',
  });
  assert.equal(out.name, 'G');
  assert.equal(out.userId, 'u1');
  assert.equal('shareReadToken' in out, false);
});
