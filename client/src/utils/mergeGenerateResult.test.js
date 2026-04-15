import { mergeGenerateNodeResponse } from './mergeGenerateResult';

describe('mergeGenerateNodeResponse', () => {
  const width = 800;
  const height = 600;

  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    Math.random.mockRestore();
  });

  it('adds new nodes and resolves string link ids to objects', () => {
    const current = {
      nodes: [{ id: 'n1', label: 'One', x: 100, y: 200 }],
      links: []
    };
    const patch = {
      nodes: [{ id: 't_2', label: 'New', description: 'd' }],
      links: [
        { source: 't_2', target: 'n1', relationship: 'linked', strength: 0.82 }
      ]
    };

    const out = mergeGenerateNodeResponse(current, patch, width, height);

    expect(out.nodes.map(n => n.id).sort()).toEqual(['n1', 't_2']);
    const added = out.nodes.find(n => n.id === 't_2');
    expect(added.timestamp).toEqual(expect.any(Number));
    expect(added.createdAt).toEqual(added.timestamp);
    expect(out.links).toHaveLength(1);
    expect(out.links[0].source.id).toBe('t_2');
    expect(out.links[0].target.id).toBe('n1');
    expect(out.links[0].relationship).toBe('linked');
    expect(out.links[0].strength).toBeCloseTo(0.82, 6);
    expect(out.links[0].timestamp).toEqual(expect.any(Number));
    expect(out.links[0].createdAt).toEqual(out.links[0].timestamp);
  });

  it('removes deleted nodes and their links before merging patch', () => {
    const current = {
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'b', label: 'B', x: 10, y: 10 },
      ],
      links: [{ source: 'a', target: 'b', relationship: 'r' }],
    };
    const patch = {
      nodes: [{ id: 'c', label: 'C' }],
      links: [{ source: 'c', target: 'a', relationship: 'new' }],
    };
    const out = mergeGenerateNodeResponse(current, patch, width, height, {
      deletedNodeIds: ['b'],
    });
    expect(out.nodes.map(n => n.id).sort()).toEqual(['a', 'c']);
    expect(out.links).toHaveLength(1);
    expect(out.links[0].target.id).toBe('a');
    expect(out.links[0].source.id).toBe('c');
  });
});
