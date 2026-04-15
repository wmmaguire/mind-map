import http from 'http';
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
import createAuthRouter, { installAuthCookieParsing } from './routes/auth.js';
import {
  validateGenerateNodeRequest,
  buildGenerateNodeDryRunPreview
} from './lib/generateNodeBudget.js';
import {
  validateGenerateBranchRequest,
  buildGenerateBranchDryRunPreview
} from './lib/generateBranchRequest.js';
import { executeGenerateBranch } from './lib/generateBranch.js';
import {
  buildRandomExpansionLinks,
  normalizeGraphLinkPairs,
} from './lib/randomExpansionLinks.js';
import { pickRandomGrowthDeletes } from './lib/randomGrowthPrune.js';
import { fetchWikipediaExtract, normalizeConceptLabel } from './lib/wikipediaExtract.js';
import { parseGraphJsonFromCompletion } from './lib/parseGraphJsonFromCompletion.js';
import { validateNewNodesAgainstExisting } from './lib/validateNewNodesAgainstExisting.js';
import {
  synthesizeLinkRelationships,
  buildNodeLookupMap
} from './lib/synthesizeLinkRelationships.js';
import {
  isRelationshipSynthesisEnabled,
  getRelationshipSynthesisModel
} from './lib/relationshipSynthesisConfig.js';
import { normalizeManualExpansionLinks } from './lib/manualExpansionLinks.js';
import { repairAnalyzeGraphWikiUrls } from './lib/repairAnalyzeGraphWikiUrls.js';
import { enrichGraphNodesWithThumbnails } from './lib/enrichGraphNodesWithThumbnails.js';
import { ensureGraphLinkStrength } from './lib/linkStrength.js';
import { runExplodeNodeCore } from './lib/explodeNode.js';
import {
  dataDir,
  uploadsDir,
  metadataDir,
  getAllowedCorsOrigins
} from './config.js';

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Mindmap-User-Id'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Parse cookies for auth (GitHub #63).
installAuthCookieParsing(app);

const healthJson = () => ({
  status: 'ok',
  message: 'Server is running',
  env: process.env.NODE_ENV,
  timestamp: new Date().toISOString()
});

/** Registered before other `/api` routers so health checks always work. */
app.get('/health', (req, res) => {
  res.json(healthJson());
});

app.get('/api/test', (req, res) => {
  res.json(healthJson());
});

// Add this middleware to log all incoming requests
app.use((req, res, next) => {
  const isAuthRoute = req.path?.startsWith('/api/auth');
  console.log('Incoming request:', {
    method: req.method,
    path: req.path,
    body: isAuthRoute ? { _redacted: true } : req.body,
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
app.use('/api/auth', createAuthRouter());

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

    const hasAnalyzeGuidance =
      typeof context === 'string' && context.trim().length > 0;

    const analyzeGuidanceBlock = hasAnalyzeGuidance
      ? `
      USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES (apply to which ideas become nodes as well as every description and relationship string; keep claims grounded in the source text—do not invent facts):
      ${context.trim()}

      Reflect this guidance when selecting concepts from the content: among ideas the text supports, prefer nodes that fit the spirit of the guidance. Reflect it in writing too: descriptions and relationship labels should match the requested tone when applicable.
      `
      : '';

    const analyzeGuidanceBullet = hasAnalyzeGuidance
      ? `- USER GUIDANCE is active: choose concepts from the text that fit the guidance when several are possible, and make tone visible in every "description" and every "relationship" field where it fits (still factual; do not invent information).\n      `
      : '';

    const prompt = `
      Analyze the following content and return a JSON object containing:
      1. nodes: An array of objects, each representing a key concept with properties:
         - id: unique string identifier (stable within this response)
         - label: name of the concept
         - description: brief explanation grounded in the source text
         - wikiUrl: English Wikipedia article URL (https://en.wikipedia.org/wiki/...)
      2. links: An array of objects representing relationships between nodes with properties:
         - source: id of the source node
         - target: id of the target node
         - relationship: specific description of how these concepts are related (not generic filler)

      ${analyzeGuidanceBlock}
      Rules for generating the graph:
      1. Every node MUST have a wikiUrl pointing to a relevant English Wikipedia article when one exists; use the closest sensible article for the concept.
      2. All wikiUrl values MUST use the form https://en.wikipedia.org/wiki/... with an accurate article title for the label.
      3. The graph should be as accurate as possible and justified by the content provided.
      4. Connectivity: prefer one main connected cluster that reflects how the ideas in the text relate; do NOT force weak, redundant, or tangential edges only to link unrelated topics. It is acceptable to omit edges that would be guesses.
      5. Relationship strings must be substantive (not bare "is related to").
      ${analyzeGuidanceBullet}
      Please ensure the response is valid JSON with at least 5–10 key concepts when the content supports that many.

      Content to analyze:
      ${content}
    `;

    const analyzeModel = process.env.OPENAI_ANALYZE_MODEL || 'gpt-4o';

    const analyzeSystemMessage = `You are a knowledgeable assistant that builds a knowledge graph from text. Return only valid JSON: a single object with "nodes" and "links" arrays. No markdown code fences, no commentary before or after the JSON.

Rules:
1. Use exact property names: nodes[].id, nodes[].label, nodes[].description, nodes[].wikiUrl, links[].source, links[].target, links[].relationship.
2. Ground concepts and edges in the provided content; do not invent facts not supported by the text.
3. Prefer meaningful English Wikipedia URLs (https://en.wikipedia.org/wiki/...) that match each node's label.${
      hasAnalyzeGuidance
        ? `
4. If the user message includes USER GUIDANCE, apply it to which concepts you include from the text and to the tone and phrasing of every node description and every relationship string while staying factual.`
        : ''
    }`;

    const completion = await openai.chat.completions.create({
      model: analyzeModel,
      messages: [
        {
          role: 'system',
          content: analyzeSystemMessage
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: hasAnalyzeGuidance ? 0.48 : 0.35,
      max_tokens: 4096
    });

    const rawMessage = completion.choices[0]?.message?.content;
    let graphData = parseGraphJsonFromCompletion(rawMessage);
    try {
      graphData = await repairAnalyzeGraphWikiUrls(graphData, globalThis.fetch);
    } catch (repairErr) {
      console.error('repairAnalyzeGraphWikiUrls failed:', repairErr);
    }
    try {
      graphData = await enrichGraphNodesWithThumbnails(graphData, globalThis.fetch);
    } catch (thumbErr) {
      console.error('enrichGraphNodesWithThumbnails failed:', thumbErr);
    }
    graphData = ensureGraphLinkStrength(graphData);
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

async function wikiAnchorLinesForNodes(nodes) {
  const list = Array.isArray(nodes) ? nodes.slice(0, 16) : [];
  const parts = await Promise.all(
    list.map(async n => {
      const label = n.label || String(n.id);
      const url = n.wikiUrl || n.wikipediaUrl;
      const desc = (n.description || '').slice(0, 280);
      if (!url || typeof url !== 'string') {
        return `${label}: (no Wikipedia URL on this node) ${desc}`;
      }
      const { extract, error } = await fetchWikipediaExtract(url);
      const excerpt =
        extract && extract.length > 720
          ? `${extract.slice(0, 720)}…`
          : extract || `(no summary; ${error || 'fetch failed'})`;
      return `${label} — ${url}\n  Wikipedia summary: ${excerpt}\n  Local description: ${desc || '(none)'}`;
    })
  );
  return parts.join('\n\n');
}

/**
 * Second OpenAI pass: relationship labels grounded in Wikipedia extracts (shared by
 * manual and randomized expansion after topology is known).
 */
async function applySynthesizedRelationships(
  newData,
  existingGraphNodes,
  openai,
  generationContext = ''
) {
  if (!newData.links?.length) return newData;
  if (!isRelationshipSynthesisEnabled()) return newData;
  try {
    const nodeMap = buildNodeLookupMap(existingGraphNodes, newData.nodes);
    newData.links = await synthesizeLinkRelationships({
      openai,
      model: getRelationshipSynthesisModel(),
      links: newData.links,
      nodeById: nodeMap,
      fetchFn: globalThis.fetch,
      generationContext
    });
  } catch (synErr) {
    console.error('Relationship synthesis skipped:', synErr);
  }
  return newData;
}

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
    let deletedNodeIds = [];
    const existingGraphNodes = validated.existingGraphNodes || [];
    const numNodesToGenerate = validated.numNodes;
    const timestamp = Date.now(); // Get current timestamp

    const forbiddenLabels = new Set();
    for (const n of existingGraphNodes) {
      const k = normalizeConceptLabel(n.label || '');
      if (k) forbiddenLabels.add(k);
    }

    const forbiddenBlock =
      forbiddenLabels.size > 0
        ? `
      CRITICAL — EXISTING GRAPH CONCEPTS (normalized — do NOT add any new node whose label duplicates or trivially rephrases one of these):
      ${Array.from(forbiddenLabels).slice(0, 650).join(', ')}

      Each NEW label must be clearly distinct from every name above and from every other new node in this response.
      Prefer specific named entities, technical terms, or subtopics rather than broad duplicates.
      `
        : '';

    const hasGuidance =
      typeof validated.generationContext === 'string' &&
      validated.generationContext.trim().length > 0;

    const generationGuidanceBlock = hasGuidance
      ? `
      USER GUIDANCE — TONE, VOICE, AND CONCEPT CHOICES (apply to which new concepts you pick as well as every new node's description and every relationship string; keep facts accurate and grounded in Wikipedia/summaries—do not invent claims):
      ${validated.generationContext.trim()}

      Reflect this guidance when selecting topics: prefer new nodes whose subjects fit the spirit of the guidance among valid extensions of the anchors. Reflect it in writing: descriptions and relationship labels must visibly match the requested tone. Avoid generic neutral encyclopedia wording when a different voice is requested.
      `
      : '';

    const guidanceImportantBullet = hasGuidance
      ? `- USER GUIDANCE is active: prefer new concepts that align with the guidance among Wikipedia-suitable choices, and make every "description" and every "relationship" string clearly show that tone in its wording (still factual; do not invent information).\n      `
      : '';

    const anchorWikiBlock =
      validated.expansionAlgorithm === 'manual' && selectedNodes.length > 0
        ? await wikiAnchorLinesForNodes(selectedNodes)
        : '';

    console.log('Number nodes to add:', numNodesToGenerate);
    console.log(
      'Selected nodes for extension:',
      (selectedNodes || []).map(n => `${n.label} (${n.id})`)
    );
    console.log('Using timestamp prefix:', timestamp);

    const prompt =
      validated.expansionAlgorithm === 'randomizedGrowth'
        ? `
      Generate ${numNodesToGenerate} new, meaningful concepts to expand a knowledge graph.
      ${forbiddenBlock}
      ${generationGuidanceBlock}

      Each new concept should:
      1. Be a real, well-defined concept or topic that does NOT overlap the forbidden list above
      2. Include a relevant English Wikipedia URL (https://en.wikipedia.org/wiki/...)
      3. Have a concise but informative description explaining why it is new relative to the existing graph

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
        "links": []
      }

      IMPORTANT:
      - Generate real, meaningful concepts (not placeholders)
      ${guidanceImportantBullet}- Ensure all Wikipedia URLs are valid and relevant
      - Use "${timestamp}_1", "${timestamp}_2", etc. for node IDs
      - Do not repeat the same idea under two labels in this batch

      Return ONLY the JSON object.
    `
        : `
      Generate ${numNodesToGenerate} new, meaningful concepts that logically connect to these ANCHOR nodes.
      ${forbiddenBlock}
      ${generationGuidanceBlock}

      Anchor nodes (use these exact ids in every link target field):
      ${selectedNodes
        .map(
          node =>
            `- id "${node.id}": ${node.label} — ${node.description || 'No description'}${node.wikiUrl ? ` — wiki: ${node.wikiUrl}` : ''}`
        )
        .join('\n')}

      Wikipedia-based context for anchors (ground your relationships in this material when present):
      ${anchorWikiBlock || '(No Wikipedia summaries — use labels and descriptions only.)'}

      Each new concept should:
      1. Be a real, well-defined concept or topic not already listed in EXISTING GRAPH CONCEPTS
      2. Have a clear, meaningful relationship to each ANCHOR node, justified using anchor Wikipedia summaries when available
      3. Include a relevant English Wikipedia URL for the NEW concept
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
          // Each new node must connect to all selected anchor nodes
          {
            "source": "${timestamp}_1",
            "target": "<existing anchor node id>",
            "relationship": "<specific relationship — reference facts from the anchor Wikipedia summary when possible>"
          }
          // Additional links for all connections
        ]
      }

      IMPORTANT:
      - Generate real, meaningful concepts (not placeholders)
      ${guidanceImportantBullet}- Relationship strings must be specific (not generic "is related to"); tie them to the anchor topic when the summary gives hooks
      - Ensure all Wikipedia URLs are valid and relevant
      - Each new node must connect to all selected anchor nodes
      - Use "${timestamp}_1", "${timestamp}_2", etc. for new node IDs
      - Use exact anchor ids: ${selectedNodes.map(n => `"${n.id}"`).join(', ')}

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
          5. No extra text or explanations
          6. Never duplicate existing graph concept labels when a forbidden list is given
          7. When Wikipedia summaries are provided for anchors, use them to justify relationships${
            hasGuidance
              ? `
          8. If the user message includes USER GUIDANCE, apply it to which new concepts you choose and to the tone and phrasing of every new node's description and every relationship string. Facts must remain accurate and grounded in Wikipedia material.`
              : ''
          }`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      // Slightly higher temperature when stylistic guidance is present so tone shows in descriptions/edges.
      temperature: hasGuidance ? 0.48 : 0.2,
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

    const dupCheck = validateNewNodesAgainstExisting(newData, forbiddenLabels);
    if (!dupCheck.ok) {
      return res.json({
        success: false,
        error: dupCheck.error,
        code: dupCheck.code
      });
    }

    // Add timestamps to generated graph artifacts (#62).
    // For manual mode: model did not include timestamps; for randomizedGrowth: nodes
    // come from the model, links are overwritten below but nodes still need timestamps.
    {
      const ts = Date.now();
      newData.nodes = newData.nodes.map(n => ({
        ...n,
        timestamp: n.timestamp ?? ts
      }));
      newData.links = newData.links.map(l => ({
        ...l,
        timestamp: l.timestamp ?? ts
      }));
    }

    const newNodeIds = new Set(newData.nodes.map(node => String(node.id)));
    const selectedNodeIds = new Set(selectedNodes.map(node => String(node.id)));

    if (validated.expansionAlgorithm === 'randomizedGrowth') {
      const orderedNewIds = newData.nodes.map(node => String(node.id));
      const allExistingIds = validated.existingGraphNodeIds.map(String);
      const rawPairs = normalizeGraphLinkPairs(validated.existingGraphLinks || []);
      const idSet = new Set(allExistingIds);
      const fullExistingLinkPairs = rawPairs.filter(
        (e) => idSet.has(String(e.source)) && idSet.has(String(e.target))
      );

      if (validated.enableDeletions && validated.deletionsPerCycle > 0) {
        try {
          deletedNodeIds = pickRandomGrowthDeletes({
            existingIds: allExistingIds,
            anchorIds: selectedNodes.map((n) => String(n.id)),
            newBatchIds: orderedNewIds,
            undirectedEdges: fullExistingLinkPairs,
            count: validated.deletionsPerCycle,
            deleteStrategy: validated.deleteStrategy,
            random: Math.random,
            minNodesAfterDelete: Math.max(
              validated.connectionsPerNewNode + 2,
              4
            ),
          });
        } catch (pruneErr) {
          console.error('Random growth prune failed:', pruneErr);
          return res.status(400).json({
            success: false,
            error: pruneErr.message || 'Prune selection failed',
            code: pruneErr.code || 'PRUNE_FAILED',
          });
        }
      }

      const deletedSet = new Set(deletedNodeIds.map(String));
      const residualPoolIds = allExistingIds.filter((id) => !deletedSet.has(id));
      const residualSet = new Set(residualPoolIds);
      const initialLinkPairsForAttach = fullExistingLinkPairs.filter(
        (e) =>
          residualSet.has(String(e.source)) && residualSet.has(String(e.target))
      );

      try {
        newData.links = buildRandomExpansionLinks(
          orderedNewIds,
          residualPoolIds,
          validated.connectionsPerNewNode,
          Math.random,
          {
            anchorStrategy: validated.anchorStrategy ?? 0,
            initialLinkPairs: initialLinkPairsForAttach,
          }
        );
      } catch (attachErr) {
        console.error('Random expansion attachment failed:', attachErr);
        return res.status(400).json({
          success: false,
          error: attachErr.message || 'Random attachment failed',
          code: attachErr.code || 'RANDOM_ATTACHMENT_FAILED'
        });
      }
      await applySynthesizedRelationships(
        newData,
        existingGraphNodes,
        openai,
        validated.generationContext || ''
      );

      console.log('Validation passed (randomizedGrowth):', {
        newNodes: newData.nodes.length,
        totalLinks: newData.links.length,
        connectionsPerNewNode: validated.connectionsPerNewNode,
        anchorStrategy: validated.anchorStrategy ?? 0,
        enableDeletions: Boolean(validated.enableDeletions),
        deletionsPerCycle: validated.deletionsPerCycle ?? 0,
        deletedNodeIds: deletedNodeIds.length,
      });
    } else {
      // Manual: drop edges not between a new node and a selected anchor (model often adds extras).
      newData.links = normalizeManualExpansionLinks(
        newData.links,
        newNodeIds,
        selectedNodeIds
      );

      // Manual: each new node must connect to every highlighted (selected) node
      const connectionMap = new Map();
      newNodeIds.forEach(newId => {
        connectionMap.set(String(newId), new Set());
      });

      console.log('Checking connections...');
      newData.links.forEach(link => {
        const source = String(link.source);
        const target = String(link.target);

        console.log(`Checking link: source=${source}, target=${target}`);

        if (!source || !target) {
          throw new Error(`Invalid link: missing source or target`);
        }

        if (newNodeIds.has(source) && selectedNodeIds.has(target)) {
          console.log(`Adding connection: ${source} -> ${target}`);
          connectionMap.get(source).add(target);
        }
      });

      console.log('Connection map:');
      connectionMap.forEach((connections, newId) => {
        console.log(`${newId} is connected to:`, Array.from(connections));
      });

      let isValid = true;
      const missingConnections = [];

      connectionMap.forEach((connections, newId) => {
        console.log(`Checking ${newId} connections:`, {
          has: Array.from(connections),
          needs: Array.from(selectedNodeIds)
        });

        if (connections.size !== selectedNodeIds.size) {
          isValid = false;
          const missing = Array.from(selectedNodeIds).filter(
            id => !connections.has(id)
          );
          missingConnections.push(
            `Node ${newId} has ${connections.size} connections but needs ${selectedNodeIds.size}. ` +
              `Missing connections to: ${missing
                .map(
                  id =>
                    `${id} (${selectedNodes.find(n => String(n.id) === id)?.label})`
                )
                .join(', ')}`
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

      await applySynthesizedRelationships(
        newData,
        existingGraphNodes,
        openai,
        validated.generationContext || ''
      );

      console.log('Validation passed:', {
        newNodes: newData.nodes.length,
        totalLinks: newData.links.length,
        connectionsPerNode: selectedNodeIds.size
      });
    }

    try {
      newData = await enrichGraphNodesWithThumbnails(newData, globalThis.fetch);
    } catch (thumbErr) {
      console.error('enrichGraphNodesWithThumbnails (generate-node) failed:', thumbErr);
    }
    newData = ensureGraphLinkStrength(newData);

    return res.json({
      success: true,
      data: newData,
      ...(validated.expansionAlgorithm === 'randomizedGrowth' &&
      Array.isArray(deletedNodeIds) &&
      deletedNodeIds.length > 0
        ? { deletedNodeIds }
        : {}),
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

/** GitHub #82 — memory-based iterative branch extrapolation (single round-trip; server runs all cycles). */
app.post('/api/generate-branch', async (req, res) => {
  const validated = validateGenerateBranchRequest(req.body);
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
      preview: buildGenerateBranchDryRunPreview(validated)
    });
  }

  try {
    const result = await executeGenerateBranch(openai, validated);
    if (!result.ok) {
      const status = result.status || (result.code === 'INVALID_MODEL_JSON' ? 502 : 400);
      return res.status(status).json({
        success: false,
        error: result.error,
        code: result.code,
        ...(result.details ? { details: result.details } : {})
      });
    }

    let newData = result.data;
    try {
      newData = await enrichGraphNodesWithThumbnails(newData, globalThis.fetch);
    } catch (thumbErr) {
      console.error('enrichGraphNodesWithThumbnails (generate-branch) failed:', thumbErr);
    }
    newData = ensureGraphLinkStrength(newData);

    return res.json({
      success: true,
      data: newData,
      ...(result.debug ? { debug: result.debug } : {})
    });
  } catch (error) {
    console.error('generate-branch error:', error);
    const httpStatus = openaiErrorHttpStatus(error);
    let statusCode = 500;
    let details = error.message || 'Unknown error';
    let code = 'GENERATE_BRANCH_FAILED';

    if (httpStatus === 429) {
      statusCode = 429;
      code = 'OPENAI_QUOTA';
      details =
        'OpenAI returned 429 (quota or rate limit). Add billing or credits in the OpenAI dashboard, or wait and retry.';
    } else if (httpStatus === 401) {
      statusCode = 401;
      code = 'OPENAI_AUTH';
      details =
        'OpenAI rejected the API key (401). Check that OPENAI_API_KEY is valid and not revoked.';
    }

    return res.status(statusCode).json({
      success: false,
      error: 'Failed to generate branch',
      details,
      code
    });
  }
});

/** GitHub #69 — Wikipedia-grounded dense subgraph from one anchor (clique + bridge links). */
app.post('/api/explode-node', async (req, res) => {
  try {
    const result = await runExplodeNodeCore({
      openai,
      fetchFn: globalThis.fetch,
      body: req.body,
    });
    if (!result.ok) {
      const st = result.status ?? 400;
      return res.status(st).json(result.payload);
    }
    let { data } = result;
    await applySynthesizedRelationships(
      data,
      req.body.existingGraphNodes,
      openai,
      typeof req.body.generationContext === 'string'
        ? req.body.generationContext.trim()
        : ''
    );
    try {
      data = await enrichGraphNodesWithThumbnails(data, globalThis.fetch);
    } catch (thumbErr) {
      console.error('enrichGraphNodesWithThumbnails (explode-node) failed:', thumbErr);
    }
    data = ensureGraphLinkStrength(data);

    return res.json({
      success: true,
      data,
      targetNodeId: result.targetNodeId,
    });
  } catch (error) {
    console.error('explode-node error:', error);
    const httpStatus = openaiErrorHttpStatus(error);
    let statusCode = 500;
    let details = error.message || 'Unknown error';
    let code = 'EXPLODE_NODE_FAILED';
    if (httpStatus === 429) {
      statusCode = 429;
      code = 'OPENAI_QUOTA';
      details =
        'OpenAI returned 429 (quota or rate limit). Add billing or credits in the OpenAI dashboard, or wait and retry.';
    } else if (httpStatus === 401) {
      statusCode = 401;
      code = 'OPENAI_AUTH';
      details =
        'OpenAI rejected the API key (401). Check that OPENAI_API_KEY is valid and not revoked.';
    }
    return res.status(statusCode).json({
      success: false,
      error: 'Failed to explode subgraph',
      details,
      code,
    });
  }
});

app.use('/api/sessions', sessionRoutes);
app.use('/api/feedback', feedbackRoutes);

// Start server (raise header limit — default ~16KB can trigger HTTP 431 with large cookies)
const PORT = process.env.PORT || 5001;
const maxHeaderSize = parseInt(process.env.HTTP_MAX_HEADER_SIZE || '', 10) || 65536;
const server = http.createServer({ maxHeaderSize }, app);
server.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health  or  http://localhost:${PORT}/api/test`);
  console.log(`Files endpoint: http://localhost:${PORT}/api/files`);
  console.log('OpenAI configured:', !!openai);
  console.log('CORS enabled, origins:', allowedOrigins);
  console.log('Data directory:', dataDir);
  console.log('Directories:');
  console.log(`- Uploads: ${uploadsDir}`);
  console.log(`- Metadata: ${metadataDir}`);
  console.log(`HTTP max header size (bytes): ${maxHeaderSize}`);
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
    const { fixGraphNodesIdUniqueIndex } = await import(
      './lib/fixGraphNodesIdIndex.js'
    );
    await fixGraphNodesIdUniqueIndex().catch((indexErr) => {
      console.error('Graph index fix (nodes.id) failed:', indexErr);
    });
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