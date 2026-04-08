/**
 * In-memory graph snapshots for Library visualize (#36 minimal replay).
 * Snapshots store link endpoints as primitive ids for stable JSON equality.
 */

export const DEFAULT_GRAPH_HISTORY_MAX = 30;

export const initialGraphHistoryState = {
  entries: [],
  index: -1,
};

/**
 * @param {{ nodes: object[], links: object[] }} data
 * @returns {{ nodes: object[], links: object[] }}
 */
export function normalizeGraphSnapshot(data) {
  if (!data || !Array.isArray(data.nodes)) {
    return { nodes: [], links: [] };
  }
  const nodes = data.nodes.map((n) => ({ ...n }));
  const links = (data.links || []).map((l) => ({
    ...l,
    source: typeof l.source === 'object' ? l.source.id : l.source,
    target: typeof l.target === 'object' ? l.target.id : l.target,
  }));
  return { nodes, links };
}

/**
 * @param {{ nodes: object[], links: object[] }} snap normalized snapshot
 */
export function materializeGraphSnapshot(snap) {
  if (!snap || !Array.isArray(snap.nodes)) {
    return { nodes: [], links: [] };
  }
  const nodeMap = new Map(snap.nodes.map((n) => [String(n.id), { ...n }]));
  const nodes = Array.from(nodeMap.values());
  const links = (snap.links || [])
    .map((l) => {
      const sid = String(l.source);
      const tid = String(l.target);
      const source = nodeMap.get(sid);
      const target = nodeMap.get(tid);
      if (!source || !target) return null;
      const { source: _s, target: _t, ...rest } = l;
      return {
        ...rest,
        source,
        target,
      };
    })
    .filter(Boolean);
  return { nodes, links };
}

function snapshotsEqual(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * @param {typeof initialGraphHistoryState} state
 * @param {{ type: string, graph?: object, delta?: number, index?: number }} action
 * @param {{ maxDepth?: number }} options
 */
export function graphHistoryReducer(state, action, options = {}) {
  const maxDepth = Math.max(
    2,
    Number(options.maxDepth) || DEFAULT_GRAPH_HISTORY_MAX
  );

  switch (action.type) {
  case 'RESET': {
    const snap = normalizeGraphSnapshot(action.graph);
    if (snap.nodes.length === 0 && snap.links.length === 0) {
      return { ...initialGraphHistoryState };
    }
    return { entries: [snap], index: 0 };
  }
  case 'COMMIT': {
    const snap = normalizeGraphSnapshot(action.graph);
    if (snap.nodes.length === 0 && snap.links.length === 0) {
      return { ...initialGraphHistoryState };
    }
    if (state.index < 0 || state.entries.length === 0) {
      return { entries: [snap], index: 0 };
    }
    const base = state.entries.slice(0, state.index + 1);
    const last = base[base.length - 1];
    if (snapshotsEqual(last, snap)) {
      return state;
    }
    let nextEntries = [...base, snap];
    let index = nextEntries.length - 1;
    while (nextEntries.length > maxDepth) {
      nextEntries = nextEntries.slice(1);
      index -= 1;
    }
    return { entries: nextEntries, index };
  }
  case 'STEP': {
    const delta = action.delta;
    if (typeof delta !== 'number' || delta === 0) return state;
    const next = state.index + delta;
    if (next < 0 || next >= state.entries.length) return state;
    return { ...state, index: next };
  }
  case 'GOTO': {
    const i = action.index;
    if (typeof i !== 'number' || i < 0 || i >= state.entries.length) {
      return state;
    }
    return { ...state, index: i };
  }
  default:
    return state;
  }
}
