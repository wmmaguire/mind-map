import { normalizeConceptLabel } from './wikipediaExtract.js';

export function validateNewNodesAgainstExisting(newData, forbidden) {
  const seenNew = new Set();
  for (const node of newData.nodes || []) {
    const k = normalizeConceptLabel(node.label || '');
    if (!k) continue;
    if (forbidden.has(k)) {
      return {
        ok: false,
        error: `Generated concept duplicates an existing graph node: "${node.label}"`,
        code: 'DUPLICATE_WITH_EXISTING'
      };
    }
    if (seenNew.has(k)) {
      return {
        ok: false,
        error: `Generated batch contains duplicate concepts: "${node.label}"`,
        code: 'DUPLICATE_WITHIN_BATCH'
      };
    }
    seenNew.add(k);
  }
  return { ok: true };
}
