import mongoose from 'mongoose';

/**
 * Derives the same 12-byte ObjectId the client stack uses from a session UUID.
 * Prefer Session._id from a DB lookup when available.
 */
export function sessionUuidToObjectId(sessionUuid) {
  if (!sessionUuid || typeof sessionUuid !== 'string') {
    return null;
  }
  return new mongoose.Types.ObjectId(
    parseInt(sessionUuid.replace(/-/g, '').slice(0, 12), 16)
  );
}
