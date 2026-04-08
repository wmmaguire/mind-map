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
        { source: 't_2', target: 'n1', relationship: 'linked' }
      ]
    };

    const out = mergeGenerateNodeResponse(current, patch, width, height);

    expect(out.nodes.map(n => n.id).sort()).toEqual(['n1', 't_2']);
    expect(out.links).toHaveLength(1);
    expect(out.links[0].source.id).toBe('t_2');
    expect(out.links[0].target.id).toBe('n1');
    expect(out.links[0].relationship).toBe('linked');
  });
});
