import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Feedback from './models/feedback.js';

// Load environment variables
dotenv.config();

// Check for OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set in environment variables');
  process.exit(1);
}

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define base directory for production
const baseDir = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/src/server'
  : __dirname;

const uploadsDir = path.join(baseDir, 'uploads');
const metadataDir = path.join(baseDir, 'metadata');

// Create Express app
const app = express();

// Define allowed origins with exact production URL
const allowedOrigins = [
  'https://talk-graph.onrender.com',
  'https://mind-map.onrender.com',
  'http://localhost:3000'
];

// Update CORS configuration with more specific options
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Add explicit OPTIONS handling for preflight requests
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Ensure directories exist
(async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }
})();

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

app.get('/api/test', (req, res) => {
  try {
    res.json({ 
      status: 'ok',
      message: 'Server is running',
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API Routes - Must come BEFORE the production static/catch-all routes
app.get('/api/files/:filename', async (req, res) => {
  console.log('File request received:', {
    filename: req.params.filename,
    path: req.path,
    method: req.method,
    uploadsDir: uploadsDir
  });
  
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(uploadsDir, filename);
    
    console.log('File access attempt:', {
      requestedFile: filename,
      fullPath: filePath,
      exists: await fs.access(filePath).then(() => true).catch(() => false)
    });

    // List all files in uploads directory for debugging
    const files = await fs.readdir(uploadsDir);
    console.log('Files in uploads directory:', files);
    
    // Check if file exists before trying to read it
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
      content: content
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

// Add feedback endpoint
app.post('/api/feedback', cors(), async (req, res) => {
  res.header('Access-Control-Allow-Origin', allowedOrigins);
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);

  try {
    const { rating, feedback } = req.body;
    
    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rating'
      });
    }

    // Create new feedback document
    const newFeedback = new Feedback({
      rating,
      feedback
    });

    // Save to database
    await newFeedback.save();

    console.log('Feedback saved to database:', newFeedback);

    res.json({ 
      success: true,
      message: 'Feedback saved successfully'
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save feedback'
    });
  }
});

// Optional: Add endpoint to retrieve feedback
app.get('/api/feedback', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ timestamp: -1 });
    res.json({ 
      success: true, 
      feedbacks 
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback'
    });
  }
});

// Add this route to view feedback
app.get('/api/feedback/view', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ timestamp: -1 });
    // Send as formatted HTML for better browser viewing
    res.send(`
      <html>
        <head>
          <title>Feedback Results</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .feedback { border: 1px solid #ccc; margin: 10px 0; padding: 10px; }
            .rating { font-weight: bold; }
            .timestamp { color: #666; }
          </style>
        </head>
        <body>
          <h1>Feedback Results</h1>
          ${feedbacks.map(f => `
            <div class="feedback">
              <div class="rating">Rating: ${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)}</div>
              <div>Feedback: ${f.feedback || 'No comment provided'}</div>
              <div class="timestamp">Submitted: ${new Date(f.timestamp).toLocaleString()}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).send('Error fetching feedback');
  }
});

// Import the router
import uploadRouter from './routes/upload.js';

// Use the router BEFORE your other routes
app.use('/api', uploadRouter);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Production configuration - Must come AFTER all API routes
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React app
  app.use(express.static(path.join(__dirname, '../client/build')));

  // The "catch-all" route handler must be last
  app.get('*', (req, res) => {
    // Don't handle /api routes here
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        success: false,
        error: 'API endpoint not found'
      });
    }
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware - must be last
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message,
    path: req.path
  });
});

// Update the analyze endpoint
app.post('/api/analyze', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const { content } = req.body;

    if (!content) {
      return res.json({
        success: false,
        error: 'No content provided'
      });
    }

    console.log('Analyzing content length:', content.length);
    console.log('Content preview:', content.substring(0, 100));

    const prompt = `
      Analyze the following content and return a JSON object containing:
      1. nodes: An array of objects, each representing a key concept with properties:
         - id: unique identifier
         - label: name of the concept
         - description: brief explanation
      2. links: An array of objects representing relationships between nodes with properties:
         - source: id of the source node
         - target: id of the target node
         - relationship: description of how these concepts are related

      Content to analyze:
      ${content}

      Please ensure the response is valid JSON and includes at least 5-10 key concepts and their relationships.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes text and identifies key concepts and their relationships. Return only valid JSON without any additional text."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const graphData = JSON.parse(completion.choices[0].message.content);
    console.log('Analysis completed successfully');
    
    return res.json({
      success: true,
      data: graphData
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return res.json({
      success: false,
      error: 'Failed to analyze content',
      details: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/test`);
  console.log(`Files endpoint: http://localhost:${PORT}/api/files`);
  console.log('OpenAI configured:', !!openai);
  console.log('CORS enabled');
  console.log('Directories:');
  console.log(`- Uploads: ${uploadsDir}`);
  console.log(`- Metadata: ${metadataDir}`);
  console.log('=================================');
});

// MongoDB connection with simplified options
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('Attempting to connect to MongoDB...');
    console.log('Environment:', process.env.NODE_ENV);
    
    // Simplified options without deprecated flags
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Production specific options
      ...(process.env.NODE_ENV === 'production' && {
        retryWrites: true,
        w: 'majority'
      })
    };

    // Log connection attempt details (without sensitive info)
    console.log('Connection details:', {
      environment: process.env.NODE_ENV,
      options,
      uriPrefix: mongoURI.split('@')[0].split(':')[0], // Log only the protocol part
      database: mongoURI.split('/').pop().split('?')[0] // Log only the database name
    });

    await mongoose.connect(mongoURI, options);
    console.log('MongoDB Connected Successfully');
  } catch (err) {
    console.error('MongoDB connection error:', {
      name: err.name,
      message: err.message,
      code: err.code,
      details: err.toString()
    });

    if (err.message.includes('bad auth')) {
      console.error('Authentication failed - Please verify:');
      console.error('1. Username and password are correct');
      console.error('2. User has correct database permissions');
      console.error('3. Database name is correct');
      console.error('4. Connection string format is correct');
    }
    
    // Retry connection after delay
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

// Initial connection
connectDB();

// Connection event handlers
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', err => {
  console.error('Mongoose connection error:', {
    name: err.name,
    message: err.message,
    code: err.code
  });
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
  if (process.env.NODE_ENV === 'production') {
    console.log('Attempting to reconnect...');
    setTimeout(connectDB, 5000);
  }
});

// Clean up on app termination
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error during connection cleanup:', err);
    process.exit(1);
  }
});