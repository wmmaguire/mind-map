import {
  MAX_TRANSCRIBE_AUDIO_BYTES,
  validateAudioFileSizeForTranscribe,
  pickMediaRecorderMimeType
} from './audioRecording';

describe('validateAudioFileSizeForTranscribe', () => {
  test('accepts size under limit', () => {
    expect(validateAudioFileSizeForTranscribe(100).ok).toBe(true);
    expect(validateAudioFileSizeForTranscribe(MAX_TRANSCRIBE_AUDIO_BYTES).ok).toBe(true);
  });

  test('rejects over limit', () => {
    const r = validateAudioFileSizeForTranscribe(MAX_TRANSCRIBE_AUDIO_BYTES + 1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too large/i);
  });
});

describe('pickMediaRecorderMimeType', () => {
  const orig = global.MediaRecorder;

  afterEach(() => {
    global.MediaRecorder = orig;
  });

  test('returns empty when MediaRecorder missing', () => {
    global.MediaRecorder = undefined;
    expect(pickMediaRecorderMimeType()).toBe('');
  });

  test('returns first supported type', () => {
    global.MediaRecorder = class {
      static isTypeSupported(t) {
        return t === 'audio/webm';
      }
    };
    expect(pickMediaRecorderMimeType()).toBe('audio/webm');
  });
});
