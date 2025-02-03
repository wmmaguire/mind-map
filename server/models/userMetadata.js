import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const userMetadataSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: () => uuidv4(),
    required: true,
    index: true
  },
  browser: {
    type: String,
    enum: ['safari', 'firefox', 'chrome', 'edge', 'other'],
    required: true
  },
  os: {
    type: String,
    enum: ['windows', 'macos', 'linux', 'ios', 'android', 'other'],
    required: true
  },
  screenResolution: {
    width: { type: Number, required: true },
    height: { type: Number, required: true }
  },
  language: {
    type: String,
    required: true
  },
  timezone: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for common queries
userMetadataSchema.index({ browser: 1 });
userMetadataSchema.index({ os: 1 });
userMetadataSchema.index({ createdAt: 1 });

export const UserMetadata = mongoose.model('UserMetadata', userMetadataSchema); 