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
    console.log('Reading metadata directory:', metadataDir);
    const metadataFiles = await fs.readdir(metadataDir);
    console.log('Found metadata files:', metadataFiles);

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
              filename: metaFile.replace('.json', '')
            };
          } catch (error) {
            console.error('Error reading metadata file:', metaFile, error);
            return null;
          }
        })
    );

    const validFiles = fileList.filter((file) => file !== null);

    res.setHeader('Content-Type', 'application/json');
    res.json({ files: validFiles });
  } catch (error) {
    console.error('Error reading metadata directory:', error);
    res.status(500).json({
      error: 'Failed to read files',
      details: error.message,
      path: metadataDir
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

      const metadata = {
        originalName: req.file.originalname,
        customName: req.body.customName || req.file.originalname.replace(/\.[^/.]+$/, ''),
        uploadDate: new Date().toISOString(),
        fileType: req.file.mimetype,
        size: req.file.size,
        sessionId: req.body.sessionId
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
        details: {
          requested: filename,
          path: filePath,
          availableFiles: files
        }
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

export default router;
