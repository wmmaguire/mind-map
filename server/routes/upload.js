import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Graph from '../models/graph.js';  // Import Graph model
import mongoose from 'mongoose';

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

    // Generate a unique prefix for this graph's nodes
    const uniquePrefix = Date.now().toString(36) + '-';

    // First create nodes to get their ObjectIds
    const nodeMap = new Map();
    const processedNodes = graph.nodes.map(node => ({
      id: uniquePrefix + node.id.toString(), // Make node IDs unique across all graphs
      label: node.label || '',
      description: node.description || '',
      wikiUrl: node.wikiUrl || '',
      size: node.size || 20,
      color: node.color || '#4a90e2'
    }));

    // Create temporary Node documents to get ObjectIds
    for (const node of processedNodes) {
      const tempNode = new mongoose.Types.ObjectId();
      nodeMap.set(node.id.split('-').pop(), tempNode); // Store mapping without prefix
    }

    // Process links using the node ObjectIds
    const processedLinks = graph.links.map(link => ({
      source: nodeMap.get(link.source.toString()),
      target: nodeMap.get(link.target.toString()),
      relationship: link.relationship || ''
    }));

    // Convert sourceFiles to ObjectIds if they exist
    const sourceFiles = metadata.sourceFiles?.map(fileId => {
      try {
        return new mongoose.Types.ObjectId(fileId);
      } catch (error) {
        return null;
      }
    }).filter(id => id !== null) || [];

    // Create a deterministic ObjectId from the UUID sessionId
    const sessionObjectId = new mongoose.Types.ObjectId(
      parseInt(metadata.sessionId.replace(/-/g, '').slice(0, 12), 16)
    );

    // Create the graph document
    const dbGraph = new Graph({
      metadata: {
        name: metadata.name || 'Untitled Graph',
        description: metadata.description || '',
        sourceFiles: sourceFiles,
        generatedAt: new Date(metadata.generatedAt) || new Date(),
        lastModified: new Date(),
        nodeCount: processedNodes.length,
        edgeCount: processedLinks.length,
        sessionId: sessionObjectId
      },
      nodes: processedNodes,
      links: processedLinks
    });

    // Save to filesystem for backup
    const graphData = {
      graph: {
        nodes: processedNodes,
        links: processedLinks.map(link => ({
          ...link,
          source: link.source.toString(),
          target: link.target.toString()
        }))
      },
      metadata: {
        ...dbGraph.metadata,
        sessionId: metadata.sessionId // Keep original UUID in file backup
      }
    };

    const filename = `graph_${Date.now()}.json`;
    const graphsDir = path.join(__dirname, '../graphs');
    
    await fs.mkdir(graphsDir, { recursive: true });
    await fs.writeFile(
      path.join(graphsDir, filename),
      JSON.stringify(graphData, null, 2)
    );

    // Save to database
    await dbGraph.save();

    res.json({
      success: true,
      filename,
      metadata: dbGraph.metadata,
      graphId: dbGraph._id
    });
  } catch (error) {
    console.error('Error saving graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save graph: ' + error.message
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
    
    // Existing file system load
    const content = await fs.readFile(filePath, 'utf8');
    const fileData = JSON.parse(content);

    // Add database load (as backup or for additional metadata)
    try {
      const dbGraph = await Graph.findOne({
        'metadata.savedAt': fileData.metadata.savedAt
      });
      
      if (dbGraph) {
        // Merge any additional database metadata if needed
        fileData.metadata = {
          ...fileData.metadata,
          dbId: dbGraph._id
        };
      }
    } catch (dbError) {
      console.warn('Database load warning:', dbError);
      // Continue with file system data if database load fails
    }

    res.json({
      success: true,
      data: fileData
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