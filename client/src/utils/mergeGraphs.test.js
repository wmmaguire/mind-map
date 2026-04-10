import {
  buildAnalyzeNamespace,
  mergeAnalyzedGraphs,
  namespaceGraph,
  namespacedNodeId,
  unionGraphs,
} from './mergeGraphs';

describe('buildAnalyzeNamespace', () => {
  it('prefers Mongo _id when present', () => {
    expect(buildAnalyzeNamespace({ _id: '507f1f77bcf86cd799439011', filename: 'a.txt' })).toBe(
      '507f1f77bcf86cd799439011'
    );
  });

  it('falls back to filename and sanitizes', () => {
    expect(buildAnalyzeNamespace({ filename: 'my file (1).md' })).toBe('my_file__1__md');
  });
});

describe('namespacedNodeId', () => {
  it('combines namespace and id', () => {
    expect(namespacedNodeId('ns', 1)).toBe('ns__1');
    expect(namespacedNodeId('ns', 'x')).toBe('ns__x');
  });
});

describe('namespaceGraph', () => {
  it('remaps node ids and link endpoints', () => {
    const g = {
      nodes: [{ id: 1, label: 'A' }],
      links: [{ source: 1, target: 1, relationship: 'self' }],
    };
    const out = namespaceGraph(g, 'ns');
    expect(out.nodes[0].id).toBe('ns__1');
    expect(out.links[0].source).toBe('ns__1');
    expect(out.links[0].target).toBe('ns__1');
  });

  it('handles empty graph', () => {
    const out = namespaceGraph({}, 'ns');
    expect(out.nodes).toEqual([]);
    expect(out.links).toEqual([]);
  });
});

describe('mergeAnalyzedGraphs', () => {
  it('prevents id collisions across files', () => {
    const sameLocal = {
      nodes: [{ id: 1, label: 'n' }],
      links: [],
    };
    const merged = mergeAnalyzedGraphs([
      { namespace: 'fileA', graph: sameLocal },
      { namespace: 'fileB', graph: sameLocal },
    ]);
    expect(merged.nodes).toHaveLength(2);
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(['fileA__1', 'fileB__1']);
    const t0 = merged.nodes[0].createdAt;
    const t1 = merged.nodes[1].createdAt;
    expect(typeof t0).toBe('number');
    expect(t1).toBe(t0);
  });

  it('returns empty for empty input', () => {
    expect(mergeAnalyzedGraphs([])).toEqual({ nodes: [], links: [] });
  });
});

describe('unionGraphs', () => {
  it('concatenates disjoint graphs', () => {
    const u = unionGraphs([
      { nodes: [{ id: 'a' }], links: [] },
      { nodes: [{ id: 'b' }], links: [{ source: 'a', target: 'b' }] },
    ]);
    expect(u.nodes).toHaveLength(2);
    expect(u.links).toHaveLength(1);
  });
});
