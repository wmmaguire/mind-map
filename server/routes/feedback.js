import express from 'express';
import Feedback from '../models/feedback.js';

const router = express.Router();

// POST - Submit new feedback
router.post('/', async (req, res) => {
  try {
    // Log the raw request
    console.log('Raw request body:', req.body);

    // Destructure and validate the required fields
    const { sessionId, comment, rating, category, tags, status } = req.body;

    if (!sessionId || !comment) {
      console.log('Missing required fields:', { sessionId, comment });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: { sessionId, comment }
      });
    }

    // Create the feedback document
    const feedbackDoc = {
      sessionId,
      comment,
      category: category || 'general',
      tags: tags || [],
      status: status || 'new'
    };

    // Only add rating if it's a valid number
    if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
      feedbackDoc.rating = rating;
    }

    console.log('Creating feedback with:', feedbackDoc);

    const feedback = new Feedback(feedbackDoc);
    const savedFeedback = await feedback.save();

    console.log('Saved feedback:', savedFeedback);

    res.status(201).json({
      success: true,
      message: 'Feedback saved successfully',
      feedback: savedFeedback
    });

  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save feedback',
      details: error.message
    });
  }
});

// GET - Retrieve all feedback
router.get('/', async (req, res) => {
  try {
    const feedback = await Feedback.find()
      .sort({ timestamp: -1 }) // Sort by newest first
      .limit(100); // Limit to last 100 entries

    res.json({
      success: true,
      feedback
    });
  } catch (error) {
    console.error('Error retrieving feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedback'
    });
  }
});

// GET - View feedback with filtering and pagination
router.get('/view', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      startDate,
      endDate,
      hasRating
    } = req.query;

    // Build query conditions
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    if (hasRating === 'true') {
      query.rating = { $exists: true };
    } else if (hasRating === 'false') {
      query.rating = { $exists: false };
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [feedback, total] = await Promise.all([
      Feedback.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Feedback.countDocuments(query)
    ]);

    res.json({
      success: true,
      feedback,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error retrieving feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve feedback',
      details: error.message
    });
  }
});

export default router; 