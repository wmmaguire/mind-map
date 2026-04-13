/**
 * Time-based graph playback: each node/link carries {@link getPlaybackTime} (createdAt or legacy timestamp).
 * Saved graphs rehydrate with the same ordering after reload.
 */

/** @param {object} entity */
export function getPlaybackTime(entity) {
  if (!entity || typeof entity !== 'object') return undefined;
  const v = entity.createdAt ?? entity.timestamp;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** @param {object} entity */
export function getDeletedTime(entity) {
  if (!entity || typeof entity !== 'object') return undefined;
  const v = entity.deletedAt ?? entity.deletedTimestamp;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/** @param {object} entity */
function isEntityPresentAtTime(entity, cutoffTime) {
  const created = getPlaybackTime(entity);
  if (created == null || created > cutoffTime) return false;
  const deleted = getDeletedTime(entity);
  if (deleted == null) return true;
  return cutoffTime < deleted;
}

function linkEndpointId(x) {
  if (x == null) return '';
  return typeof x === 'object' ? String(x.id) : String(x);
}

/**
 * Deep-clone graph with object link endpoints for D3.
 * @param {{ nodes?: object[], links?: object[] }|null} graph
 * @returns {{ nodes: object[], links: object[] }|null}
 */
export function cloneGraphForCommit(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return null;
  const nodes = graph.nodes.map((n) => ({ ...n }));
  const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
  const links = (graph.links || [])
    .map((l) => {
      const sid = linkEndpointId(l.source);
      const tid = linkEndpointId(l.target);
      const s = nodeMap.get(sid);
      const t = nodeMap.get(tid);
      if (!s || !t) return null;
      return {
        ...l,
        source: s,
        target: t,
      };
    })
    .filter(Boolean);
  return { nodes, links };
}

function maxPlaybackTime(graph) {
  let m = -Infinity;
  for (const n of graph?.nodes || []) {
    const t = getPlaybackTime(n);
    const dt = getDeletedTime(n);
    if (t != null) m = Math.max(m, t);
    if (dt != null) m = Math.max(m, dt);
  }
  for (const l of graph?.links || []) {
    const t = getPlaybackTime(l);
    const dt = getDeletedTime(l);
    if (t != null) m = Math.max(m, t);
    if (dt != null) m = Math.max(m, dt);
  }
  return Number.isFinite(m) ? m : null;
}

/**
 * Ensure every node/link has a numeric createdAt (and mirror timestamp for older readers).
 * Legacy graphs with no times get monotonic synthetic times (node order, then link order).
 * @param {{ nodes: object[], links: object[] }} graph - mutated in place
 */
export function ensurePlaybackTimestamps(graph) {
  if (!graph?.nodes) return graph;
  const nodes = graph.nodes;
  const links = graph.links || [];
  const hasAny = [...nodes, ...links].some((e) => getPlaybackTime(e) != null);

  if (!hasAny) {
    const base = Date.now() - (nodes.length + links.length) * 2;
    let t = base;
    nodes.forEach((n) => {
      n.createdAt = ++t;
      n.timestamp = n.createdAt;
    });
    links.forEach((l) => {
      l.createdAt = ++t;
      l.timestamp = l.createdAt;
    });
    return graph;
  }

  let t = (maxPlaybackTime(graph) ?? Date.now()) + 1;
  const bump = () => {
    t += 1;
    return t;
  };
  for (const n of nodes) {
    if (getPlaybackTime(n) == null) {
      n.createdAt = bump();
      n.timestamp = n.createdAt;
    }
  }
  for (const l of links) {
    if (getPlaybackTime(l) == null) {
      l.createdAt = bump();
      l.timestamp = l.createdAt;
    }
  }
  return graph;
}

/**
 * Unique creation times, sorted ascending.
 * @param {{ nodes?: object[], links?: object[] }|null} graph
 * @returns {number[]}
 */
export function getSortedUniquePlaybackTimes(graph) {
  if (!graph?.nodes?.length) return [];
  const s = new Set();
  for (const n of graph.nodes) {
    const t = getPlaybackTime(n);
    if (t != null) s.add(t);
    const dt = getDeletedTime(n);
    if (dt != null) s.add(dt);
  }
  for (const l of graph.links || []) {
    const t = getPlaybackTime(l);
    if (t != null) s.add(t);
    const dt = getDeletedTime(l);
    if (dt != null) s.add(dt);
  }
  return [...s].sort((a, b) => a - b);
}

/**
 * Cumulative view: entities with playback time <= cutoffTime.
 * @param {{ nodes: object[], links: object[] }} graph - full committed graph
 * @param {number} cutoffTime
 * @returns {{ nodes: object[], links: object[] }}
 */
export function buildGraphAtPlaybackTime(graph, cutoffTime) {
  if (!graph?.nodes) return { nodes: [], links: [] };
  const nodes = graph.nodes.filter((n) => {
    return isEntityPresentAtTime(n, cutoffTime);
  });
  const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
  const links = [];
  for (const l of graph.links || []) {
    if (!isEntityPresentAtTime(l, cutoffTime)) continue;
    const sid = linkEndpointId(l.source);
    const tid = linkEndpointId(l.target);
    const s = nodeMap.get(sid);
    const t = nodeMap.get(tid);
    if (!s || !t) continue;
    links.push({
      ...l,
      source: s,
      target: t,
    });
  }
  return { nodes, links };
}

/**
 * Merge incremental editor output with previous committed graph: preserve createdAt for
 * unchanged ids; assign new times for new nodes/links.
 * @param {{ nodes: object[], links: object[] }} next
 * @param {{ nodes: object[], links: object[] }|null} prev
 * @returns {{ nodes: object[], links: object[] }}
 */
export function mergePlaybackTimesFromEdit(next, prev) {
  const prevNodes = new Map((prev?.nodes || []).map((n) => [String(n.id), n]));
  const linkKey = (l) =>
    `${linkEndpointId(l.source)}|${linkEndpointId(l.target)}|${String(l.relationship ?? '')}`;
  const prevLinks = new Map((prev?.links || []).map((l) => [linkKey(l), l]));

  let t = Math.max(maxPlaybackTime(prev) || 0, Date.now());
  const bump = () => {
    t += 1;
    return t;
  };

  const nodes = (next.nodes || []).map((n) => {
    const id = String(n.id);
    const old = prevNodes.get(id);
    const existing = getPlaybackTime(n) ?? (old != null ? getPlaybackTime(old) : null);
    const deleted = getDeletedTime(n) ?? (old != null ? getDeletedTime(old) : null);
    if (existing != null) {
      return {
        ...n,
        createdAt: existing,
        timestamp: existing,
        ...(deleted != null ? { deletedAt: deleted } : {}),
      };
    }
    const nt = bump();
    return {
      ...n,
      createdAt: nt,
      timestamp: nt,
      ...(deleted != null ? { deletedAt: deleted } : {}),
    };
  });

  const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
  const links = (next.links || [])
    .map((l) => {
      const sid = linkEndpointId(l.source);
      const tid = linkEndpointId(l.target);
      const s = nodeMap.get(sid);
      const tnode = nodeMap.get(tid);
      if (!s || !tnode) return null;
      const key = linkKey({ ...l, source: sid, target: tid });
      const old = prevLinks.get(key);
      const existing = getPlaybackTime(l) ?? (old != null ? getPlaybackTime(old) : null);
      const deleted = getDeletedTime(l) ?? (old != null ? getDeletedTime(old) : null);
      let lt;
      if (existing != null) {
        lt = existing;
      } else {
        lt = bump();
      }
      return {
        ...l,
        source: s,
        target: tnode,
        createdAt: lt,
        timestamp: lt,
        ...(deleted != null ? { deletedAt: deleted } : {}),
      };
    })
    .filter(Boolean);

  return { nodes, links };
}
