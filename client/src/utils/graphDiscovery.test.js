import {
  normalizeGraphLabel,
  nodesMatchingLabelQuery,
  createFocusZoomTransform,
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
});
