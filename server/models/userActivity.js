import mongoose from 'mongoose';

/**
 * Cross-cutting audit trail for support and analytics. Domain collections
 * (File, Graph, GraphTransform, Feedback, GraphOperation) remain source of
 * truth for their flows; this model records outcomes and links when useful.
 */
const userActivitySchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true
    },
    sessionUuid: { type: String, index: true },
    action: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILURE'],
      required: true,
      index: true
    },
    resourceType: { type: String },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    summary: { type: String, maxlength: 500 },
    meta: { type: mongoose.Schema.Types.Mixed },
    errorMessage: { type: String, maxlength: 2000 }
  },
  { timestamps: true }
);

userActivitySchema.index({ createdAt: -1 });
userActivitySchema.index({ sessionId: 1, action: 1, createdAt: -1 });

export default mongoose.model('UserActivity', userActivitySchema);
