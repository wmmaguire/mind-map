import {
  normalizeGraphLabel,
  nodesMatchingLabelQuery,
  createFocusZoomTransform,
  discoveryFocusPoint,
} from './graphDiscovery';

describe('graphDiscovery (#38)', () => {
  it('normalizeGraphLabel lowercases and trims', () => {
    expect(normalizeGraphLabel('  Hello ')).toBe('hello');
    expect(normalizeGraphLabel('')).toBe('');
  });

  it('nodesMatchingLabelQuery filters by substring', () => {
    const nodes = [
      { id: '1', label: 'Apple' },
      { id: '2', label: 'Application' },
      { id: '3', label: 'Banana' },
    ];
    expect(nodesMatchingLabelQuery(nodes, 'app').map(n => n.id)).toEqual(['1', '2']);
    expect(nodesMatchingLabelQuery(nodes, '')).toEqual([]);
    expect(nodesMatchingLabelQuery(nodes, '   ')).toEqual([]);
  });

  it('createFocusZoomTransform centers a graph point', () => {
    const t = createFocusZoomTransform(100, 200, 800, 600, 2);
    const [sx, sy] = t.apply([100, 200]);
    expect(sx).toBeCloseTo(400, 5);
    expect(sy).toBeCloseTo(300, 5);
  });

  it('discoveryFocusPoint uses community coords when base node is a (0,0) placeholder', () => {
    const node = { id: 'a', label: 'Alpha', x: 0, y: 0 };
    const communities = new Map([
      [
        'a',
        {
          id: 'a',
          nodes: [node],
          x: 150,
          y: 220,
        },
      ],
    ]);
    const p = discoveryFocusPoint(node, communities, 400, 300);
    expect(p.x).toBe(150);
    expect(p.y).toBe(220);
  });

  it('discoveryFocusPoint falls back when no community map', () => {
    const node = { id: 'b', label: 'Beta', x: 12, y: 34 };
    const p = discoveryFocusPoint(node, null, 400, 300);
    expect(p.x).toBe(12);
    expect(p.y).toBe(34);
  });
});
