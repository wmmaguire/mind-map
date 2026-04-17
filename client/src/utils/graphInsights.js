/**
 * GitHub #83 — Client-side graph metrics for the Insights panel (v1).
 * Undirected multigraph: each link is one edge; parallel links increase degree.
 */

/**
 * Preset question bodies sent to the assess API — keep wording aligned with
 * `GUIDING_QUESTION_TEXT` in `server/lib/graphInsightsAssess.js` (minus markdown).
 */
const INSIGHT_GUIDING_QUESTION_BODY = {
  structure:
    'Symptomatic structure: What topics feel load-bearing—carrying weight, linking unlike areas, or anchoring the graph’s emotional or intellectual “climate”? What latent tensions or repetitions appear (splitting, fixation, a dominant pole vs many equals, bridges vs isolates)? Use graphSummary only as light texture.',
  theme:
    'Theme and meaning: What overarching story or unconscious preoccupation might this map express—what is foregrounded vs peripheral, what must be “passed through” to connect disparate concerns, and what single or few themes might unify the field?',
  direction:
    'Direction and inspiration: What is the projected thematic direction of this graph—where the structure seems to lean, open, or resolve—and what might it inspire (lines of thought, feeling-tones, or creative next steps)? Anchor each thread in at least one named concept from the data; you may then associate or generalize, clearly marking what is inference rather than something literally present in the JSON.',
};

/**
 * Network-lens preset bodies — keep aligned with `NETWORK_GUIDING_QUESTION_TEXT` in
 * `server/lib/graphInsightsAssess.js` (minus markdown).
 */
const INSIGHT_NETWORK_GUIDING_QUESTION_BODY = {
  flow:
    'Flow and spread: Where might a shift or emphasis at one concept travel in this map—where would influence tend to spread, stall, or fan out? Which ideas sit on likely paths between distant concerns, and what bottlenecks or open corridors does the arrangement suggest? Prioritize specific concept labels and descriptions from the JSON for claims about the map; you may add analogy or extension when tied to those anchors and framed as inference.',
  resilience:
    'Resilience and vulnerability: Where does the map look hinged or brittle—ideas that, if they vanished, might disconnect or rebalance the sketch? What looks redundant or backup-like versus single points of strain? Where might small changes matter most? Prioritize labels and relationships implied by the data; you may reference outside ideas only as explicit analogy linked to those concepts.',
  emergence:
    'Emergence and growth: What looks emergent, peripheral, or newly rising versus settled or central in how topics are tied together? What patterns of growth or layering does the sketch suggest—what might next or adjacent concerns be? Do not present hypothetical topics as if they were nodes in the JSON; hypothetical next steps are welcome when clearly framed as inference.',
};

/** Grouped presets for the Insights Question control (interpretive vs network lens). */
export const INSIGHT_ASSESS_GUIDING_FOCUS_GROUPS = [
  {
    label: 'Interpretive',
    options: [
      { id: 'all', label: 'All three questions' },
      { id: 'structure', label: 'Symptomatic structure' },
      { id: 'theme', label: 'Theme and meaning' },
      { id: 'direction', label: 'Direction and inspiration' },
    ],
  },
  {
    label: 'Network lens',
    options: [
      { id: 'network_all', label: 'All three (flow · resilience · emergence)' },
      { id: 'flow', label: 'Flow and spread' },
      { id: 'resilience', label: 'Resilience and vulnerability' },
      { id: 'emergence', label: 'Emergence and growth' },
    ],
  },
];

/** Flat list of all preset ids + custom (for tests and iteration). */
export const INSIGHT_ASSESS_GUIDING_FOCUS_OPTIONS = [
  ...INSIGHT_ASSESS_GUIDING_FOCUS_GROUPS.flatMap((g) => g.options),
  { id: 'custom', label: 'Custom question' },
];

/** Output length for POST /api/graph-insights-assess (`assessmentLength`; must match server). */
export const INSIGHT_ASSESS_LENGTH_OPTIONS = [
  { id: 'low', label: 'Low (1 paragraph)' },
  { id: 'medium', label: 'Medium (2–3 paragraphs)' },
  { id: 'high', label: 'High (4–5 paragraphs)' },
];

/**
 * Human-readable question(s) for the current Question dropdown value (preset modes only).
 * @param {string} focus
 * @returns {string|null} null when `focus === 'custom'` (user supplies the prompt in UI).
 */
export function getInsightAssessGuidingFocusPreview(focus) {
  if (focus === 'custom') return null;
  if (focus === 'all') {
    return [
      `1. ${INSIGHT_GUIDING_QUESTION_BODY.structure}`,
      `2. ${INSIGHT_GUIDING_QUESTION_BODY.theme}`,
      `3. ${INSIGHT_GUIDING_QUESTION_BODY.direction}`,
    ].join('\n\n');
  }
  if (focus === 'network_all') {
    return [
      `1. ${INSIGHT_NETWORK_GUIDING_QUESTION_BODY.flow}`,
      `2. ${INSIGHT_NETWORK_GUIDING_QUESTION_BODY.resilience}`,
      `3. ${INSIGHT_NETWORK_GUIDING_QUESTION_BODY.emergence}`,
    ].join('\n\n');
  }
  if (focus === 'structure' || focus === 'theme' || focus === 'direction') {
    return INSIGHT_GUIDING_QUESTION_BODY[focus];
  }
  if (focus === 'flow' || focus === 'resilience' || focus === 'emergence') {
    return INSIGHT_NETWORK_GUIDING_QUESTION_BODY[focus];
  }
  return null;
}

/** Voice presets for POST /api/graph-insights-assess (ids must match server). */
export const INSIGHT_ASSESS_TONE_OPTIONS = [
  { id: 'jung', label: 'Carl Jung' },
  { id: 'freud', label: 'Sigmund Freud' },
  { id: 'murakami', label: 'Haruki Murakami' },
  { id: 'thompson', label: 'Hunter S. Thompson' },
  { id: 'custom', label: 'Custom' },
];

/**
 * UI copy for the Insights “metric help” dialog — keep in sync with the private
 * reasoning table in `server/lib/graphInsightsAssess.js` (metricGuide / lines ~160–164).
 */
export const INSIGHT_CENTRALITY_METRICS_HELP = [
  {
    key: 'degree',
    name: 'Degree',
    conversationalFocus: 'Broadness',
    topicRoleIntuition:
      '"Big umbrella" — a topic that fans out into many side-themes at once.',
    writtenFormula: String.raw`\begin{aligned}
\operatorname{deg}(v) &= \sum_{u \in \mathcal{N}(v)} m(v,u), \\[0.35em]
\mathcal{N}(v) &= \{\, u \in V : m(v,u) > 0 \,\}, \\[0.35em]
m(v,u) &\in \mathbb{Z}_{\geq 0}\quad (\text{undirected link multiplicity}).
\end{aligned}`,
    calculationFormula: `deg(v) = number of undirected links incident to v.

Multigraph: each stored link counts separately. If two links connect the same pair of concepts, both increase deg(v).`,
  },
  {
    key: 'betweenness',
    name: 'Betweenness',
    conversationalFocus: 'Synthesis',
    topicRoleIntuition:
      '"Pivot" — the idea that lets the mind move from one cluster of concerns to a very different one.',
    writtenFormula: String.raw`\begin{aligned}
G &= (V,E)\ \text{simple undirected},\quad |E \cap \{p,q\}| \leq 1, \\[0.35em]
\sigma_{st} &= \#\{\text{shortest } s\text{–}t \text{ geodesics}\}, \\[0.25em]
\sigma_{st}(v) &= \#\{\text{geodesics incident to } v\}, \\[0.35em]
C_B(v) &= \dfrac{1}{2} \sum_{s \neq v \neq t} \dfrac{\sigma_{st}(v)}{\sigma_{st}}\,.
\end{aligned}`,
    calculationFormula: `Brandes betweenness on the simple graph (≤1 edge per unordered pair {u,w}).

For each source s, accumulate shortest-path counts σ and dependencies; sum into C_B(v), then C_B(v) ← C_B(v)/2 for undirected graphs.

Interpretation: C_B(v) measures how often v lies on shortest paths between other nodes.`,
  },
  {
    key: 'closeness',
    name: 'Closeness',
    conversationalFocus: 'Relevance',
    topicRoleIntuition:
      '"Core" — so central to the map\'s concerns that almost every train of thought can return to it quickly.',
    writtenFormula: String.raw`\begin{aligned}
&d : V \times V \to \mathbb{Z}_{\geq 0} \cup \{\infty\}\ \text{(unweighted shortest paths on } G_{\mathrm{simple}}\text{)}, \\[0.35em]
&R_v = \{\, w \in V \setminus \{v\} : d(v,w) < \infty \,\}, \\[0.25em]
&C(v) = \dfrac{\lvert R_v \rvert}{\sum_{w \in R_v} d(v,w)}\ \text{(or } 0 \text{ if denominator } = 0\text{)}.
\end{aligned}`,
    calculationFormula: `Unweighted shortest paths on the simple graph.

For node v, let R = { w ≠ v | dist(v,w) < ∞ } in v's connected component, d(w) = shortest-path length v→w.

C(v) = |R| / Σ_{w∈R} d(w)   (0 if v is isolated or sum is 0).`,
  },
  {
    key: 'eigenvector',
    name: 'Eigenvector',
    conversationalFocus: 'Depth / authority',
    topicRoleIntuition:
      '"Sophisticated neighbor" — may show up modestly in the lists, yet sits among the weightiest ideas structurally.',
    writtenFormula: String.raw`\begin{aligned}
A &\in \{0,1\}^{V \times V}, \qquad (Ax)_i = \sum_{j \in V} A_{ij}\, x_j, \\[0.35em]
Ax &= \lambda_{\max}\, x, \qquad \|x\|_2 = 1, \\[0.25em]
x^{(k+1)} &= \dfrac{A\, x^{(k)}}{\bigl\|A\, x^{(k)}\bigr\|_2}\quad (\varepsilon\text{-threshold power iteration})\,.
\end{aligned}`,
    calculationFormula: `Simple 0/1 adjacency A (A_uv = 1 if u and v are adjacent once).

Principal eigenvector x with Ax = λ_max x, normalized (‖x‖ = 1). Implemented by power iteration: repeat x ← normalize(Ax) until convergence.

Higher x_v means v is adjacent to other high-centrality nodes.`,
  },
];

/**
 * @param {'degree' | 'betweenness' | 'closeness' | 'eigenvector'} metricKey
 * @param {number} score
 * @returns {string}
 */
export function formatInsightCentralityScore(metricKey, score) {
  if (!Number.isFinite(score)) return '—';
  if (metricKey === 'degree') return String(Math.round(score));
  if (score === 0) return '0';
  if (Math.abs(score) >= 1e6) return score.toExponential(2);
  if (Math.abs(score) >= 100) return score.toFixed(2);
  if (Math.abs(score) >= 1) return score.toFixed(3);
  return score.toFixed(4);
}

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
 *   degreeByNodeId: Record<string, number>,
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

  /** @type {Record<string, number>} */
  const degreeByNodeId = {};
  for (const id of idSet) {
    degreeByNodeId[id] = byId.get(id)?.degree ?? 0;
  }

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
    degreeByNodeId,
  };
}

/**
 * Simple undirected adjacency (unique neighbors; parallel links collapse to one edge).
 * @param {Set<string>} idSet
 * @param {Array<{ a: string, b: string }>} edges
 * @returns {Map<string, string[]>}
 */
function buildSimpleAdjacency(idSet, edges) {
  /** @type {Map<string, Set<string>>} */
  const raw = new Map();
  for (const id of idSet) {
    raw.set(id, new Set());
  }
  for (const e of edges) {
    if (!idSet.has(e.a) || !idSet.has(e.b)) continue;
    raw.get(e.a).add(e.b);
    raw.get(e.b).add(e.a);
  }
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const id of idSet) {
    out.set(id, [...raw.get(id)].sort());
  }
  return out;
}

/**
 * Brandes betweenness for undirected unweighted graph (multigraph collapsed).
 * @param {string[]} nodeIds
 * @param {Map<string, string[]>} neighbors
 * @returns {Map<string, number>}
 */
function brandesBetweennessUndirected(nodeIds, neighbors) {
  /** @type {Map<string, number>} */
  const CB = new Map();
  for (const v of nodeIds) {
    CB.set(v, 0);
  }

  for (const s of nodeIds) {
    const S = [];
    /** @type {Map<string, string[]>} */
    const pred = new Map();
    /** @type {Map<string, number>} */
    const sigma = new Map();
    /** @type {Map<string, number>} */
    const dist = new Map();
    for (const v of nodeIds) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
    }
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue = [s];
    let qh = 0;
    while (qh < queue.length) {
      const v = queue[qh++];
      S.push(v);
      for (const w of neighbors.get(v) || []) {
        if (dist.get(w) < 0) {
          dist.set(w, dist.get(v) + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          pred.get(w).push(v);
        }
      }
    }
    /** @type {Map<string, number>} */
    const delta = new Map();
    for (const v of nodeIds) {
      delta.set(v, 0);
    }
    while (S.length) {
      const w = S.pop();
      for (const v of pred.get(w)) {
        const sw = sigma.get(w);
        if (sw > 0) {
          delta.set(
            v,
            delta.get(v) + (sigma.get(v) / sw) * (1 + delta.get(w))
          );
        }
      }
      if (w !== s) {
        CB.set(w, CB.get(w) + delta.get(w));
      }
    }
  }

  for (const v of nodeIds) {
    CB.set(v, CB.get(v) / 2);
  }
  return CB;
}

/**
 * Classic closeness: (reachable others) / (sum of shortest-path distances).
 * @param {string[]} nodeIds
 * @param {Map<string, string[]>} neighbors
 * @returns {Map<string, number>}
 */
function closenessUndirected(nodeIds, neighbors) {
  /** @type {Map<string, number>} */
  const C = new Map();
  for (const s of nodeIds) {
    /** @type {Map<string, number>} */
    const dist = new Map();
    for (const v of nodeIds) {
      dist.set(v, -1);
    }
    dist.set(s, 0);
    const queue = [s];
    let qi = 0;
    while (qi < queue.length) {
      const v = queue[qi++];
      for (const w of neighbors.get(v) || []) {
        if (dist.get(w) < 0) {
          dist.set(w, dist.get(v) + 1);
          queue.push(w);
        }
      }
    }
    let sum = 0;
    let cnt = 0;
    for (const v of nodeIds) {
      if (v === s) continue;
      const d = dist.get(v);
      if (d > 0) {
        sum += d;
        cnt += 1;
      }
    }
    C.set(s, cnt > 0 && sum > 0 ? cnt / sum : 0);
  }
  return C;
}

/**
 * Eigenvector centrality (symmetric adjacency, power iteration).
 * @param {string[]} nodeIds
 * @param {Map<string, string[]>} neighbors
 * @returns {Map<string, number>}
 */
function eigenvectorUndirected(nodeIds, neighbors) {
  const n = nodeIds.length;
  /** @type {Map<string, number>} */
  let x = new Map();
  if (n === 0) return x;
  const inv = 1 / n;
  for (const id of nodeIds) {
    x.set(id, inv);
  }

  for (let iter = 0; iter < 100; iter += 1) {
    /** @type {Map<string, number>} */
    const xNew = new Map();
    for (const i of nodeIds) {
      let sum = 0;
      for (const j of neighbors.get(i) || []) {
        sum += x.get(j);
      }
      xNew.set(i, sum);
    }
    let normSq = 0;
    for (const i of nodeIds) {
      normSq += xNew.get(i) ** 2;
    }
    const norm = Math.sqrt(normSq) || 1;
    let diff = 0;
    for (const i of nodeIds) {
      const nv = xNew.get(i) / norm;
      diff += Math.abs(nv - x.get(i));
      x.set(i, nv);
    }
    if (diff < 1e-9) {
      break;
    }
  }
  return x;
}

/**
 * @param {string} id
 * @param {{ label?: string, description?: string, wikiUrl?: string }} node
 * @param {number} score
 * @returns {{ id: string, label: string, score: number, description: string, wikiUrl: string }}
 */
function assessRow(id, node, score) {
  const label =
    typeof node?.label === 'string' && node.label.trim()
      ? node.label.trim()
      : id;
  let description = '';
  if (typeof node?.description === 'string') {
    description = node.description.trim().slice(0, 800);
  }
  let wikiUrl = '';
  if (typeof node?.wikiUrl === 'string' && node.wikiUrl.startsWith('http')) {
    wikiUrl = node.wikiUrl.trim();
  }
  return { id, label, score, description, wikiUrl };
}

/**
 * Top nodes for LLM assessment: degree, betweenness, closeness, eigenvector.
 * Uses simple graph (unique edges) for path-based centralities; degree still from multigraph in {@link computeGraphInsights}.
 *
 * @param {{ nodes?: Array<{ id?: unknown, label?: string, description?: string, wikiUrl?: string }>, links?: Array }} graph
 * @param {number} [topN]
 * @returns {{
 *   degree: Array<{ id: string, label: string, score: number, description: string, wikiUrl: string }>,
 *   betweenness: Array<{ id: string, label: string, score: number, description: string, wikiUrl: string }>,
 *   closeness: Array<{ id: string, label: string, score: number, description: string, wikiUrl: string }>,
 *   eigenvector: Array<{ id: string, label: string, score: number, description: string, wikiUrl: string }>,
 * }}
 */
export function computeInsightNotableCentralities(graph, topN = 5) {
  const empty = {
    degree: [],
    betweenness: [],
    closeness: [],
    eigenvector: [],
  };
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = normalizedUndirectedEdges(graph?.links || []);
  const idSet = new Set(nodes.map((x) => graphInsightNodeId(x.id)).filter(Boolean));
  if (idSet.size === 0) {
    return empty;
  }

  const nodeById = new Map(
    nodes.map((node) => [graphInsightNodeId(node.id), node])
  );
  const nodeIds = [...idSet].sort();
  const neighbors = buildSimpleAdjacency(idSet, edges);

  const bet = brandesBetweennessUndirected(nodeIds, neighbors);
  const clo = closenessUndirected(nodeIds, neighbors);
  const eig = eigenvectorUndirected(nodeIds, neighbors);

  const sortTop = (/** @type {Map<string, number>} */ scores) =>
    [...scores.entries()]
      .map(([id, score]) => ({
        id,
        score,
        node: nodeById.get(id) || {},
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (a.node.label || a.id).localeCompare(b.node.label || b.id)
      )
      .slice(0, topN)
      .map((row) => assessRow(row.id, row.node, row.score));

  const structural = computeGraphInsights(graph);
  const degreeScores = new Map(
    Object.entries(structural.degreeByNodeId).map(([id, deg]) => [id, deg])
  );

  return {
    degree: sortTop(degreeScores),
    betweenness: sortTop(bet),
    closeness: sortTop(clo),
    eigenvector: sortTop(eig),
  };
}

/**
 * JSON body for POST /api/graph-insights-assess.
 * @param {{ nodes?: unknown[], links?: unknown[] }} graph
 * @param {number} [topN]
 */
export function buildGraphInsightAssessPayload(graph, topN = 5) {
  const base = computeGraphInsights(graph);
  const notableNodes = computeInsightNotableCentralities(graph, topN);
  return {
    graphSummary: {
      nodeCount: base.nodeCount,
      edgeCount: base.edgeCount,
      density: base.density,
      componentCount: base.componentCount,
    },
    notableNodes,
  };
}
