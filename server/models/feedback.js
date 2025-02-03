import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: false
  },
  comment: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 1000
  },
  category: {
    type: String,
    enum: ['bug', 'feature_request', 'general', 'ui_ux', 'performance', 'other'],
    default: 'general'
  },
  tags: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['new', 'in_review', 'addressed', 'closed'],
    default: 'new'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Add indexes for common queries
feedbackSchema.index({ category: 1, created_at: -1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ status: 1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);
export default Feedback; 