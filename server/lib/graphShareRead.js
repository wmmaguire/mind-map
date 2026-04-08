import crypto from 'crypto';

/**
 * Constant-time string compare for share tokens (GitHub #39).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Read access for persisted graph JSON files.
 * Session-only graphs (no metadata.userId) stay world-readable if the filename is known (legacy).
 * Account-owned graphs require matching {@link headerUserId} or a valid `shareToken` query.
 *
 * @param {object} metadata - Parsed `metadata` from graph JSON
 * @param {string} [headerUserId] - Trimmed `X-Mindmap-User-Id`
 * @param {string} [queryShareToken] - `?shareToken=` value
 * @returns {{ allowed: boolean, viaShare: boolean }}
 */
export function evaluateOwnedGraphRead(metadata, headerUserId, queryShareToken) {
  const metaUid = metadata?.userId;
  const hasOwner = metaUid != null && String(metaUid).trim() !== '';
  if (!hasOwner) {
    return { allowed: true, viaShare: false };
  }

  const header = typeof headerUserId === 'string' ? headerUserId.trim() : '';
  if (header === String(metaUid).trim()) {
    return { allowed: true, viaShare: false };
  }

  const q = typeof queryShareToken === 'string' ? queryShareToken.trim() : '';
  const stored = metadata?.shareReadToken;
  if (
    stored &&
    typeof stored === 'string' &&
    q &&
    timingSafeEqualString(stored, q)
  ) {
    return { allowed: true, viaShare: true };
  }

  return { allowed: false, viaShare: false };
}

/**
 * Never expose the secret to clients; hide dbId for share viewers (no view-stats fan-out).
 * @param {object} metadata
 * @param {{ shareViewer: boolean }} options
 * @returns {object}
 */
export function redactGraphMetadataForResponse(metadata, { shareViewer }) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  const m = { ...metadata };
  delete m.shareReadToken;
  if (shareViewer) delete m.dbId;
  return m;
}
