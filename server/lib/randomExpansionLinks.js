/**
 * Random attachment for multi-cycle AI growth (GitHub #62).
 *
 * Pool rule: before adding links for new node N (processed in batch order),
 * the candidate pool is every node id already on the graph for this request:
 * all ids in `initialPoolIds`, plus each prior new node from the same batch.
 * Targets are chosen uniformly at random without replacement among candidates
 * excluding N itself. Relationship text is templated (not LLM-generated).
 */

export const RANDOM_EXPANSION_RELATIONSHIP =
  'Random expansion (uniform attachment)';

/**
 * @param {string[]} newNodeIdsInOrder - New node ids from the model, in array order
 * @param {string[]} initialPoolIds - Graph node ids before this batch (strings)
 * @param {number} connectionsPerNewNode
 * @param {() => number} [random=Math.random] - returns [0,1)
 * @returns {{ source: string, target: string, relationship: string }[]}
 */
export function buildRandomExpansionLinks(
  newNodeIdsInOrder,
  initialPoolIds,
  connectionsPerNewNode,
  random = Math.random
) {
  const k = connectionsPerNewNode;
  if (!Number.isFinite(k) || k < 1) {
    throw new Error('connectionsPerNewNode must be a positive integer');
  }

  const pool = [...new Set(initialPoolIds.map(String))];
  const links = [];

  for (const rawId of newNodeIdsInOrder) {
    const sid = String(rawId);
    const candidates = pool.filter(id => id !== sid);
    if (candidates.length < k) {
      const err = new Error(
        `Not enough nodes to attach to: need ${k} distinct targets for "${sid}", have ${candidates.length} candidates`
      );
      err.code = 'INSUFFICIENT_ATTACHMENT_POOL';
      throw err;
    }
    const picked = pickRandomDistinct(candidates, k, random);
    for (const target of picked) {
      links.push({
        source: sid,
        target,
        relationship: RANDOM_EXPANSION_RELATIONSHIP
      });
    }
    pool.push(sid);
  }

  return links;
}

function pickRandomDistinct(pool, count, random) {
  const copy = [...pool];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const j = Math.floor(random() * copy.length);
    out.push(copy[j]);
    copy.splice(j, 1);
  }
  return out;
}
