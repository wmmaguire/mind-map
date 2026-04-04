/**
 * Persisted graph snapshots: save, list, load, view stats.
 * Paths: /api/graphs/save, /api/graphs, /api/graphs/:filename, /api/graphs/:graphId/views
 */
import express from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import mongoose from 'mongoose';
import Graph from '../models/graph.js';
import GraphView from '../models/graphView.js';
import { graphsDir } from '../config.js';
import { recordUserActivity } from '../lib/recordUserActivity.js';

const router = express.Router();

router.post('/graphs/save', async (req, res) => {
  try {
    const { graph, metadata } = req.body;

    if (!graph || !metadata) {
      return res.status(400).json({
        success: false,
        error: 'Missing graph data or metadata'
      });
    }

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
        sessionId: sessionObjectId
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
        sourceFiles: metadata.sourceFiles || []
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

    const files = await fs.readdir(graphsDir);
    const graphs = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
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

/** More specific than /graphs/:filename — register views route first. */
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
    const filePath = path.join(graphsDir, req.params.filename);

    const content = await fs.readFile(filePath, 'utf8');
    const fileData = JSON.parse(content);

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
            filename: req.params.filename
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
            summary: `Loaded graph file ${req.params.filename}`,
            meta: { graphId: String(dbGraph._id) }
          });
        } catch (viewErr) {
          console.error('Failed to save graph view:', viewErr);
          await recordUserActivity({
            sessionObjectId: sessionId,
            sessionUuid: fileData.metadata.sessionId,
            action: 'GRAPH_VIEW_RECORD',
            status: 'FAILURE',
            summary: `Graph view not persisted for ${req.params.filename}`,
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
