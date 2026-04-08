import {
  graphHistoryReducer,
  initialGraphHistoryState,
  normalizeGraphSnapshot,
  materializeGraphSnapshot,
} from './graphHistory';

const G1 = {
  nodes: [{ id: 'a', label: 'A' }],
  links: [],
};

const G2 = {
  nodes: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  links: [{ source: 'a', target: 'b', relationship: 'r' }],
};

describe('graphHistory', () => {
  test('normalizeGraphSnapshot stores link endpoints as ids', () => {
    const n = { id: 'x', label: 'X' };
    const m = { id: 'y', label: 'Y' };
    const snap = normalizeGraphSnapshot({
      nodes: [n, m],
      links: [{ source: n, target: m, relationship: 't' }],
    });
    expect(snap.links[0].source).toBe('x');
    expect(snap.links[0].target).toBe('y');
  });

  test('materializeGraphSnapshot restores object link endpoints', () => {
    const snap = normalizeGraphSnapshot(G2);
    const g = materializeGraphSnapshot(snap);
    expect(g.nodes).toHaveLength(2);
    expect(g.links).toHaveLength(1);
    expect(g.links[0].source).toEqual(expect.objectContaining({ id: 'a' }));
    expect(g.links[0].target).toEqual(expect.objectContaining({ id: 'b' }));
  });

  test('RESET stores one entry', () => {
    let s = graphHistoryReducer(initialGraphHistoryState, { type: 'RESET', graph: G1 });
    expect(s.entries).toHaveLength(1);
    expect(s.index).toBe(0);
    s = graphHistoryReducer(s, { type: 'RESET', graph: { nodes: [], links: [] } });
    expect(s.entries).toHaveLength(0);
    expect(s.index).toBe(-1);
  });

  test('COMMIT appends and STEP moves index', () => {
    let s = graphHistoryReducer(initialGraphHistoryState, { type: 'RESET', graph: G1 });
    s = graphHistoryReducer(s, { type: 'COMMIT', graph: G2 });
    expect(s.entries).toHaveLength(2);
    expect(s.index).toBe(1);
    s = graphHistoryReducer(s, { type: 'STEP', delta: -1 });
    expect(s.index).toBe(0);
    s = graphHistoryReducer(s, { type: 'STEP', delta: 1 });
    expect(s.index).toBe(1);
  });

  test('COMMIT after STEP drops redo branch', () => {
    let s = graphHistoryReducer(initialGraphHistoryState, { type: 'RESET', graph: G1 });
    s = graphHistoryReducer(s, { type: 'COMMIT', graph: G2 });
    s = graphHistoryReducer(s, { type: 'STEP', delta: -1 });
    const G3 = {
      nodes: [{ id: 'a', label: 'A' }, { id: 'c', label: 'C' }],
      links: [],
    };
    s = graphHistoryReducer(s, { type: 'COMMIT', graph: G3 });
    expect(s.entries).toHaveLength(2);
    expect(s.index).toBe(1);
    expect(s.entries[1].nodes.map((n) => n.id).sort()).toEqual(['a', 'c']);
  });

  test('duplicate COMMIT is ignored', () => {
    let s = graphHistoryReducer(initialGraphHistoryState, { type: 'RESET', graph: G1 });
    s = graphHistoryReducer(s, { type: 'COMMIT', graph: G1 });
    expect(s.entries).toHaveLength(1);
  });

  test('maxDepth trims oldest entries', () => {
    let s = initialGraphHistoryState;
    s = graphHistoryReducer(s, { type: 'RESET', graph: { nodes: [{ id: '0' }], links: [] } });
    for (let i = 1; i <= 5; i += 1) {
      s = graphHistoryReducer(
        s,
        { type: 'COMMIT', graph: { nodes: [{ id: String(i) }], links: [] } },
        { maxDepth: 3 }
      );
    }
    expect(s.entries).toHaveLength(3);
    expect(s.index).toBe(2);
    expect(s.entries[0].nodes[0].id).toBe('3');
    expect(s.entries[2].nodes[0].id).toBe('5');
  });
});
