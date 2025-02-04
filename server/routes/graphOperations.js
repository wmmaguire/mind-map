import express from 'express';
import mongoose from 'mongoose';
import GraphOperation from '../models/graphOperation.js';

const router = express.Router();

// Track graph operations
router.post('/operations', async (req, res) => {
  try {
    const { 
      graphId,
      sessionId,
      operationType,
      status,
      duration,
      error,
      details
    } = req.body;

    if (!sessionId || !operationType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Convert UUID sessionId to ObjectId
    const sessionObjectId = new mongoose.Types.ObjectId(
      parseInt(sessionId.replace(/-/g, '').slice(0, 12), 16)
    );

    const operation = new GraphOperation({
      graphId: graphId ? new mongoose.Types.ObjectId(graphId) : undefined,
      sessionId: sessionObjectId,
      operationType,
      status,
      duration,
      error,
      details
    });

    await operation.save();

    res.json({
      success: true,
      operationId: operation._id
    });
  } catch (error) {
    console.error('Error tracking operation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track operation: ' + error.message
    });
  }
});

// Get operations for a graph
router.get('/graphs/:graphId/operations', async (req, res) => {
  try {
    const operations = await GraphOperation.find({
      graphId: new mongoose.Types.ObjectId(req.params.graphId)
    })
    .sort({ timestamp: -1 })
    .limit(100);

    res.json({
      success: true,
      operations
    });
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch operations'
    });
  }
});

export default router; 