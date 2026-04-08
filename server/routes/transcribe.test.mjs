import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedAudioMime,
  MAX_TRANSCRIBE_BYTES,
  parseVerboseRequestFlag,
  buildTranscribeJsonResponse
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

test('parseVerboseRequestFlag', () => {
  assert.equal(parseVerboseRequestFlag({}, {}), false);
  assert.equal(parseVerboseRequestFlag({ verbose: '1' }, {}), true);
  assert.equal(parseVerboseRequestFlag({ verbose: 'true' }, {}), true);
  assert.equal(parseVerboseRequestFlag({ verbose: 'YES' }, {}), true);
  assert.equal(parseVerboseRequestFlag({ verbose: '0' }, {}), false);
  assert.equal(parseVerboseRequestFlag({}, { verbose: 'on' }), true);
  assert.equal(parseVerboseRequestFlag({ verbose: true }, {}), true);
});

test('buildTranscribeJsonResponse plain', () => {
  const out = buildTranscribeJsonResponse({ text: 'hi' }, 'whisper-1', { verbose: false });
  assert.deepEqual(out, { success: true, transcript: 'hi', model: 'whisper-1' });
});

test('buildTranscribeJsonResponse verbose_json maps segments', () => {
  const out = buildTranscribeJsonResponse(
    {
      text: 'hello world',
      duration: 3.2,
      segments: [{ start: 0, end: 1.5, text: 'hello' }, { start: 1.5, end: 3, text: ' world' }]
    },
    'whisper-1',
    { verbose: true }
  );
  assert.equal(out.success, true);
  assert.equal(out.transcript, 'hello world');
  assert.equal(out.model, 'whisper-1');
  assert.equal(out.duration, 3.2);
  assert.equal(out.segments.length, 2);
  assert.deepEqual(out.segments[0], { start: 0, end: 1.5, text: 'hello' });
});
