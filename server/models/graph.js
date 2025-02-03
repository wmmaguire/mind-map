import mongoose from 'mongoose';

export const nodeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  label: String,
  description: String,
  wikiUrl: String,
  size: { type: Number, default: 20 },
  color: { type: String, default: '#4a90e2' }
});

export const linkSchema = new mongoose.Schema({
  source: { type: mongoose.Schema.Types.ObjectId, ref: 'Node', required: true },
  target: { type: mongoose.Schema.Types.ObjectId, ref: 'Node', required: true },
  relationship: String,
});

const graphSchema = new mongoose.Schema({
  metadata: {
    name: { type: String, required: true },
    description: String,
    sourceFiles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }],
    generatedAt: { type: Date, default: Date.now },
    lastModified: { type: Date, default: Date.now },
    nodeCount: Number,
    edgeCount: Number,
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  },
  nodes: [nodeSchema],
  links: [linkSchema]
}, {
  timestamps: true
});

// Add indexes for common queries
graphSchema.index({ 'metadata.sessionId': 1 });
graphSchema.index({ 'metadata.generatedAt': -1 });
graphSchema.index({ 'nodes.id': 1 });

const Graph = mongoose.model('Graph', graphSchema);

export default Graph; 