import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userMetadataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserMetadata',
    required: true
  },
  sessionStart: {
    type: Date,
    required: true
  },
  sessionEnd: {
    type: Date,
    required: true
  },
  sessionDuration: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for common queries
sessionSchema.index({ sessionStart: 1 });
sessionSchema.index({ sessionDuration: 1 });

export const Session = mongoose.model('Session', sessionSchema); 