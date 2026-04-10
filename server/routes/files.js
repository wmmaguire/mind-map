/**
 * Library file APIs: list metadata, upload (session + Mongo), fetch raw content.
 * Single ownership for /api/files, /api/upload, /api/files/:filename.
 */
import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import File from '../models/file.js';
import { Session } from '../models/session.js';
import { uploadsDir, metadataDir } from '../config.js';
import { recordUserActivity } from '../lib/recordUserActivity.js';

const router = express.Router();

/** Dev/future-auth: optional user id for user-scoped listings (#32). */
const USER_ID_HEADER = 'x-mindmap-user-id';

/**
 * Guest / session-only library listing: same browser session may persist after logout.
 * Rows with a non-empty userId belong to an account and must not appear unless listing by userId.
 */
function sessionScopedGuestFilesQuery(sessionId) {
  return {
    sessionId,
    $or: [
      { userId: { $exists: false } },
      { userId: null },
      { userId: '' },
    ],
  };
}

async function canReadUploadedFile(req, filename, filePath) {
  const headerUserId =
    typeof req.get(USER_ID_HEADER) === 'string'
      ? req.get(USER_ID_HEADER).trim()
      : '';
  let ownerId = null;
  const fileDoc = await File.findOne({ path: filePath }).lean();
  if (fileDoc?.userId && String(fileDoc.userId).trim() !== '') {
    ownerId = String(fileDoc.userId).trim();
  } else {
    try {
      const metaPath = path.join(metadataDir, `${filename}.json`);
      const raw = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(raw);
      if (typeof meta.userId === 'string' && meta.userId.trim() !== '') {
        ownerId = meta.userId.trim();
      }
    } catch {
      /* legacy or missing sidecar */
    }
  }
  if (ownerId && headerUserId !== ownerId) {
    return false;
  }
  return true;
}

function fileDocToListItem(doc) {
  const basename = path.basename(doc.path);
  return {
    _id: doc._id,
    filename: basename,
    originalName: doc.originalName,
    customName: doc.customName,
    uploadDate:
      doc.uploadTime instanceof Date
        ? doc.uploadTime.toISOString()
        : new Date(doc.uploadTime).toISOString(),
    fileType: doc.fileType,
    size: doc.fileSize,
    sessionId: doc.sessionId,
    ...(doc.userId ? { userId: doc.userId } : {}),
  };
}

async function listAllMetadataJsonFiles() {
  const metadataFiles = await fs.readdir(metadataDir);
  const fileList = await Promise.all(
    metadataFiles
      .filter((file) => file.endsWith('.json'))
      .map(async (metaFile) => {
        try {
          const metadata = JSON.parse(
            await fs.readFile(path.join(metadataDir, metaFile), 'utf8')
          );
          return {
            ...metadata,
            filename: metaFile.replace('.json', ''),
          };
        } catch (error) {
          console.error('Error reading metadata file:', metaFile, error);
          return null;
        }
      })
  );
  return fileList.filter((file) => file !== null);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename(req, file, cb) {
    const uniqueId = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

const upload = multer({ storage });

async function removeSessionUploadArtifacts(uploadedFilePath, metadataBasename) {
  try {
    await fs.unlink(uploadedFilePath);
  } catch (e) {
    console.error('Failed to remove uploaded file after persist error:', e);
  }
  try {
    await fs.unlink(path.join(metadataDir, metadataBasename));
  } catch (e) {
    console.error('Failed to remove metadata file after persist error:', e);
  }
}

router.get('/files', async (req, res) => {
  try {
    const userId =
      (typeof req.query.userId === 'string' && req.query.userId.trim()) ||
      (typeof req.get(USER_ID_HEADER) === 'string' &&
        req.get(USER_ID_HEADER).trim()) ||
      null;
    const sessionId =
      typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

    if (userId) {
      const docs = await File.find({ userId }).sort({ uploadTime: -1 }).lean();
      const existing = [];
      const missing = [];
      for (const doc of docs) {
        const p = doc?.path;
        if (!p) continue;
        try {
          await fs.access(p);
          existing.push(doc);
        } catch {
          missing.push(path.basename(p));
        }
      }
      if (missing.length) {
        console.warn('Omitting library files missing on disk:', {
          scope: 'userId',
          userId,
          missingCount: missing.length,
          missing: missing.slice(0, 25),
        });
      }
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        files: existing.map(fileDocToListItem),
        listingScope: 'userId',
      });
    }

    if (sessionId) {
      const docs = await File.find(sessionScopedGuestFilesQuery(sessionId))
        .sort({ uploadTime: -1 })
        .lean();
      const existing = [];
      const missing = [];
      for (const doc of docs) {
        const p = doc?.path;
        if (!p) continue;
        try {
          await fs.access(p);
          existing.push(doc);
        } catch {
          missing.push(path.basename(p));
        }
      }
      if (missing.length) {
        console.warn('Omitting library files missing on disk:', {
          scope: 'sessionId',
          sessionId,
          missingCount: missing.length,
          missing: missing.slice(0, 25),
        });
      }
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        files: existing.map(fileDocToListItem),
        listingScope: 'sessionId',
      });
    }

    console.log(
      'GET /api/files: unscoped listing (metadata dir); pass sessionId or userId for scoped results (#32)'
    );
    const validFiles = await listAllMetadataJsonFiles();
    res.setHeader('Content-Type', 'application/json');
    res.json({ files: validFiles, listingScope: 'legacy' });
  } catch (error) {
    console.error('Error reading files listing:', error);
    res.status(500).json({
      error: 'Failed to read files',
      details: error.message,
      path: metadataDir,
    });
  }
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Upload Error:', err);
      return res.status(400).json({
        error: err.message || 'Error uploading file'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded'
      });
    }

    try {
      if (!req.body.sessionId) {
        return res.status(400).json({
          error: 'No sessionId provided'
        });
      }

      const session = await Session.findOne({ sessionId: req.body.sessionId });
      if (!session) {
        return res.status(400).json({
          error: 'Invalid session ID'
        });
      }

      const headerUserId = req.get(USER_ID_HEADER);
      const ownerUserId =
        typeof headerUserId === 'string' && headerUserId.trim() !== ''
          ? headerUserId.trim()
          : null;

      const metadata = {
        originalName: req.file.originalname,
        customName: req.body.customName || req.file.originalname.replace(/\.[^/.]+$/, ''),
        uploadDate: new Date().toISOString(),
        fileType: req.file.mimetype,
        size: req.file.size,
        sessionId: req.body.sessionId,
        ...(ownerUserId ? { userId: ownerUserId } : {}),
      };

      const metadataBasename = `${req.file.filename}.json`;
      const metadataPath = path.join(metadataDir, metadataBasename);

      try {
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      } catch (metaErr) {
        console.error('Metadata write error:', metaErr);
        await removeSessionUploadArtifacts(req.file.path, metadataBasename);
        return res.status(500).json({
          success: false,
          error: 'Could not save file metadata on disk.',
          code: 'METADATA_WRITE_FAILED'
        });
      }

      try {
        const fileRecord = new File({
          sessionId: req.body.sessionId,
          ...(ownerUserId ? { userId: ownerUserId } : {}),
          customName: metadata.customName,
          originalName: metadata.originalName,
          uploadTime: new Date(metadata.uploadDate),
          fileType: metadata.fileType,
          fileSize: metadata.size,
          path: req.file.path
        });

        await fileRecord.save();
        console.log('File metadata saved to database:', fileRecord);

        await recordUserActivity({
          sessionObjectId: session._id,
          sessionUuid: req.body.sessionId,
          action: 'FILE_UPLOAD',
          status: 'SUCCESS',
          resourceType: 'File',
          resourceId: fileRecord._id,
          summary: `Uploaded ${metadata.customName || metadata.originalName}`
        });
      } catch (dbError) {
        console.error('Error saving to database:', dbError);
        await removeSessionUploadArtifacts(req.file.path, metadataBasename);
        if (dbError.code === 11000) {
          return res.status(409).json({
            success: false,
            error:
              'Could not save file metadata (duplicate key). If you upgraded from a one-file-per-session schema, drop the legacy unique index on sessionId in the files collection—see server READEME.',
            code: 'DUPLICATE_KEY',
            details: dbError.message
          });
        }
        return res.status(503).json({
          success: false,
          error: 'Upload could not be recorded in the database. The file was not kept.',
          code: 'DATABASE_PERSIST_FAILED'
        });
      }

      console.log('File uploaded successfully:', {
        filename: req.file.filename,
        metadata
      });

      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        filename: req.file.filename,
        metadata,
        persistedToDatabase: true
      });
    } catch (error) {
      console.error('Metadata Error:', error);
      next(error);
    }
  });
});

router.get('/files/:filename', async (req, res) => {
  console.log('File request received:', {
    filename: req.params.filename,
    path: req.path,
    method: req.method,
    uploadsDir
  });

  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(uploadsDir, filename);

    console.log('File access attempt:', {
      requestedFile: filename,
      fullPath: filePath,
      exists: await fs.access(filePath).then(() => true).catch(() => false)
    });

    const files = await fs.readdir(uploadsDir);
    console.log('Files in uploads directory:', files);

    try {
      await fs.access(filePath);
    } catch (error) {
      console.log('File not found:', {
        filePath,
        error: error.message,
        uploadsDir,
        availableFiles: files
      });
      return res.status(404).json({
        success: false,
        error: 'File not found',
        details: `Requested "${filename}" was not found on disk.`,
        debug: {
          requested: filename,
          path: filePath,
          availableFiles: files,
        },
        code: 'FILE_MISSING_ON_DISK',
      });
    }

    const allowed = await canReadUploadedFile(req, filename, filePath);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    const content = await fs.readFile(filePath, 'utf8');
    console.log('File read successfully:', {
      filename,
      contentLength: content.length,
      preview: content.substring(0, 100)
    });

    return res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Server error:', {
      error: error.message,
      stack: error.stack,
      filename: req.params.filename
    });
    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

router.delete('/files/:filename', async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'sessionId query parameter is required',
    });
  }

  let filename;
  try {
    filename = decodeURIComponent(req.params.filename);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }

  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }

  const metadataPath = path.join(metadataDir, `${filename}.json`);
  const uploadPath = path.join(uploadsDir, filename);

  let meta;
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    meta = JSON.parse(raw);
  } catch {
    return res.status(404).json({
      success: false,
      error: 'File not found',
    });
  }

  const headerUserId =
    typeof req.get(USER_ID_HEADER) === 'string'
      ? req.get(USER_ID_HEADER).trim()
      : '';

  let fileDoc;
  try {
    fileDoc = await File.findOne({ path: uploadPath }).lean();
  } catch (e) {
    console.error('Delete lookup File:', e);
  }

  const sessionMatch = meta.sessionId === sessionId;
  const accountMatch =
    headerUserId &&
    (fileDoc?.userId === headerUserId ||
      (typeof meta.userId === 'string' && meta.userId === headerUserId));

  const isAccountOwned =
    (fileDoc?.userId && String(fileDoc.userId).trim() !== '') ||
    (typeof meta.userId === 'string' && meta.userId.trim() !== '');

  // Account-owned files must not be deletable via session alone (same session after logout).
  if (isAccountOwned) {
    if (!accountMatch) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete files you uploaded while signed in to that account',
      });
    }
  } else if (!sessionMatch) {
    return res.status(403).json({
      success: false,
      error: 'You can only delete files uploaded in this session',
    });
  }

  try {
    await fs.unlink(uploadPath);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Delete upload file:', e);
    }
  }

  try {
    await fs.unlink(metadataPath);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Delete metadata file:', e);
    }
  }

  try {
    await File.findOneAndDelete({ path: uploadPath });
  } catch (e) {
    console.error('Delete File document:', e);
  }

  try {
    const session = await Session.findOne({ sessionId });
    if (session) {
      await recordUserActivity({
        sessionObjectId: session._id,
        sessionUuid: sessionId,
        action: 'FILE_DELETE',
        status: 'SUCCESS',
        resourceType: 'File',
        summary: `Deleted ${meta.customName || meta.originalName || filename}`,
      });
    }
  } catch (e) {
    console.error('recordUserActivity FILE_DELETE:', e);
  }

  return res.json({ success: true, filename });
});

export default router;
