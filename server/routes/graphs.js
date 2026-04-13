/**
 * Persisted graph snapshots: save, list, load, view stats.
 * Paths: /api/graphs/save, /api/graphs, POST …/share-read-token, /api/graphs/:filename, /api/graphs/:graphId/views
 */
import express from 'express';
import mongoose from 'mongoose';
import Graph from '../models/graph.js';
import GraphView from '../models/graphView.js';
import { recordUserActivity } from '../lib/recordUserActivity.js';
import {
  evaluateOwnedGraphRead,
  redactGraphMetadataForResponse,
  stripShareSecretFromSaveMetadata,
} from '../lib/graphShareRead.js';
import { enrichGraphNodesWithThumbnails } from '../lib/enrichGraphNodesWithThumbnails.js';
import crypto from 'crypto';

const router = express.Router();

const USER_ID_HEADER = 'x-mindmap-user-id';

router.post('/graphs/save', async (req, res) => {
  try {
    const shareTokQ =
      req.query.shareToken != null ? String(req.query.shareToken).trim() : '';
    if (shareTokQ !== '') {
      return res.status(403).json({
        success: false,
        error: 'Share token cannot authorize writes',
        code: 'SHARE_READ_ONLY',
      });
    }

    const { graph, metadata: rawMetaIn } = req.body;
    const rawMeta = stripShareSecretFromSaveMetadata(rawMetaIn);

    if (!graph || !rawMeta) {
      return res.status(400).json({
        success: false,
        error: 'Missing graph data or metadata'
      });
    }

    const headerUserId =
      typeof req.get(USER_ID_HEADER) === 'string'
        ? req.get(USER_ID_HEADER).trim()
        : '';
    const bodyUserId =
      rawMeta.userId && typeof rawMeta.userId === 'string'
        ? rawMeta.userId.trim()
        : '';
    const resolvedUserId = headerUserId || bodyUserId || '';

    const metadata = {
      ...rawMeta,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    };

    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
      return res.status(400).json({
        success: false,
        error: 'Graph must include nodes[] and links[] arrays',
        code: 'INVALID_GRAPH_SHAPE',
      });
    }

    const processedNodes = graph.nodes.map((node) => ({
      id: String(node.id),
      label: node.label || '',
      description: node.description || '',
      wikiUrl: node.wikiUrl || node.wikipediaUrl || '',
      size: node.size || 20,
      color: node.color || '#4a90e2',
      ...(node.createdAt != null ? { createdAt: node.createdAt } : {}),
      ...(node.timestamp != null ? { timestamp: node.timestamp } : {}),
      ...(node.deletedAt != null ? { deletedAt: node.deletedAt } : {}),
      ...(typeof node.thumbnailUrl === 'string' && node.thumbnailUrl.trim()
        ? { thumbnailUrl: node.thumbnailUrl.trim() }
        : {}),
    }));

    const processedLinks = graph.links.map((link) => ({
      source: String(typeof link.source === 'object' ? link.source.id : link.source),
      target: String(typeof link.target === 'object' ? link.target.id : link.target),
      relationship: link.relationship || '',
      ...(link.createdAt != null ? { createdAt: link.createdAt } : {}),
      ...(link.timestamp != null ? { timestamp: link.timestamp } : {}),
      ...(link.deletedAt != null ? { deletedAt: link.deletedAt } : {}),
    }));

    const sourceFiles = [];

    const sessionObjectId = new mongoose.Types.ObjectId(
      parseInt(metadata.sessionId.replace(/-/g, '').slice(0, 12), 16)
    );

    const filename = `graph_${Date.now()}.json`;

    const dbGraph = new Graph({
      metadata: {
        filename,
        name: metadata.name || 'Untitled Graph',
        description: metadata.description || '',
        sourceFiles,
        generatedAt: metadata.generatedAt
          ? new Date(metadata.generatedAt)
          : new Date(),
        lastModified: new Date(),
        nodeCount: processedNodes.length,
        edgeCount: processedLinks.length,
        sessionId: sessionObjectId,
        sessionUuid: metadata.sessionId,
        ...(metadata.userId && typeof metadata.userId === 'string'
          ? { userId: metadata.userId.trim() }
          : {}),
      },
      payload: {
        nodes: processedNodes,
        links: processedLinks,
      },
      nodes: processedNodes,
      // Legacy schema field (ObjectId refs) is no longer canonical; leave empty.
      links: []
    });

    await dbGraph.save();

    await recordUserActivity({
      sessionObjectId,
      sessionUuid: metadata.sessionId,
      action: 'GRAPH_SNAPSHOT_SAVE',
      status: 'SUCCESS',
      resourceType: 'Graph',
      resourceId: dbGraph._id,
      summary: `Saved graph "${dbGraph.metadata.name}" (${processedNodes.length} nodes)`
    });

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

router.get('/graphs', async (req, res) => {
  try {
    const userId =
      (typeof req.query.userId === 'string' && req.query.userId.trim()) ||
      (typeof req.get(USER_ID_HEADER) === 'string' &&
        req.get(USER_ID_HEADER).trim()) ||
      null;
    const sessionId =
      typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

    const query = userId
      ? { 'metadata.userId': userId }
      : sessionId
        ? {
            'metadata.sessionUuid': sessionId,
            $or: [
              { 'metadata.userId': { $exists: false } },
              { 'metadata.userId': null },
              { 'metadata.userId': '' },
            ],
          }
        : {};

    const docs = await Graph.find(query)
      .sort({ 'metadata.generatedAt': -1 })
      .lean();

    const graphs = docs.map((g) => ({
      filename: g?.metadata?.filename || String(g._id),
      metadata: redactGraphMetadataForResponse(g.metadata || {}, {
        shareViewer: false,
      }),
    }));

    res.json({
      success: true,
      graphs,
      listingScope: userId
        ? 'userId'
        : sessionId
          ? 'sessionId'
          : 'legacy',
    });
  } catch (error) {
    console.error('Error listing graphs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list graphs',
    });
  }
});

/** More specific than /graphs/:filename — register views route first. */
/**
 * Mint or rotate a read-only share token (account-owned graphs only, GitHub #39).
 * Requires `X-Mindmap-User-Id` matching `metadata.userId` on the snapshot file.
 */
router.post('/graphs/:filename/share-read-token', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);

    const headerUserId =
      typeof req.get(USER_ID_HEADER) === 'string'
        ? req.get(USER_ID_HEADER).trim()
        : '';
    if (!headerUserId) {
      return res.status(403).json({
        success: false,
        error: 'Account identity required to create a share link',
        code: 'FORBIDDEN',
      });
    }

    const dbGraph = await Graph.findOne({ 'metadata.filename': filename }).lean();
    if (!dbGraph) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
        code: 'NOT_FOUND',
      });
    }

    const metaUid = dbGraph?.metadata?.userId;
    if (metaUid == null || String(metaUid).trim() === '') {
      return res.status(400).json({
        success: false,
        error:
          'Share links are only available for graphs saved while signed in (metadata.userId).',
        code: 'SHARE_REQUIRES_ACCOUNT_GRAPH',
      });
    }
    if (headerUserId !== String(metaUid).trim()) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    try {
      await Graph.findOneAndUpdate(
        { 'metadata.filename': filename },
        { $set: { 'metadata.shareReadToken': token } }
      );
    } catch (dbErr) {
      console.warn('Could not persist shareReadToken on Graph document:', dbErr);
    }

    return res.json({
      success: true,
      shareReadToken: token,
      filename,
    });
  } catch (error) {
    console.error('share-read-token error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create share token',
    });
  }
});

router.get('/graphs/:graphId/views', async (req, res) => {
  try {
    const views = await GraphView.find({ graphId: req.params.graphId })
      .sort({ viewedAt: -1 })
      .limit(100);

    const viewStats = {
      totalViews: await GraphView.countDocuments({ graphId: req.params.graphId }),
      recentViews: views.map((view) => ({
        viewedAt: view.viewedAt,
        loadSource: view.metadata.loadSource
      }))
    };

    res.json({
      success: true,
      stats: viewStats
    });
  } catch (error) {
    console.error('Error getting view stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get view statistics'
    });
  }
});

router.get('/graphs/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    let fileData = null;
    let viaMongo = false;

    let dbGraph = null;
    try {
      dbGraph = await Graph.findOne({ 'metadata.filename': filename }).lean();
    } catch (e) {
      // Allow file-based loads when Mongo is unavailable (tests, local dev without DB).
      console.warn('Mongo graph lookup skipped:', e?.message || e);
      dbGraph = null;
    }

    if (dbGraph) {
      viaMongo = true;
      fileData = {
        graph: dbGraph.payload || { nodes: [], links: [] },
        metadata: {
          ...(dbGraph.metadata || {}),
          dbId: dbGraph._id,
          // For client expectations: sessionId is the session UUID string.
          sessionId: dbGraph.metadata?.sessionUuid || dbGraph.metadata?.sessionId,
        },
      };
    } else {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
        code: 'NOT_FOUND',
      });
    }

    const headerUserId =
      typeof req.get(USER_ID_HEADER) === 'string'
        ? req.get(USER_ID_HEADER).trim()
        : '';
    const queryShareToken =
      typeof req.query.shareToken === 'string' ? req.query.shareToken : '';

    const { allowed, viaShare } = evaluateOwnedGraphRead(
      fileData.metadata,
      headerUserId,
      queryShareToken
    );
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }

    console.log(`Loading graph from ${viaMongo ? 'mongo' : 'file'}:`, {
      nodes: fileData.graph.nodes.length,
      links: fileData.graph.links.map((l) => ({
        source: l.source,
        target: l.target,
        relationship: l.relationship
      }))
    });

    try {
      const graphIdForViews = dbGraph?._id;
      if (graphIdForViews) {
        const sessionUuid = String(fileData.metadata.sessionId || '').trim();
        const sessionIdObj =
          sessionUuid && sessionUuid.includes('-')
            ? new mongoose.Types.ObjectId(
                parseInt(sessionUuid.replace(/-/g, '').slice(0, 12), 16)
              )
            : new mongoose.Types.ObjectId();

        const graphView = new GraphView({
          graphId: graphIdForViews,
          sessionId: sessionIdObj,
          metadata: {
            loadSource: viaMongo ? 'database' : 'file',
            filename,
          },
        });

        try {
          await graphView.save();
          await recordUserActivity({
            sessionObjectId: sessionIdObj,
            sessionUuid,
            action: 'GRAPH_VIEW_RECORD',
            status: 'SUCCESS',
            resourceType: 'GraphView',
            resourceId: graphView._id,
            summary: `Loaded graph file ${filename}`,
            meta: { graphId: String(graphIdForViews) }
          });
        } catch (viewErr) {
          console.error('Failed to save graph view:', viewErr);
          await recordUserActivity({
            sessionObjectId: sessionIdObj,
            sessionUuid,
            action: 'GRAPH_VIEW_RECORD',
            status: 'FAILURE',
            summary: `Graph view not persisted for ${filename}`,
            errorMessage: viewErr.message
          });
        }
      }
    } catch (dbError) {
      console.warn('Database load warning:', dbError);
    }

    console.log('Sending graph data:', {
      nodes: fileData.graph.nodes.length,
      links: fileData.graph.links.map((l) => ({
        source: l.source,
        target: l.target,
        relationship: l.relationship
      }))
    });

    let graphForResponse = fileData.graph;
    try {
      graphForResponse = await enrichGraphNodesWithThumbnails(
        fileData.graph,
        globalThis.fetch
      );
    } catch (thumbErr) {
      console.error('enrichGraphNodesWithThumbnails (load graph) failed:', thumbErr);
    }

    const safeMeta = redactGraphMetadataForResponse(fileData.metadata, {
      shareViewer: viaShare,
    });

    res.json({
      success: true,
      data: {
        ...fileData,
        graph: graphForResponse,
        metadata: safeMeta,
      },
    });
  } catch (error) {
    console.error('Error loading graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load graph',
      code: 'LOAD_FAILED',
    });
  }
});

export default router;
