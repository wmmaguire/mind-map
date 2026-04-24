import {
  computeConnectedComponents,
  computeComponentCentroids,
  seedPositionsForNewCommunities,
} from './graphLayoutComponents';

describe('computeConnectedComponents', () => {
  test('returns empty array for empty input', () => {
    expect(computeConnectedComponents([], [])).toEqual([]);
    expect(computeConnectedComponents(null, null)).toEqual([]);
  });

  test('treats every node as its own component when no links', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const comps = computeConnectedComponents(nodes, []);
    expect(comps).toHaveLength(3);
    expect(comps.map((c) => c.id).sort()).toEqual(['a', 'b', 'c']);
    expect(comps.every((c) => c.size === 1)).toBe(true);
  });

  test('groups linked nodes via object or raw-id endpoints', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const links = [
      { source: 'a', target: 'b' },
      { source: { id: 'c' }, target: { id: 'd' } },
    ];
    const comps = computeConnectedComponents(nodes, links);
    expect(comps).toHaveLength(2);
    const sizes = comps.map((c) => c.size).sort();
    expect(sizes).toEqual([2, 2]);
    const abComp = comps.find((c) => c.nodeIds.includes('a'));
    expect(abComp.nodeIds.sort()).toEqual(['a', 'b']);
  });

  test('ignores links to missing nodes', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }];
    const links = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'ghost' },
    ];
    const comps = computeConnectedComponents(nodes, links);
    expect(comps).toHaveLength(1);
    expect(comps[0].nodeIds.sort()).toEqual(['a', 'b']);
  });

  test('produces deterministic component ids (lowest-id, stable order)', () => {
    const nodes = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];
    const links = [{ source: 'b', target: 'c' }];
    const comps = computeConnectedComponents(nodes, links);
    expect(comps.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('computeComponentCentroids', () => {
  test('averages only positioned nodes + falls back when none positioned', () => {
    const nodes = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 300, y: 100 },
      { id: 'c' },
    ];
    const components = [
      { id: 'a', nodeIds: ['a', 'b'] },
      { id: 'c', nodeIds: ['c'] },
    ];
    const centroids = computeComponentCentroids(nodes, components, { x: 500, y: 500 });
    expect(centroids.get('a')).toEqual({ x: 200, y: 100, positionedCount: 2 });
    expect(centroids.get('c')).toEqual({ x: 500, y: 500, positionedCount: 0 });
  });

  test('treats (0,0) placeholders as unpositioned', () => {
    const nodes = [{ id: 'a', x: 0, y: 0 }];
    const components = [{ id: 'a', nodeIds: ['a'] }];
    const centroids = computeComponentCentroids(nodes, components, { x: 400, y: 300 });
    expect(centroids.get('a')).toEqual({ x: 400, y: 300, positionedCount: 0 });
  });

  test('ignores NaN / infinite coordinates', () => {
    const nodes = [
      { id: 'a', x: NaN, y: 100 },
      { id: 'b', x: 200, y: 200 },
    ];
    const components = [{ id: 'a', nodeIds: ['a', 'b'] }];
    const centroids = computeComponentCentroids(nodes, components, { x: 0, y: 0 });
    expect(centroids.get('a')).toEqual({ x: 200, y: 200, positionedCount: 1 });
  });
});

describe('seedPositionsForNewCommunities', () => {
  test('leaves already-positioned communities untouched', () => {
    const communities = [
      { id: 'a', x: 123, y: 456, nodes: [{ id: 'a' }] },
    ];
    const count = seedPositionsForNewCommunities(communities, [], { x: 0, y: 0 });
    expect(count).toBe(0);
    expect(communities[0].x).toBe(123);
    expect(communities[0].y).toBe(456);
  });

  test('seeds unpositioned community near its component centroid', () => {
    const communities = [
      { id: 'a', x: 100, y: 100, nodes: [{ id: 'a' }] },
      { id: 'b', x: 140, y: 100, nodes: [{ id: 'b' }] },
      { id: 'c', nodes: [{ id: 'c' }] },
    ];
    const links = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ];
    const count = seedPositionsForNewCommunities(communities, links, { x: 400, y: 300 });
    expect(count).toBe(1);
    const c = communities[2];
    expect(typeof c.x).toBe('number');
    expect(typeof c.y).toBe('number');
    // Centroid of {a,b} is (120,100); jitter radius default 24, so within 25 units.
    expect(Math.hypot(c.x - 120, c.y - 100)).toBeLessThanOrEqual(25);
    expect(c.vx).toBe(0);
    expect(c.vy).toBe(0);
  });

  test('falls back to viewport centre when the component has no positioned neighbour', () => {
    const communities = [
      { id: 'lonely', nodes: [{ id: 'lonely' }] },
    ];
    const count = seedPositionsForNewCommunities(communities, [], { x: 400, y: 300 });
    expect(count).toBe(1);
    const c = communities[0];
    expect(Math.hypot(c.x - 400, c.y - 300)).toBeLessThanOrEqual(25);
  });

  test('is deterministic for the same id (stable mental map across re-renders)', () => {
    const makeCommunity = () => ({ id: 'new', nodes: [{ id: 'new' }] });
    const a = makeCommunity();
    const b = makeCommunity();
    seedPositionsForNewCommunities([a], [], { x: 100, y: 100 });
    seedPositionsForNewCommunities([b], [], { x: 100, y: 100 });
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  test('treats (0,0) and NaN as unpositioned', () => {
    const communities = [
      { id: 'origin', x: 0, y: 0, nodes: [{ id: 'origin' }] },
      { id: 'nan', x: NaN, y: 10, nodes: [{ id: 'nan' }] },
    ];
    const count = seedPositionsForNewCommunities(communities, [], { x: 300, y: 200 });
    expect(count).toBe(2);
    expect(communities[0].x).not.toBe(0);
    expect(Number.isFinite(communities[1].x)).toBe(true);
  });
});
