import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,  // Ensures one-to-one relationship with session
    index: true
  },
  customName: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  uploadTime: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  fileType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,  // Size in bytes
    required: true
  },
  path: {
    type: String,
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Add indexes for common queries
fileSchema.index({ uploadTime: -1 });
fileSchema.index({ fileType: 1 });
fileSchema.index({ fileSize: 1 });

// Add virtual for formatted file size
fileSchema.virtual('formattedSize').get(function() {
  const bytes = this.fileSize;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
});

const File = mongoose.model('File', fileSchema);
export default File; 