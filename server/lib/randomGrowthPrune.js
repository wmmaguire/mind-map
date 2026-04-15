/**
 * Optional per-request pruning for randomized growth (GitHub #68).
 */

import {
  degreeMapOnPool,
  pickDistinctByDegreeStrategy,
  clampStrategy,
} from './randomExpansionLinks.js';

/**
 * @param {string[]} existingIds - all graph node ids before this batch
 * @param {string[]} anchorIds - selected / highlighted ids (never deleted)
 * @param {string[]} newBatchIds - ids of new nodes in this response (never deleted)
 * @param {{ source: string, target: string }[]} undirectedEdges - edges among existing graph
 * @param {number} count - how many to delete
 * @param {number} deleteStrategy - in [-1, 1]; +1 biases toward high degree, -1 toward low
 * @param {() => number} random - [0,1)
 * @param {number} minNodesAfterDelete - refuse if existingIds.length - count < this
 * @returns {string[]} ids to delete
 */
export function pickRandomGrowthDeletes({
  existingIds,
  anchorIds,
  newBatchIds,
  undirectedEdges,
  count,
  deleteStrategy,
  random,
  minNodesAfterDelete,
}) {
  const k = Math.floor(Number(count));
  if (!Number.isFinite(k) || k < 1) return [];

  const anchor = new Set((anchorIds || []).map(String));
  const batch = new Set((newBatchIds || []).map(String));
  const existing = new Set((existingIds || []).map(String));

  const candidates = [...existing].filter(
    (id) => !anchor.has(id) && !batch.has(id)
  );

  if (existing.size - k < minNodesAfterDelete) {
    const err = new Error(
      `Cannot delete ${k} node(s): would leave fewer than ${minNodesAfterDelete} nodes`
    );
    err.code = 'PRUNE_WOULD_SHRINK_GRAPH_TOO_MUCH';
    throw err;
  }
  if (candidates.length < k) {
    const err = new Error(
      `Not enough deletable nodes: need ${k}, have ${candidates.length} (anchors and new batch are protected)`
    );
    err.code = 'INSUFFICIENT_PRUNE_CANDIDATES';
    throw err;
  }

  const strat = clampStrategy(deleteStrategy);
  const deg = degreeMapOnPool(candidates, undirectedEdges);
  return pickDistinctByDegreeStrategy(candidates, k, random, strat, deg);
}
