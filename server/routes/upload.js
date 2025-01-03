import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueId = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

const upload = multer({ storage: storage });

// File upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    const metadata = {
      originalName: req.file.originalname,
      customName: req.body.customName || req.file.originalname.replace(/\.[^/.]+$/, ""),
      uploadDate: new Date().toISOString(),
      fileType: req.file.mimetype,
      size: req.file.size
    };

    // Save metadata
    await fs.writeFile(
      path.join(__dirname, '../metadata', `${req.file.filename}.json`),
      JSON.stringify(metadata, null, 2)
    );

    console.log('File uploaded:', {
      file: req.file.filename,
      metadata: metadata
    });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      filename: req.file.filename,
      metadata
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process upload'
    });
  }
});

// List files endpoint
router.get('/files', async (req, res) => {
  try {
    const metadataDir = path.join(__dirname, '../metadata');
    console.log('Reading metadata from:', metadataDir);
    
    const files = await fs.readdir(metadataDir);
    const fileList = await Promise.all(
      files
        .filter(file => file.endsWith('.json'))
        .map(async file => {
          const content = await fs.readFile(path.join(metadataDir, file), 'utf8');
          return JSON.parse(content);
        })
    );

    res.json({
      success: true,
      files: fileList
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.json({
      success: true,
      files: []
    });
  }
});

export default router;