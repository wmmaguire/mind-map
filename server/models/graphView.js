import mongoose from 'mongoose';

const graphViewSchema = new mongoose.Schema({
  graphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Graph', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  viewedAt: { type: Date, default: Date.now },
  metadata: {
    loadSource: { type: String, enum: ['file', 'database'], default: 'file' },
    filename: String
  }
}, {
  timestamps: true
});

export default mongoose.model('GraphView', graphViewSchema); 