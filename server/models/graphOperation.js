import mongoose from 'mongoose';

const graphOperationSchema = new mongoose.Schema({
  graphId: { type: mongoose.Schema.Types.ObjectId, ref: 'Graph' },
  sessionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  operationType: {
    type: String,
    enum: ['GENERATE', 'DELETE_NODE', 'ADD_NODE', 'ADD_RELATIONSHIP', 'DELETE_LINK'],
    required: true
  },
  timestamp: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE'],
    required: true,
    default: 'SUCCESS'
  },
  duration: { type: Number }, // Duration in milliseconds
  error: { type: String }, // Error message if status is FAILURE
  details: {
    // For GENERATE
    numNodesRequested: Number,
    selectedNodes: [{
      id: String,
      label: String
    }],
    generatedNodes: [{
      id: String,
      label: String
    }],
    
    // For DELETE_NODE
    deletedNode: {
      id: String,
      label: String
    },
    affectedRelationships: Number,
    
    // For ADD_NODE
    addedNode: {
      id: String,
      label: String,
      description: String,
      wikiUrl: String
    },
    
    // For ADD_RELATIONSHIP
    relationship: {
      sourceNode: {
        id: String,
        label: String
      },
      targetNode: {
        id: String,
        label: String
      },
      relationshipType: String
    }
  }
}, {
  timestamps: true
});

// Add indexes for common queries
graphOperationSchema.index({ graphId: 1, operationType: 1 });
graphOperationSchema.index({ timestamp: -1 });
graphOperationSchema.index({ sessionId: 1 });
graphOperationSchema.index({ status: 1 });
graphOperationSchema.index({ duration: 1 });

export default mongoose.model('GraphOperation', graphOperationSchema); 