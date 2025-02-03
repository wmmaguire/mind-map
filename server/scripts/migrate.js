import mongoose from 'mongoose';
import { UserMetadata } from '../models/userMetadata.js';
import { Analytics } from '../models/session.js';
import Feedback from '../models/feedback.js';
import { v4 as uuidv4 } from 'uuid';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/feedback_dev';

async function migrate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all existing feedback
    const existingFeedback = await Feedback.find({});
    console.log(`Found ${existingFeedback.length} feedback entries to migrate`);

    for (const feedback of existingFeedback) {
      try {
        // Create or find UserMetadata from feedback.userMetadata
        if (feedback.userMetadata) {
          const userMetadata = new UserMetadata({
            browser: feedback.userMetadata.browser,
            os: feedback.userMetadata.os,
            screenResolution: feedback.userMetadata.screenResolution,
            language: feedback.userMetadata.language,
            timezone: feedback.userMetadata.timezone
          });
          await userMetadata.save();

          // Create Analytics entry
          const analytics = new Analytics({
            sessionId: feedback.sessionId || uuidv4(),
            userMetadataId: userMetadata._id,
            sessionStart: feedback.created_at,
            sessionEnd: feedback.created_at, // Use creation time for both since we don't have actual session data
            sessionDuration: 0 // Default to 0 since we don't have actual duration
          });
          await analytics.save();

          // Update feedback to use new schema
          feedback.sessionId = analytics.sessionId;
          delete feedback.userMetadata;
          delete feedback.sentiment; // Remove sentiment field if it exists
          await feedback.save();

          console.log(`Migrated feedback ID: ${feedback._id}`);
        }
      } catch (error) {
        console.error(`Error migrating feedback ID ${feedback._id}:`, error);
      }
    }

    console.log('Migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run migration
migrate(); 