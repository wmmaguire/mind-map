/**
 * POST /api/transcribe — audio → text via OpenAI Whisper (GitHub #34).
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

      try {
        const safeName = req.file.originalname?.replace(/[^\w.\-()+]/g, '_') || 'audio.webm';
        const fileForApi = await toFile(req.file.buffer, safeName, {
          type: req.file.mimetype
        });

        const transcription = await openai.audio.transcriptions.create({
          file: fileForApi,
          model
        });

        const transcript = typeof transcription.text === 'string' ? transcription.text : '';

        await recordUserActivity({
          sessionObjectId: session._id,
          sessionUuid: sessionId,
          action: 'TRANSCRIBE_COMPLETE',
          status: 'SUCCESS',
          summary: `Transcribed ${transcript.length} characters`,
          meta: { model, bytes: req.file.size }
        });

        return res.json({
          success: true,
          transcript,
          model
        });
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
