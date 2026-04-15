/**
 * GitHub #83 — Client-side graph metrics for the Insights panel (v1).
 * Undirected multigraph: each link is one edge; parallel links increase degree.
 */

/**
 * @param {unknown} x
 * @returns {string}
 */
export function graphInsightNodeId(x) {
  if (x == null) return '';
  if (typeof x === 'object' && x !== null && 'id' in x && x.id != null) {
    return String(x.id);
  }
  return String(x);
}

/**
 * @param {Array<{ source?: unknown, target?: unknown, strength?: number }>} links
 * @returns {Array<{ a: string, b: string, w: number }>}
 */
function normalizedUndirectedEdges(links) {
  if (!Array.isArray(links)) return [];
  const out = [];
  for (const l of links) {
    if (!l) continue;
    const u = graphInsightNodeId(l.source);
    const v = graphInsightNodeId(l.target);
    if (!u || !v || u === v) continue;
    const w =
      typeof l.strength === 'number' && Number.isFinite(l.strength)
        ? Math.max(0, l.strength)
        : 1;
    const [a, b] = u < v ? [u, v] : [v, u];
    out.push({ a, b, w });
  }
  return out;
}

/**
 * @param {number[]} sorted
 * @returns {number}
 */
function medianSorted(sorted) {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[m];
  return (sorted[m - 1] + sorted[m]) / 2;
}

/**
 * @param {{ nodes?: Array<{ id?: unknown, label?: string }>, links?: Array }} graph
 * @returns {{
 *   nodeCount: number,
 *   edgeCount: number,
 *   density: number,
 *   componentCount: number,
 *   largestComponentSize: number,
 *   degreeMin: number,
 *   degreeMedian: number,
 *   degreeMax: number,
 *   weightedDegreeMax: number,
 *   averageClustering: number,
 *   isolateCount: number,
 *   topByDegree: Array<{ id: string, label: string, degree: number, weightedDegree: number }>,
 * }}
 */
export function computeGraphInsights(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = normalizedUndirectedEdges(graph?.links || []);
  const n = nodes.length;

  const idSet = new Set(nodes.map((x) => graphInsightNodeId(x.id)).filter(Boolean));
  /** @type {Map<string, Map<string, { count: number, w: number }>>} */
  const adj = new Map();

  const touch = (u, v, w) => {
    if (!adj.has(u)) adj.set(u, new Map());
    if (!adj.has(v)) adj.set(v, new Map());
    const mu = adj.get(u);
    const mv = adj.get(v);
    const eu = mu.get(v) || { count: 0, w: 0 };
    eu.count += 1;
    eu.w += w;
    mu.set(v, eu);
    mv.set(u, { count: eu.count, w: eu.w });
  };

  for (const e of edges) {
    if (!idSet.has(e.a) || !idSet.has(e.b)) continue;
    touch(e.a, e.b, e.w);
  }

  /** @type {Map<string, { degree: number, weightedDegree: number, neighbors: Set<string> }>} */
  const byId = new Map();
  for (const id of idSet) {
    byId.set(id, { degree: 0, weightedDegree: 0, neighbors: new Set() });
  }
  for (const id of idSet) {
    const m = adj.get(id);
    const rec = byId.get(id);
    if (!m || !rec) continue;
    for (const [v, meta] of m) {
      rec.degree += meta.count;
      rec.weightedDegree += meta.w;
      rec.neighbors.add(v);
    }
  }

  const degrees = [...byId.values()].map((r) => r.degree);
  const weightedDegrees = [...byId.values()].map((r) => r.weightedDegree);
  const sortedDeg = [...degrees].sort((a, b) => a - b);
  const degreeMin = sortedDeg.length ? sortedDeg[0] : 0;
  const degreeMax = sortedDeg.length ? sortedDeg[sortedDeg.length - 1] : 0;
  const degreeMedian = medianSorted(sortedDeg);
  const weightedDegreeMax = weightedDegrees.length
    ? Math.max(...weightedDegrees)
    : 0;

  const m = edges.filter((e) => idSet.has(e.a) && idSet.has(e.b)).length;
  const density = n >= 2 ? (2 * m) / (n * (n - 1)) : 0;

  const visited = new Set();
  const compSizes = [];
  for (const id of idSet) {
    if (visited.has(id)) continue;
    let sz = 0;
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const u = stack.pop();
      sz += 1;
      const m2 = adj.get(u);
      if (!m2) continue;
      for (const v of m2.keys()) {
        if (!visited.has(v)) {
          visited.add(v);
          stack.push(v);
        }
      }
    }
    compSizes.push(sz);
  }
  compSizes.sort((a, b) => b - a);
  const componentCount = compSizes.length;
  const largestComponentSize = compSizes[0] || 0;

  let isolateCount = 0;
  const clusteringVals = [];
  for (const id of idSet) {
    const rec = byId.get(id);
    if (!rec) continue;
    if (rec.degree === 0) isolateCount += 1;
    const neigh = [...rec.neighbors];
    const k = neigh.length;
    if (k < 2) {
      continue;
    }
    let between = 0;
    for (let i = 0; i < k; i += 1) {
      for (let j = i + 1; j < k; j += 1) {
        const a = neigh[i];
        const b = neigh[j];
        if (adj.get(a)?.has(b)) between += 1;
      }
    }
    const maxPairs = (k * (k - 1)) / 2;
    clusteringVals.push(between / maxPairs);
  }
  const averageClustering =
    clusteringVals.length > 0
      ? clusteringVals.reduce((s, x) => s + x, 0) / clusteringVals.length
      : 0;

  const labelById = new Map(
    nodes.map((node) => [
      graphInsightNodeId(node.id),
      typeof node.label === 'string' ? node.label : '',
    ])
  );

  const topByDegree = [...byId.entries()]
    .map(([id, rec]) => ({
      id,
      label: labelById.get(id) || id,
      degree: rec.degree,
      weightedDegree: rec.weightedDegree,
    }))
    .sort((a, b) => b.degree - a.degree || b.weightedDegree - a.weightedDegree)
    .slice(0, 10);

  return {
    nodeCount: n,
    edgeCount: m,
    density,
    componentCount,
    largestComponentSize,
    degreeMin,
    degreeMedian,
    degreeMax,
    weightedDegreeMax,
    averageClustering,
    isolateCount,
    topByDegree,
  };
}
