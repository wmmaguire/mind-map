import { computeGraphInsights, graphInsightNodeId } from './graphInsights';

describe('graphInsights (#83)', () => {
  it('graphInsightNodeId normalizes objects and primitives', () => {
    expect(graphInsightNodeId({ id: 1 })).toBe('1');
    expect(graphInsightNodeId('a')).toBe('a');
  });

  it('computes metrics on a triangle (3 nodes, 3 edges, one component)', () => {
    const g = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      links: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 'c', target: 'a' },
      ],
    };
    const s = computeGraphInsights(g);
    expect(s.nodeCount).toBe(3);
    expect(s.edgeCount).toBe(3);
    expect(s.density).toBeCloseTo(1, 5);
    expect(s.componentCount).toBe(1);
    expect(s.largestComponentSize).toBe(3);
    expect(s.degreeMin).toBe(2);
    expect(s.degreeMax).toBe(2);
    expect(s.degreeMedian).toBe(2);
    expect(s.isolateCount).toBe(0);
    expect(s.averageClustering).toBeCloseTo(1, 5);
    expect(s.topByDegree).toHaveLength(3);
    expect(s.topByDegree[0].degree).toBe(2);
  });

  it('handles isolates and two components', () => {
    const g = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'x', label: 'Lonely' },
      ],
      links: [{ source: 'a', target: 'b' }],
    };
    const s = computeGraphInsights(g);
    expect(s.componentCount).toBe(2);
    expect(s.largestComponentSize).toBe(2);
    expect(s.isolateCount).toBe(1);
    expect(s.degreeMin).toBe(0);
    expect(s.density).toBeCloseTo(1 / 3, 5);
  });

  it('sums link strength into weighted degree', () => {
    const g = {
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      links: [{ source: 'a', target: 'b', strength: 0.5 }],
    };
    const s = computeGraphInsights(g);
    expect(s.edgeCount).toBe(1);
    expect(s.topByDegree[0].weightedDegree).toBeCloseTo(0.5, 5);
    expect(s.weightedDegreeMax).toBeCloseTo(0.5, 5);
  });

  it('returns safe defaults for empty graph', () => {
    const s = computeGraphInsights({ nodes: [], links: [] });
    expect(s.nodeCount).toBe(0);
    expect(s.edgeCount).toBe(0);
    expect(s.density).toBe(0);
    expect(s.componentCount).toBe(0);
    expect(s.topByDegree).toEqual([]);
  });
});
