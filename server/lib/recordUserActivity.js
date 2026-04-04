import UserActivity from '../models/userActivity.js';
import { sessionUuidToObjectId } from './sessionObjectId.js';

/**
 * Persists an audit row. If MongoDB rejects the write, logs to stderr (last resort).
 * Callers should await so failures are not silently dropped at the application layer.
 */
export async function recordUserActivity({
  sessionObjectId,
  sessionUuid,
  action,
  status,
  summary,
  resourceType,
  resourceId,
  meta,
  errorMessage
}) {
  const sid = sessionObjectId ?? sessionUuidToObjectId(sessionUuid);
  if (!sid) {
    console.error('recordUserActivity: missing sessionObjectId / sessionUuid');
    return null;
  }

  try {
    const doc = new UserActivity({
      sessionId: sid,
      sessionUuid: sessionUuid || undefined,
      action,
      status,
      summary: summary != null ? String(summary).slice(0, 500) : undefined,
      resourceType,
      resourceId,
      meta,
      errorMessage:
        errorMessage != null ? String(errorMessage).slice(0, 2000) : undefined
    });
    await doc.save();
    return doc;
  } catch (err) {
    console.error('recordUserActivity: MongoDB save failed:', err);
    return null;
  }
}
