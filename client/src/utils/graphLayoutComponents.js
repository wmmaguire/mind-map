/**
 * GitHub #89 — helpers for disjoint-style D3 force layouts and playback-step
 * continuity. Exposes connected-component detection, component centroids,
 * and a seed helper that gives brand-new nodes / communities a non-overlapping
 * initial position so they don't all materialise at the viewport centre when
 * the scrub advances.
 *
 * Reference: https://observablehq.com/@d3/disjoint-force-directed-graph/2
 */

function linkEndpointId(x) {
  if (x == null) return '';
  return typeof x === 'object' ? String(x.id) : String(x);
}

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Union–find over `{ nodes, links }` returning an array of connected components
 * in the undirected sense. Each component has a deterministic id (lowest member
 * id by string sort) so callers can diff across frames.
 *
 * @param {Array<{ id: unknown }>} nodes
 * @param {Array<{ source: unknown, target: unknown }>} links
 * @returns {Array<{ id: string, nodeIds: string[], size: number }>}
 */
export function computeConnectedComponents(nodes, links) {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const linkList = Array.isArray(links) ? links : [];

  const parent = new Map();
  for (const n of nodeList) {
    if (!n || n.id == null) continue;
    const k = String(n.id);
    parent.set(k, k);
  }

  function find(a) {
    let cur = a;
    while (parent.get(cur) !== cur) {
      parent.set(cur, parent.get(parent.get(cur)));
      cur = parent.get(cur);
    }
    return cur;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent.set(ra, rb);
  }

  for (const l of linkList) {
    if (!l) continue;
    const s = linkEndpointId(l.source);
    const t = linkEndpointId(l.target);
    if (!parent.has(s) || !parent.has(t)) continue;
    union(s, t);
  }

  const groups = new Map();
  for (const k of parent.keys()) {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(k);
  }

  const out = [];
  for (const members of groups.values()) {
    members.sort();
    out.push({ id: members[0], nodeIds: members, size: members.length });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * Mean `{ x, y }` of the positioned nodes in each component. Components with no
 * positioned members resolve to the fallback centre. Useful both for seeding
 * new communities into an existing component's region, and for per-component
 * gravity forces.
 *
 * @param {Array<{ id: unknown, x?: number, y?: number }>} nodes
 * @param {Array<{ id: string, nodeIds: string[] }>} components
 * @param {{ x: number, y: number }} fallbackCenter
 * @returns {Map<string, { x: number, y: number, positionedCount: number }>}
 */
export function computeComponentCentroids(nodes, components, fallbackCenter) {
  const byId = new Map();
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n || n.id == null) continue;
    byId.set(String(n.id), n);
  }
  const fx = finite(fallbackCenter?.x) ? fallbackCenter.x : 0;
  const fy = finite(fallbackCenter?.y) ? fallbackCenter.y : 0;
  const result = new Map();
  for (const c of Array.isArray(components) ? components : []) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const id of c.nodeIds || []) {
      const node = byId.get(id);
      if (!node) continue;
      if (!finite(node.x) || !finite(node.y)) continue;
      if (node.x === 0 && node.y === 0) continue;
      sx += node.x;
      sy += node.y;
      n += 1;
    }
    if (n > 0) {
      result.set(c.id, { x: sx / n, y: sy / n, positionedCount: n });
    } else {
      result.set(c.id, { x: fx, y: fy, positionedCount: 0 });
    }
  }
  return result;
}

/**
 * Deterministic jitter so two brand-new nodes in the same component don't stack
 * exactly on the centroid. Keyed off the node id so the same scrub returns the
 * same offset (stable mental map) — no Math.random.
 */
function jitterForId(id, radius) {
  const s = String(id);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = (h ^ s.charCodeAt(i)) * 16777619;
    h |= 0; // int32
  }
  const angle = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
}

/**
 * Seed `{ x, y, vx, vy }` on communities / nodes that don't yet have a
 * well-defined position, biased toward their connected-component centroid so
 * the force sim doesn't have to drag them across the viewport on the first
 * tick. Mutates in place and returns the number of seeds applied.
 *
 * @param {Array<{ id: unknown, x?: number, y?: number, vx?: number, vy?: number, nodes?: Array<{ id: unknown }> }>} communities
 * @param {Array<{ source: unknown, target: unknown }>} links
 * @param {{ x: number, y: number }} fallbackCenter
 * @param {{ jitterRadius?: number }} [opts]
 * @returns {number} count of communities seeded
 */
export function seedPositionsForNewCommunities(communities, links, fallbackCenter, opts = {}) {
  const list = Array.isArray(communities) ? communities : [];
  if (!list.length) return 0;

  // Expand communities to their member node ids for component detection.
  const expandedNodes = [];
  for (const c of list) {
    if (!c || c.id == null) continue;
    const members = Array.isArray(c.nodes) && c.nodes.length > 0
      ? c.nodes
      : [{ id: c.id }];
    for (const m of members) {
      if (m && m.id != null) expandedNodes.push({ id: m.id, x: c.x, y: c.y });
    }
  }

  const components = computeConnectedComponents(expandedNodes, links);
  const centroids = computeComponentCentroids(expandedNodes, components, fallbackCenter);

  const componentByNodeId = new Map();
  for (const c of components) {
    for (const nid of c.nodeIds) componentByNodeId.set(nid, c.id);
  }

  const jitterRadius = finite(opts?.jitterRadius) ? opts.jitterRadius : 24;
  let seeded = 0;

  for (const c of list) {
    if (!c || c.id == null) continue;
    const positioned = finite(c.x) && finite(c.y) && !(c.x === 0 && c.y === 0);
    if (positioned) continue;

    const memberIds = Array.isArray(c.nodes) && c.nodes.length > 0
      ? c.nodes.map((m) => String(m?.id ?? ''))
      : [String(c.id)];
    let targetCentroid = null;
    for (const mid of memberIds) {
      const cid = componentByNodeId.get(mid);
      if (!cid) continue;
      const centroid = centroids.get(cid);
      if (centroid && centroid.positionedCount > 0) {
        targetCentroid = centroid;
        break;
      }
    }
    const base = targetCentroid || {
      x: finite(fallbackCenter?.x) ? fallbackCenter.x : 0,
      y: finite(fallbackCenter?.y) ? fallbackCenter.y : 0,
    };
    const { dx, dy } = jitterForId(c.id, jitterRadius);
    c.x = base.x + dx;
    c.y = base.y + dy;
    if (!finite(c.vx)) c.vx = 0;
    if (!finite(c.vy)) c.vy = 0;
    seeded += 1;
  }

  return seeded;
}
