/**
 * Random attachment for multi-cycle AI growth (GitHub #62, #68).
 *
 * Pool rule: before adding links for new node N (processed in batch order),
 * the candidate pool is every node id already on the graph for this request:
 * all ids in `initialPoolIds`, plus each prior new node from the same batch.
 * Targets are chosen at random without replacement among candidates
 * excluding N itself. With `anchorStrategy` ≠ 0 and `initialLinkPairs`,
 * sampling is biased by undirected degree in the current pool (high degree =
 * "high-community" end when strategy > 0).
 */

export const RANDOM_EXPANSION_RELATIONSHIP =
  'Random expansion (uniform attachment)';

export const RANDOM_EXPANSION_RELATIONSHIP_WEIGHTED =
  'Random expansion (degree-biased attachment)';

/**
 * @param {unknown[]} rawLinks - {source,target} or analyze-style
 * @returns {{ source: string, target: string }[]}
 */
export function normalizeGraphLinkPairs(rawLinks) {
  if (!Array.isArray(rawLinks)) return [];
  const out = [];
  for (const l of rawLinks) {
    if (!l || typeof l !== 'object') continue;
    const s =
      typeof l.source === 'object' && l.source != null
        ? String(l.source.id)
        : String(l.source ?? '');
    const t =
      typeof l.target === 'object' && l.target != null
        ? String(l.target.id)
        : String(l.target ?? '');
    if (s && t && s !== t) out.push({ source: s, target: t });
  }
  return out;
}

/**
 * Undirected degrees: edges with both endpoints in `pool` (as Set or array of ids).
 * @param {Iterable<string>} pool
 * @param {{ source: string, target: string }[]} edges
 * @returns {Map<string, number>}
 */
export function degreeMapOnPool(pool, edges) {
  const poolSet = new Set([...pool].map(String));
  const deg = new Map();
  for (const id of poolSet) deg.set(id, 0);
  for (const e of edges || []) {
    const u = String(e.source);
    const v = String(e.target);
    if (poolSet.has(u) && poolSet.has(v)) {
      deg.set(u, (deg.get(u) || 0) + 1);
      deg.set(v, (deg.get(v) || 0) + 1);
    }
  }
  return deg;
}

/**
 * @param {string[]} candidates
 * @param {number} count
 * @param {() => number} random
 * @param {number} strategy - clamped to [-1,1]; 0 = uniform
 * @param {Map<string, number>} degreeMap
 */
export function pickDistinctByDegreeStrategy(
  candidates,
  count,
  random,
  strategy,
  degreeMap
) {
  const s = clampStrategy(strategy);
  if (s === 0 || candidates.length <= count) {
    return pickUniformDistinct(candidates, count, random);
  }
  const copy = [...candidates];
  const out = [];
  const maxD = Math.max(
    1,
    ...copy.map((c) => degreeMap.get(String(c)) ?? 0)
  );
  for (let i = 0; i < count; i += 1) {
    const weights = copy.map((c) => {
      const d = degreeMap.get(String(c)) ?? 0;
      const norm = d / maxD;
      const expo = s * (norm - 0.5) * 4;
      return Math.exp(expo);
    });
    let totalW = weights.reduce((a, b) => a + b, 0);
    if (!(totalW > 0)) {
      return out.concat(pickUniformDistinct(copy, count - out.length, random));
    }
    let r = random() * totalW;
    let idx = 0;
    for (; idx < copy.length; idx += 1) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    idx = Math.min(Math.max(0, idx), copy.length - 1);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

export function clampStrategy(strategy) {
  const n = Number(strategy);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function pickUniformDistinct(pool, count, random) {
  const copy = [...pool];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const j = Math.floor(random() * copy.length);
    out.push(copy[j]);
    copy.splice(j, 1);
  }
  return out;
}

/**
 * @param {string[]} newNodeIdsInOrder - New node ids from the model, in array order
 * @param {string[]} initialPoolIds - Graph node ids before this batch (strings)
 * @param {number} connectionsPerNewNode
 * @param {() => number} [random=Math.random] - returns [0,1)
 * @param {object} [options]
 * @param {number} [options.anchorStrategy=0] - -1..1 degree bias for attachment
 * @param {{ source: string, target: string }[]} [options.initialLinkPairs] - graph edges among pool (for degrees)
 * @returns {{ source: string, target: string, relationship: string, timestamp: number }[]}
 */
export function buildRandomExpansionLinks(
  newNodeIdsInOrder,
  initialPoolIds,
  connectionsPerNewNode,
  random = Math.random,
  options = {}
) {
  const k = connectionsPerNewNode;
  if (!Number.isFinite(k) || k < 1) {
    throw new Error('connectionsPerNewNode must be a positive integer');
  }

  const anchorStrategy = clampStrategy(options.anchorStrategy ?? 0);
  const initialEdges = Array.isArray(options.initialLinkPairs)
    ? options.initialLinkPairs
    : [];
  const relLabel =
    anchorStrategy === 0
      ? RANDOM_EXPANSION_RELATIONSHIP
      : RANDOM_EXPANSION_RELATIONSHIP_WEIGHTED;

  const pool = [...new Set(initialPoolIds.map(String))];
  /** @type {{ source: string, target: string }[]} */
  const runningEdges = [...initialEdges];
  const links = [];

  for (const rawId of newNodeIdsInOrder) {
    const sid = String(rawId);
    const candidates = pool.filter((id) => id !== sid);
    if (candidates.length < k) {
      const err = new Error(
        `Not enough nodes to attach to: need ${k} distinct targets for "${sid}", have ${candidates.length} candidates`
      );
      err.code = 'INSUFFICIENT_ATTACHMENT_POOL';
      throw err;
    }

    const poolForDegree = new Set(pool);
    const deg = degreeMapOnPool(poolForDegree, runningEdges);
    const picked = pickDistinctByDegreeStrategy(
      candidates,
      k,
      random,
      anchorStrategy,
      deg
    );

    for (const target of picked) {
      const link = {
        source: sid,
        target,
        relationship: relLabel,
        timestamp: Date.now(),
      };
      links.push(link);
      runningEdges.push({ source: sid, target });
    }
    pool.push(sid);
  }

  return links;
}
