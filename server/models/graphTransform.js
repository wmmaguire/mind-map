import mongoose from 'mongoose';

const graphTransformSchema = new mongoose.Schema({
  sessionId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true 
  },
  sourceFiles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    required: true
  }],
  context: String,
  result: {
    type: mongoose.Schema.Types.Mixed,  // Allow any JSON structure
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  startedAt: {
    type: Date,
    default: Date.now,  // Set automatically when document is created
    required: true
  },
  completedAt: Date,
  error: String
}, {
  timestamps: true
});

graphTransformSchema.index({ sessionId: 1, 'sourceFiles': 1 });
graphTransformSchema.index({ status: 1, createdAt: -1 });
graphTransformSchema.index({ startedAt: -1 }); // Add index for startedAt

const GraphTransform = mongoose.model('GraphTransform', graphTransformSchema);

export default GraphTransform; 