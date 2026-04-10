/**
 * Persisted graph snapshots: save, list, load, view stats.
 * Paths: /api/graphs/save, /api/graphs, POST …/share-read-token, /api/graphs/:filename, /api/graphs/:graphId/views
 */
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import mongoose from 'mongoose';
import Graph from '../models/graph.js';
import GraphView from '../models/graphView.js';
import { graphsDir } from '../config.js';
import { recordUserActivity } from '../lib/recordUserActivity.js';
import {
  evaluateOwnedGraphRead,
  redactGraphMetadataForResponse,
  stripShareSecretFromSaveMetadata,
} from '../lib/graphShareRead.js';
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

    const uniquePrefix = Date.now().toString(36) + '-';

    const nodeMap = new Map();
    const processedNodes = graph.nodes.map((node) => {
      const nodeId = uniquePrefix + node.id.toString();
      const objectId = new mongoose.Types.ObjectId();
      nodeMap.set(nodeId, objectId);
      return {
        id: nodeId,
        label: node.label || '',
        description: node.description || '',
        wikiUrl: node.wikiUrl || '',
        size: node.size || 20,
        color: node.color || '#4a90e2'
      };
    });

    const sourceFiles =
      metadata.sourceFiles
        ?.map(() => {
          try {
            return new mongoose.Types.ObjectId();
          } catch (error) {
            return null;
          }
        })
        .filter((id) => id !== null) || [];

    const processedLinks = graph.links.map((link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      return {
        source: nodeMap.get(uniquePrefix + sourceId.toString()),
        target: nodeMap.get(uniquePrefix + targetId.toString()),
        relationship: link.relationship || ''
      };
    });

    const sessionObjectId = new mongoose.Types.ObjectId(
      parseInt(metadata.sessionId.replace(/-/g, '').slice(0, 12), 16)
    );

    const dbGraph = new Graph({
      metadata: {
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
        ...(metadata.userId && typeof metadata.userId === 'string'
          ? { userId: metadata.userId.trim() }
          : {}),
      },
      nodes: processedNodes,
      links: processedLinks
    });

    const graphData = {
      graph: {
        nodes: processedNodes,
        links: graph.links.map((link) => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;

          return {
            source: uniquePrefix + sourceId.toString(),
            target: uniquePrefix + targetId.toString(),
            relationship: link.relationship || ''
          };
        })
      },
      metadata: {
        ...dbGraph.metadata,
        sessionId: metadata.sessionId,
        sourceFiles: metadata.sourceFiles || [],
        ...(metadata.userId && typeof metadata.userId === 'string'
          ? { userId: metadata.userId.trim() }
          : {}),
      }
    };

    const filename = `graph_${Date.now()}.json`;

    await fs.mkdir(graphsDir, { recursive: true });
    await fs.writeFile(path.join(graphsDir, filename), JSON.stringify(graphData, null, 2));

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
    await fs.mkdir(graphsDir, { recursive: true });

    const userId =
      (typeof req.query.userId === 'string' && req.query.userId.trim()) ||
      (typeof req.get(USER_ID_HEADER) === 'string' &&
        req.get(USER_ID_HEADER).trim()) ||
      null;
    const sessionId =
      typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';

    const files = await fs.readdir(graphsDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    const graphs = [];
    for (const file of jsonFiles) {
      const content = await fs.readFile(path.join(graphsDir, file), 'utf8');
      const data = JSON.parse(content);
      const meta = data.metadata || {};
      if (userId) {
        if (meta.userId !== userId) continue;
      } else if (sessionId) {
        if (meta.sessionId !== sessionId) continue;
        // Account-owned graphs must not appear in session-only listing after logout.
        if (
          meta.userId != null &&
          String(meta.userId).trim() !== ''
        ) {
          continue;
        }
      }
      graphs.push({
        filename: file,
        metadata: meta,
      });
    }

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
    const filePath = path.join(graphsDir, filename);

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

    let content;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
        code: 'NOT_FOUND',
      });
    }

    const fileData = JSON.parse(content);
    const metaUid = fileData.metadata?.userId;
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
    fileData.metadata = {
      ...fileData.metadata,
      shareReadToken: token,
    };

    await fs.writeFile(filePath, JSON.stringify(fileData, null, 2));

    try {
      await Graph.findOneAndUpdate(
        { 'metadata.generatedAt': fileData.metadata.generatedAt },
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
    const filePath = path.join(graphsDir, filename);

    const content = await fs.readFile(filePath, 'utf8');
    const fileData = JSON.parse(content);

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

    console.log('Loading graph from file:', {
      nodes: fileData.graph.nodes.length,
      links: fileData.graph.links.map((l) => ({
        source: l.source,
        target: l.target,
        relationship: l.relationship
      }))
    });

    try {
      const dbGraph = await Graph.findOne({
        'metadata.generatedAt': fileData.metadata.generatedAt
      });

      if (dbGraph) {
        fileData.metadata = {
          ...fileData.metadata,
          dbId: dbGraph._id
        };

        const sessionId = new mongoose.Types.ObjectId(
          parseInt(fileData.metadata.sessionId.replace(/-/g, '').slice(0, 12), 16)
        );

        const graphView = new GraphView({
          graphId: dbGraph._id,
          sessionId,
          metadata: {
            loadSource: 'file',
            filename,
          }
        });

        try {
          await graphView.save();
          await recordUserActivity({
            sessionObjectId: sessionId,
            sessionUuid: fileData.metadata.sessionId,
            action: 'GRAPH_VIEW_RECORD',
            status: 'SUCCESS',
            resourceType: 'GraphView',
            resourceId: graphView._id,
            summary: `Loaded graph file ${filename}`,
            meta: { graphId: String(dbGraph._id) }
          });
        } catch (viewErr) {
          console.error('Failed to save graph view:', viewErr);
          await recordUserActivity({
            sessionObjectId: sessionId,
            sessionUuid: fileData.metadata.sessionId,
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

    const safeMeta = redactGraphMetadataForResponse(fileData.metadata, {
      shareViewer: viaShare,
    });

    res.json({
      success: true,
      data: {
        ...fileData,
        metadata: safeMeta,
      },
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
