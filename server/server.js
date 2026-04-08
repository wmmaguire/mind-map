import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import sessionRoutes from './routes/sessions.js';
import feedbackRoutes from './routes/feedback.js';
import File from './models/file.js';
import { Session } from './models/session.js';
import GraphTransform from './models/graphTransform.js';
import graphOperationsRouter from './routes/graphOperations.js';
import filesRouter from './routes/files.js';
import graphsRouter from './routes/graphs.js';
import createTranscribeRouter from './routes/transcribe.js';
import { recordUserActivity } from './lib/recordUserActivity.js';
import {
  validateGenerateNodeRequest,
  buildGenerateNodeDryRunPreview
} from './lib/generateNodeBudget.js';
import {
  dataDir,
  uploadsDir,
  metadataDir,
  getAllowedCorsOrigins
} from './config.js';

/** OpenAI often wraps JSON in markdown fences; extract `{ nodes, links }` and parse. */
function parseGraphJsonFromCompletion(raw) {
  if (raw == null || typeof raw !== 'string') {
    throw new Error('Empty or invalid model response');
  }
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im.exec(s);
  if (fence) {
    s = fence[1].trim();
  } else {
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      s = s.slice(firstBrace, lastBrace + 1);
    }
  }
  const parsed = JSON.parse(s);
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
    throw new Error('Model response must be JSON with nodes and links arrays');
  }
  return parsed;
}

/** HTTP status from OpenAI SDK errors (e.g. APIError). */
function openaiErrorHttpStatus(err) {
  if (!err || typeof err !== 'object') return undefined;
  return err.status ?? err.response?.status;
}

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

// Create Express app
const app = express();

const allowedOrigins = getAllowedCorsOrigins();

// Configure CORS options
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  // Include DELETE (and PUT/PATCH) so dev clients using REACT_APP_API_URL / config
  // getApiOrigin() → http://localhost:5001 can call file delete and other mutations.
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add this middleware to log all incoming requests
app.use((req, res, next) => {
  console.log('Incoming request:', {
    method: req.method,
    path: req.path,
    body: req.body,
    headers: req.headers
  });
  next();
});

// Ensure directories exist
(async () => {
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }
})();

// Library files + uploads + graph snapshots (see routes/files.js, routes/graphs.js)
app.use('/api', filesRouter);
app.use('/api', graphsRouter);
app.use('/api', graphOperationsRouter);
app.use('/api', createTranscribeRouter(openai));

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

// Error handling
app.use((err, req, res, _next) => {
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
app.use((err, req, res, _next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message,
    path: req.path
  });
});

// Update the analyze endpoint
app.post('/api/analyze', async (req, res) => {
  let graphTransform;
  let analyzeSessionUuid;
  try {
    const { content, context, sessionId } = req.body;
    analyzeSessionUuid = sessionId;
    const sourceFiles = Array.isArray(req.body.sourceFiles) ? req.body.sourceFiles : [];
    console.log('Analyze request:', { sessionId, sourceFiles });
    
    // Find the session by UUID
    const session = await Session.findOne({ sessionId });
    if (!session) {
      console.log('Session not found:', sessionId);
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
    }
    console.log('Found session:', session._id);

    // Look up the file records
    const fileRecords = await Promise.all(
      sourceFiles.map(async (fileIdentifier) => {
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(fileIdentifier);
        const query = isObjectId 
          ? { _id: fileIdentifier }
          : { 
              $or: [
                { path: { $regex: fileIdentifier } },
                { filename: fileIdentifier },
                { originalName: fileIdentifier }
              ]
            };
        const file = await File.findOne(query);
        return file?._id;
      })
    );

    const validFileIds = fileRecords.filter(id => id);

    console.log('Analyzing content:', { content, context, sessionId, sourceFiles });

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'No content provided'
      });
    }

    // Always persist analyze attempts (including zero linked files) for durable activity (#16).
    graphTransform = new GraphTransform({
      sessionId: session._id,
      sourceFiles: validFileIds,
      context,
      status: 'pending'
    });
    await graphTransform.save();
    console.log('Created GraphTransform:', graphTransform._id);

    console.log('Analyzing content length:', content.length);
    console.log('Content preview:', content.substring(0, 100));
    if (context) {
      console.log('Additional context provided:', context);
    }

    const prompt = `
      Analyze the following content and return a JSON object containing:
      1. nodes: An array of objects, each representing a key concept with properties:
         - id: unique identifier
         - label: name of the concept
         - description: brief explanation
         - wikiUrl: URL of the Wikipedia page for the concept
      2. links: An array of objects representing relationships between nodes with properties:
         - source: id of the source node
         - target: id of the target node
         - relationship: description of how these concepts are related
      
      Rules for generating the graph:
      1. Every node MUST have a wikiUrl
      2. All wikiUrl values must be valid Wikipedia URLs
      3. The wikiUrl should be as relevant as possible to the concept
      4. The graph should be fully connected
      5. The graph should be as accurate as possible, based on the content provided
      6. All Additional Context MUST be applied to the content during analysis


      Please ensure the response is valid JSON and includes at least 5-10 key concepts and their relationships.

      Content to analyze:
      ${content}

      ${context ? `Additional Context:\n${context}\n` : ''}
    `;

    const analyzeModel = process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o';

    const completion = await openai.chat.completions.create({
      model: analyzeModel,
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

    const rawMessage = completion.choices[0]?.message?.content;
    const graphData = parseGraphJsonFromCompletion(rawMessage);
    console.log('Analysis completed successfully');

    graphTransform.result = graphData;
    graphTransform.status = 'completed';
    graphTransform.completedAt = new Date();
    await graphTransform.save();
    console.log('UpdatedGraphTransform:', graphTransform._id);

    await recordUserActivity({
      sessionObjectId: session._id,
      sessionUuid: sessionId,
      action: 'ANALYZE_COMPLETE',
      status: 'SUCCESS',
      resourceType: 'GraphTransform',
      resourceId: graphTransform._id,
      summary: `Analyze completed (${graphData.nodes?.length ?? 0} nodes)`
    });

    return res.json({
      success: true,
      data: graphData,
      transformId: graphTransform._id
    });
  } catch (error) {
    console.error('Analysis error:', error);

    const httpStatus = openaiErrorHttpStatus(error);
    let statusCode = 500;
    let details = error.message || 'Unknown error';
    let code = 'ANALYSIS_FAILED';

    if (httpStatus === 429) {
      statusCode = 429;
      code = 'OPENAI_QUOTA';
      details =
        'OpenAI returned 429 (quota or rate limit). The quickstart shows how to call the API, but each request still consumes account credits or monthly limits. Add billing or credits in the OpenAI dashboard (Billing), or wait and retry if you hit a rate limit.';
    } else if (httpStatus === 401) {
      statusCode = 401;
      code = 'OPENAI_AUTH';
      details =
        'OpenAI rejected the API key (401). Check that OPENAI_API_KEY is valid and not revoked.';
    }

    if (graphTransform) {
      graphTransform.status = 'failed';
      graphTransform.error = error.message;
      await graphTransform.save();
      await recordUserActivity({
        sessionObjectId: graphTransform.sessionId,
        sessionUuid: analyzeSessionUuid,
        action: 'ANALYZE_COMPLETE',
        status: 'FAILURE',
        resourceType: 'GraphTransform',
        resourceId: graphTransform._id,
        summary: 'Analyze failed',
        errorMessage: error.message
      });
    }

    return res.status(statusCode).json({
      success: false,
      error: 'Failed to analyze content',
      details,
      code
    });
  }
});

// Add after other API endpoints
app.post('/api/generate-node', async (req, res) => {
  const validated = validateGenerateNodeRequest(req.body);
  if (!validated.ok) {
    return res.status(validated.status).json({
      success: false,
      error: validated.error,
      code: validated.code,
      ...(validated.details ? { details: validated.details } : {})
    });
  }

  if (validated.dryRun) {
    return res.json({
      success: true,
      dryRun: true,
      preview: buildGenerateNodeDryRunPreview(validated)
    });
  }

  try {
    const { selectedNodes } = validated;
    const numNodesToGenerate = validated.numNodes;
    const timestamp = Date.now(); // Get current timestamp

    console.log('Number nodes to add:', numNodesToGenerate);
    console.log('Selected nodes for extension:', selectedNodes.map(n => `${n.label} (${n.id})`));
    console.log('Using timestamp prefix:', timestamp);

    const prompt = `
      Generate ${numNodesToGenerate} new, meaningful concepts that logically connect to these existing nodes:
      ${selectedNodes.map(node => `- ${node.label}: ${node.description || 'No description available'}`).join('\n')}

      Each new concept should:
      1. Be a real, well-defined concept or topic
      2. Have a clear, meaningful relationship to each existing node
      3. Include a relevant Wikipedia URL
      4. Have a concise but informative description

      Response must be a valid JSON object with this structure:
      {
        "nodes": [
          {
            "id": "${timestamp}_1",
            "label": "<meaningful concept name>",
            "description": "<clear, informative description>",
            "wikiUrl": "<actual Wikipedia URL>"
          }
          // Additional nodes use ${timestamp}_2, ${timestamp}_3, etc.
        ],
        "links": [
          // Each new node must connect to all selected nodes
          {
            "source": "${timestamp}_1",
            "target": "<existing node id>",
            "relationship": "<specific, meaningful relationship>"
          }
          // Additional links for all connections
        ]
      }

      IMPORTANT:
      - Generate real, meaningful concepts (not placeholders)
      - Create specific, logical relationships between nodes
      - Ensure all Wikipedia URLs are valid and relevant
      - Each new node must connect to all selected nodes
      - Use "${timestamp}_1", "${timestamp}_2", etc. for node IDs
      - Use exact IDs for existing nodes: ${selectedNodes.map(n => `"${n.id}"`).join(', ')}

      Return ONLY the JSON object.
    `;

    const generateModel = process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o';

    const completion = await openai.chat.completions.create({
      model: generateModel,
      messages: [
        {
          role: "system",
          content: `You are a knowledgeable AI tasked with expanding a knowledge graph. Follow these rules exactly:

          1. Generate valid JSON only
          2. Use the exact node IDs provided
          3. Create all required connections
          4. Follow the format exactly as shown
          5. No extra text or explanations`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2, // Even lower temperature for more consistent output
      max_tokens: 2000
    });

    const rawMessage = completion.choices[0]?.message?.content;
    let newData;
    try {
      newData = parseGraphJsonFromCompletion(rawMessage);
      console.log('Generated data:', JSON.stringify(newData, null, 2));
    } catch (parseErr) {
      console.error('Failed to parse model response:', parseErr);
      console.log('Raw response:', rawMessage);
      return res.status(502).json({
        success: false,
        error: 'Invalid JSON response from model',
        details: parseErr.message || String(parseErr),
        code: 'INVALID_MODEL_JSON'
      });
    }

    // Validate node IDs and convert them to strings for consistent comparison
    const newNodeIds = new Set(newData.nodes.map(node => node.id));
    const selectedNodeIds = new Set(selectedNodes.map(node => String(node.id))); // Convert to string
    
    // Validate connections
    const connectionMap = new Map();
    newNodeIds.forEach(newId => {
      connectionMap.set(newId, new Set());
    });

    // Check each link and count connections
    console.log('Checking connections...');
    newData.links.forEach(link => {
      const source = String(link.source); // Convert to string
      const target = String(link.target); // Convert to string
      
      console.log(`Checking link: source=${source}, target=${target}`);
      
      // Validate source and target exist
      if (!source || !target) {
        throw new Error(`Invalid link: missing source or target`);
      }

      // Track connections for new nodes to selected nodes
      if (newNodeIds.has(source) && selectedNodeIds.has(target)) {
        console.log(`Adding connection: ${source} -> ${target}`);
        connectionMap.get(source).add(target);
      }
    });

    // Debug log the connection map
    console.log('Connection map:');
    connectionMap.forEach((connections, newId) => {
      console.log(`${newId} is connected to:`, Array.from(connections));
    });

    // Verify each new node connects to all selected nodes
    let isValid = true;
    let missingConnections = [];

    connectionMap.forEach((connections, newId) => {
      console.log(`Checking ${newId} connections:`, {
        has: Array.from(connections),
        needs: Array.from(selectedNodeIds)
      });
      
      if (connections.size !== selectedNodeIds.size) {
        isValid = false;
        const missing = Array.from(selectedNodeIds)
          .filter(id => !connections.has(id));
        missingConnections.push(
          `Node ${newId} has ${connections.size} connections but needs ${selectedNodeIds.size}. ` +
          `Missing connections to: ${missing.map(id => 
            `${id} (${selectedNodes.find(n => String(n.id) === id)?.label})`
          ).join(', ')}`
        );
      }
    });

    if (!isValid) {
      console.error('Validation details:', {
        newNodes: Array.from(newNodeIds),
        selectedNodes: Array.from(selectedNodeIds),
        connections: Object.fromEntries(connectionMap),
        missingConnections
      });
      return res.json({
        success: false,
        error: 'Generated graph does not meet connectivity requirements',
        details: missingConnections.join('\n')
      });
    }

    console.log('Validation passed:', {
      newNodes: newData.nodes.length,
      totalLinks: newData.links.length,
      connectionsPerNode: selectedNodeIds.size
    });

    return res.json({
      success: true,
      data: newData
    });

  } catch (error) {
    console.error('Error generating graph:', error);

    const httpStatus = openaiErrorHttpStatus(error);
    let statusCode = 500;
    let details = error.message || 'Unknown error';
    let code = 'GENERATE_NODE_FAILED';

    if (httpStatus === 429) {
      statusCode = 429;
      code = 'OPENAI_QUOTA';
      details =
        'OpenAI returned 429 (quota or rate limit). The quickstart shows how to call the API, but each request still consumes account credits or monthly limits. Add billing or credits in the OpenAI dashboard (Billing), or wait and retry if you hit a rate limit.';
    } else if (httpStatus === 401) {
      statusCode = 401;
      code = 'OPENAI_AUTH';
      details =
        'OpenAI rejected the API key (401). Check that OPENAI_API_KEY is valid and not revoked.';
    }

    return res.status(statusCode).json({
      success: false,
      error: 'Failed to generate graph',
      details,
      code
    });
  }
});

app.use('/api/sessions', sessionRoutes);
app.use('/api/feedback', feedbackRoutes);

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Test endpoint: http://localhost:${PORT}/test`);
  console.log(`Files endpoint: http://localhost:${PORT}/api/files`);
  console.log('OpenAI configured:', !!openai);
  console.log('CORS enabled, origins:', allowedOrigins);
  console.log('Data directory:', dataDir);
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

export default app;