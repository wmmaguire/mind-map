/**
 * Manual AI expansion: keep only edges between a **new** node and a **selected anchor**.
 * Strips model hallucinations (edges to unrelated existing nodes). Accepts either
 * direction from the model and normalizes to `{ source: newId, target: anchorId }`.
 *
 * @param {Array} links
 * @param {Set<string>|Iterable<string>} newNodeIds
 * @param {Set<string>|Iterable<string>} selectedNodeIds
 */
export function normalizeManualExpansionLinks(links, newNodeIds, selectedNodeIds) {
  const newSet =
    newNodeIds instanceof Set
      ? newNodeIds
      : new Set([...newNodeIds].map(String));
  const selSet =
    selectedNodeIds instanceof Set
      ? selectedNodeIds
      : new Set([...selectedNodeIds].map(String));
  const out = [];
  const seen = new Set();
  for (const link of links || []) {
    if (!link || link.source == null || link.target == null) continue;
    const s = String(link.source);
    const t = String(link.target);
    let newId;
    let anchorId;
    if (newSet.has(s) && selSet.has(t)) {
      newId = s;
      anchorId = t;
    } else if (selSet.has(s) && newSet.has(t)) {
      newId = t;
      anchorId = s;
    } else {
      continue;
    }
    const key = `${newId}|${anchorId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...link,
      source: newId,
      target: anchorId
    });
  }
  return out;
}
