import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import process from 'process';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 10000) : 5001;

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Configure CORS before other middleware
app.use(cors());
app.use(express.json());

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const metadataDir = path.join(__dirname, 'metadata');

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}
if (!existsSync(metadataDir)) {
  mkdirSync(metadataDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueId = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

const upload = multer({ storage: storage });

// API Routes - Define these BEFORE static file serving
app.get('/api/files', async (req, res) => {
  try {
    console.log('Reading metadata directory:', metadataDir);
    const metadataFiles = await fs.readdir(metadataDir);
    console.log('Found metadata files:', metadataFiles);
    
    const fileList = await Promise.all(
      metadataFiles
        .filter(file => file.endsWith('.json'))
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

    const validFiles = fileList.filter(file => file !== null);
    
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

app.post('/api/upload', (req, res, next) => {
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
      // Create metadata for the file
      const metadata = {
        originalName: req.file.originalname,
        customName: req.body.customName || req.file.originalname.replace(/\.[^/.]+$/, ""),
        uploadDate: new Date().toISOString(),
        fileType: req.file.mimetype,
        size: req.file.size
      };

      // Save metadata
      await fs.writeFile(
        path.join(metadataDir, `${req.file.filename}.json`),
        JSON.stringify(metadata, null, 2)
      );

      console.log('File uploaded successfully:', {
        filename: req.file.filename,
        metadata: metadata
      });

      return res.json({ 
        message: 'File uploaded successfully',
        filename: req.file.filename,
        metadata
      });
    } catch (error) {
      console.error('Metadata Error:', error);
      next(error); // Pass error to error handling middleware
    }
  });
});

// Production configuration - Add AFTER API routes
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app
  app.use(express.static(path.join(__dirname, '../client/build')));

  // Handle any remaining requests with index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware - must be last
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message
  });
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Uploads directory:', uploadsDir);
  console.log('Metadata directory:', metadataDir);
}).on('error', (error) => {
  console.error('Server Error:', error);
});