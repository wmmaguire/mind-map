/**
 * POST /api/transcribe — audio → text via OpenAI Whisper (GitHub #34, #58).
 */
import express from 'express';
import multer from 'multer';
import { toFile } from 'openai';
import { Session } from '../models/session.js';
import { recordUserActivity } from '../lib/recordUserActivity.js';

/** Whisper API max upload size (bytes). */
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;

export function isAllowedAudioMime(mime) {
  if (!mime || typeof mime !== 'string') return false;
  const base = mime.split(';')[0].trim().toLowerCase();
  return base.startsWith('audio/');
}

/**
 * Opt-in verbose transcript (segment timestamps): multipart field or query `verbose`.
 * Truthy: `1`, `true`, `yes`, `on` (case-insensitive).
 */
export function parseVerboseRequestFlag(body, query) {
  const raw = body?.verbose ?? query?.verbose;
  if (raw === undefined || raw === null || raw === '') return false;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * Maps OpenAI verbose_json transcription to our JSON contract (GitHub #58).
 */
export function buildTranscribeJsonResponse(transcription, model, options = {}) {
  const verbose = Boolean(options.verbose);
  const transcript = typeof transcription?.text === 'string' ? transcription.text : '';
  const base = { success: true, transcript, model };
  if (!verbose) return base;

  const duration =
    typeof transcription?.duration === 'number' ? transcription.duration : undefined;
  const segments = Array.isArray(transcription?.segments)
    ? transcription.segments.map((s) => ({
        start: typeof s.start === 'number' ? s.start : 0,
        end: typeof s.end === 'number' ? s.end : 0,
        text: typeof s.text === 'string' ? s.text : ''
      }))
    : [];

  return { ...base, ...(duration !== undefined ? { duration } : {}), segments };
}

function openaiErrorHttpStatus(err) {
  if (!err || typeof err !== 'object') return undefined;
  return err.status ?? err.response?.status;
}

export default function createTranscribeRouter(openai) {
  const router = express.Router();

  const storage = multer.memoryStorage();
  const transcribeUpload = multer({
    storage,
    limits: { fileSize: MAX_TRANSCRIBE_BYTES },
    fileFilter(req, file, cb) {
      if (isAllowedAudioMime(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          Object.assign(new Error('Unsupported file type; expected an audio file'), {
            code: 'UNSUPPORTED_AUDIO_TYPE'
          })
        );
      }
    }
  });

  router.post(
    '/transcribe',
    (req, res, next) => {
      transcribeUpload.single('audio')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: 'Audio file too large',
            code: 'FILE_TOO_LARGE',
            maxBytes: MAX_TRANSCRIBE_BYTES
          });
        }
        if (err.code === 'UNSUPPORTED_AUDIO_TYPE') {
          return res.status(400).json({
            success: false,
            error: err.message || 'Unsupported audio type',
            code: 'UNSUPPORTED_AUDIO_TYPE'
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message || 'Invalid upload',
          code: 'UPLOAD_REJECTED'
        });
      });
    },
    async (req, res) => {
      const sessionId =
        typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'sessionId is required',
          code: 'SESSION_REQUIRED'
        });
      }

      const session = await Session.findOne({ sessionId });
      if (!session) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID',
          code: 'INVALID_SESSION'
        });
      }

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          error: 'No audio file provided (use form field "audio")',
          code: 'NO_AUDIO_FILE'
        });
      }

      const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
      const verbose = parseVerboseRequestFlag(req.body, req.query);

      try {
        const safeName = req.file.originalname?.replace(/[^\w.\-()+]/g, '_') || 'audio.webm';
        const fileForApi = await toFile(req.file.buffer, safeName, {
          type: req.file.mimetype
        });

        const createParams = {
          file: fileForApi,
          model
        };
        if (verbose) {
          createParams.response_format = 'verbose_json';
        }

        const transcription = await openai.audio.transcriptions.create(createParams);

        const payload = buildTranscribeJsonResponse(transcription, model, { verbose });
        const transcriptLen =
          typeof payload.transcript === 'string' ? payload.transcript.length : 0;

        await recordUserActivity({
          sessionObjectId: session._id,
          sessionUuid: sessionId,
          action: 'TRANSCRIBE_COMPLETE',
          status: 'SUCCESS',
          summary: `Transcribed ${transcriptLen} characters`,
          meta: { model, bytes: req.file.size, verbose }
        });

        return res.json(payload);
      } catch (error) {
        console.error('Transcribe error:', error);
        const httpStatus = openaiErrorHttpStatus(error);
        let statusCode = 500;
        let details = error.message || 'Unknown error';
        let code = 'TRANSCRIBE_FAILED';

        if (httpStatus === 429) {
          statusCode = 429;
          code = 'OPENAI_QUOTA';
          details =
            'OpenAI returned 429 (quota or rate limit). Check billing or retry later.';
        } else if (httpStatus === 401) {
          statusCode = 401;
          code = 'OPENAI_AUTH';
          details = 'OpenAI rejected the API key (401).';
        }

        await recordUserActivity({
          sessionObjectId: session._id,
          sessionUuid: sessionId,
          action: 'TRANSCRIBE_COMPLETE',
          status: 'FAILURE',
          summary: 'Transcription failed',
          errorMessage: details
        });

        return res.status(statusCode).json({
          success: false,
          error: 'Transcription failed',
          details,
          code
        });
      }
    }
  );

  return router;
}
