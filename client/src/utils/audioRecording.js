/**
 * Helpers for in-browser audio capture (GitHub #35). Max size matches server
 * {@code server/routes/transcribe.js} (Whisper API limit).
 */
export const MAX_TRANSCRIBE_AUDIO_BYTES = 25 * 1024 * 1024;

export function maxTranscribeAudioLabel() {
  return '25 MB';
}

/**
 * @param {number} sizeBytes
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateAudioFileSizeForTranscribe(sizeBytes) {
  if (typeof sizeBytes !== 'number' || sizeBytes < 0) {
    return { ok: false, message: 'Invalid file size.' };
  }
  if (sizeBytes > MAX_TRANSCRIBE_AUDIO_BYTES) {
    return {
      ok: false,
      message: `File is too large (max ${maxTranscribeAudioLabel()}). Use a shorter recording or a smaller file.`
    };
  }
  return { ok: true };
}

/**
 * Best supported MIME for {@link MediaRecorder}, or empty string for browser default.
 */
export function pickMediaRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}
