import mongoose from 'mongoose';

const payloadSchema = new mongoose.Schema(
  {
    nodes: { type: Array, default: [] },
    links: { type: Array, default: [] },
  },
  { _id: false, strict: false }
);

export const nodeSchema = new mongoose.Schema({
  /** Unique only within one graph document — not globally (multi-file namespaces reuse patterns). */
  id: { type: String, required: true },
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
    /**
     * Legacy disk filename (e.g. graph_1712345678901.json). We keep this so the
     * client can continue using /api/graphs/:filename while the storage moves to Mongo.
     */
    filename: { type: String, trim: true, sparse: true, unique: true, index: true },
    name: { type: String, required: true },
    description: String,
    sourceFiles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }],
    generatedAt: { type: Date, default: Date.now },
    lastModified: { type: Date, default: Date.now },
    nodeCount: Number,
    edgeCount: Number,
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    /** Session UUID as used by client and file metadata (string). */
    sessionUuid: { type: String, trim: true, index: true },
    /** Optional authenticated owner when accounts exist (#32). */
    userId: { type: String, trim: true, sparse: true },
    /** Opaque read-only share secret for GET /api/graphs/:file (#39); never returned in API bodies. */
    shareReadToken: { type: String, trim: true, sparse: true },
  },
  /**
   * Canonical graph JSON stored durably in Mongo.
   * Shape matches what the client expects: { nodes: [{id,...}], links: [{source,target,relationship,...}] }
   */
  payload: { type: payloadSchema, default: () => ({ nodes: [], links: [] }) },
  nodes: [nodeSchema],
  links: [linkSchema]
}, {
  timestamps: true
});

// Add indexes for common queries
graphSchema.index({ 'metadata.sessionId': 1 });
graphSchema.index({ 'metadata.sessionUuid': 1 });
graphSchema.index({ 'metadata.userId': 1 });
graphSchema.index({ 'metadata.generatedAt': -1 });
graphSchema.index({ 'nodes.id': 1 });

const Graph = mongoose.model('Graph', graphSchema);

export default Graph; 