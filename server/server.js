import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import process from 'process';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 10000) : 5001;

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Configure CORS for different environments
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false // Disable CORS in production since we're serving frontend from same domain
    : 'http://localhost:3000' // Allow React dev server in development
}));

app.use(express.json());

// Serve static files only in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Test route
app.get('/api/test', (req, res) => {
  try {
    res.json({ message: 'Server is running!' });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const metadataDir = path.join(__dirname, 'metadata');

// Use sync operations for directory creation at startup
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

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('File type:', file.mimetype); // Debug log
    const validTypes = ['audio/mpeg', 'text/plain'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3 and TXT files are allowed.'));
    }
  }
});

// Add upload endpoint with better error handling
app.post('/api/upload', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
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

      res.json({ 
        message: 'File uploaded successfully',
        filename: req.file.filename,
        metadata
      });
    } catch (error) {
      console.error('Metadata Error:', error);
      res.status(500).json({ error: 'Error saving file metadata' });
    }
  });
});

// Get list of uploaded files
app.get('/api/files', async (req, res) => {
  try {
    console.log('Reading metadata directory:', metadataDir); // Debug log
    const metadataFiles = await fs.readdir(metadataDir);
    console.log('Found metadata files:', metadataFiles); // Debug log
    
    const fileList = await Promise.all(
      metadataFiles
        .filter(file => file.endsWith('.json'))
        .map(async (metaFile) => {
          try {
            console.log('Reading metadata file:', metaFile); // Debug log
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

    // Filter out any null entries from failed metadata reads
    const validFiles = fileList.filter(file => file !== null);
    
    console.log('Sending response with files:', validFiles); // Debug log
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

// Get specific file
app.get('/api/files/:filename', (req, res) => {
  try {
    const filePath = path.join(uploadsDir, req.params.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Error handling middleware
app.use((err, req, res) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
  console.log('Environment:', process.env.NODE_ENV);
}).on('error', (error) => {
  console.error('Server Error:', error);
});