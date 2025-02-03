import express from 'express';
import { Session } from '../models/session.js';
import { UserMetadata } from '../models/userMetadata.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Initialize session
router.post('/', async (req, res) => {
  try {
    const { userMetadata, sessionStart } = req.body;
    console.log('Initializing session with:', { userMetadata, sessionStart });
    
    // Create or find existing user metadata
    let userMetadataDoc = await UserMetadata.findOne({
      browser: userMetadata.browser,
      os: userMetadata.os,
      'screenResolution.width': userMetadata.screenResolution.width,
      'screenResolution.height': userMetadata.screenResolution.height,
      language: userMetadata.language,
      timezone: userMetadata.timezone
    });

    if (!userMetadataDoc) {
      userMetadataDoc = new UserMetadata(userMetadata);
      await userMetadataDoc.save();
    }

    const session = new Session({
      sessionId: uuidv4(),
      userMetadataId: userMetadataDoc._id,
      sessionStart: new Date(sessionStart),
      sessionEnd: new Date(sessionStart), // Initialize with start time
      sessionDuration: 0
    });

    await session.save();
    console.log('Session created:', session);

    res.status(200).json({ 
      message: 'Session created successfully',
      sessionId: session.sessionId
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session', details: error.message });
  }
});

// Update session end time
router.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    let data;
    
    // Handle both regular POST and sendBeacon
    if (req.headers['content-type'] === 'application/json') {
      data = req.body;
    } else {
      const text = await req.text();
      data = JSON.parse(text);
    }
    
    const { sessionEnd, sessionDuration } = data;
    console.log('Updating session:', { sessionId, sessionEnd, sessionDuration });

    const session = await Session.findOne({ sessionId });
    if (!session) {
      console.log('Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    session.sessionEnd = new Date(sessionEnd);
    session.sessionDuration = sessionDuration || 0;
    
    console.log('Saving updated session:', session);
    await session.save();

    // sendBeacon doesn't care about the response
    res.status(200).json({ message: 'Session updated successfully' });
  } catch (error) {
    console.error('Error updating session:', error);
    // sendBeacon doesn't care about the error response
    res.status(500).json({ 
      error: 'Failed to update session', 
      details: error.message,
      sessionId: req.params.sessionId 
    });
  }
});

// Get current session
router.get('/current', async (req, res) => {
  try {
    const session = await Session.findOne({
      $expr: { $eq: ["$sessionEnd", "$sessionStart"] }  // Find where sessionEnd equals sessionStart
    }).sort({ sessionStart: -1 });  // Get the most recent one

    if (!session) {
      return res.status(404).json({ error: 'No active session found' });
    }

    res.json({ sessionId: session.sessionId });
  } catch (error) {
    console.error('Error getting current session:', error);
    res.status(500).json({ error: 'Failed to get current session' });
  }
});

export default router; 