import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedAudioMime,
  MAX_TRANSCRIBE_BYTES
} from './transcribe.js';

test('isAllowedAudioMime accepts audio/*', () => {
  assert.equal(isAllowedAudioMime('audio/webm'), true);
  assert.equal(isAllowedAudioMime('audio/mpeg'), true);
  assert.equal(isAllowedAudioMime('audio/wav; codecs=opus'), true);
});

test('isAllowedAudioMime rejects non-audio', () => {
  assert.equal(isAllowedAudioMime('text/plain'), false);
  assert.equal(isAllowedAudioMime('video/mp4'), false);
  assert.equal(isAllowedAudioMime(''), false);
});

test('MAX_TRANSCRIBE_BYTES is 25MB', () => {
  assert.equal(MAX_TRANSCRIBE_BYTES, 25 * 1024 * 1024);
});
