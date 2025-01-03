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

// Add new endpoint to save graph
router.post('/graphs/save', async (req, res) => {
  try {
    const { graph, metadata } = req.body;
    
    if (!graph || !metadata) {
      return res.status(400).json({
        success: false,
        error: 'Missing graph data or metadata'
      });
    }

    const graphData = {
      graph,
      metadata: {
        ...metadata,
        nodeCount: graph.nodes.length,
        edgeCount: graph.links.length,
        savedAt: new Date().toISOString()
      }
    };

    const filename = `graph_${Date.now()}.json`;
    const graphsDir = path.join(__dirname, '../graphs');
    
    // Ensure graphs directory exists
    await fs.mkdir(graphsDir, { recursive: true });
    
    await fs.writeFile(
      path.join(graphsDir, filename),
      JSON.stringify(graphData, null, 2)
    );

    res.json({
      success: true,
      filename,
      metadata: graphData.metadata
    });
  } catch (error) {
    console.error('Error saving graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save graph'
    });
  }
});

// Add endpoint to list saved graphs
router.get('/graphs', async (req, res) => {
  try {
    const graphsDir = path.join(__dirname, '../graphs');
    await fs.mkdir(graphsDir, { recursive: true });
    
    const files = await fs.readdir(graphsDir);
    const graphs = await Promise.all(
      files
        .filter(file => file.endsWith('.json'))
        .map(async file => {
          const content = await fs.readFile(path.join(graphsDir, file), 'utf8');
          const data = JSON.parse(content);
          return {
            filename: file,
            metadata: data.metadata
          };
        })
    );

    res.json({
      success: true,
      graphs
    });
  } catch (error) {
    console.error('Error listing graphs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list graphs'
    });
  }
});

// Add endpoint to load a specific graph
router.get('/graphs/:filename', async (req, res) => {
  try {
    const graphsDir = path.join(__dirname, '../graphs');
    const filePath = path.join(graphsDir, req.params.filename);
    
    const content = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(content);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error loading graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load graph'
    });
  }
});

export default router;