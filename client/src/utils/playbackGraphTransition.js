/**
 * Helpers for GitHub #86 — smoother playback scrub transitions (community-layer diff).
 * Used by {@link GraphVisualization} to detect newly visible communities / links after a scrub.
 */

/**
 * @param {{ id: unknown }[]} visibleElements
 * @returns {Set<string>}
 */
export function buildCommunityIdSet(visibleElements) {
  return new Set((visibleElements || []).map((d) => String(d.id)));
}

/**
 * Communities present in `visibleElements` but not in `prev` (first frame: empty set).
 * @param {Set<string>|null|undefined} prev
 * @param {{ id: unknown }[]} visibleElements
 * @returns {Set<string>}
 */
export function newCommunityIdsForPlaybackTransition(prev, visibleElements) {
  const nextIds = buildCommunityIdSet(visibleElements);
  if (!prev || prev.size === 0) return new Set();
  const added = new Set();
  for (const id of nextIds) {
    if (!prev.has(id)) added.add(id);
  }
  return added;
}

/**
 * @param {{ source: { id: unknown }, target: { id: unknown } }} link
 */
export function linkKeyForProcessedCommunityLink(link) {
  return `${link.source.id}|${link.target.id}`;
}

/**
 * @param {Set<string>|null|undefined} prevKeys
 * @param {{ source: { id: unknown }, target: { id: unknown } }[]} processedLinks
 * @returns {Set<string>}
 */
export function newLinkKeysForPlaybackTransition(prevKeys, processedLinks) {
  const next = new Set((processedLinks || []).map(linkKeyForProcessedCommunityLink));
  if (!prevKeys || prevKeys.size === 0) return new Set();
  const added = new Set();
  for (const k of next) {
    if (!prevKeys.has(k)) added.add(k);
  }
  return added;
}
