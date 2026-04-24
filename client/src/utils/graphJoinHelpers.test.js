import * as d3 from 'd3';
import { applyKeyedJoin, ensureLayer } from './graphJoinHelpers';

function mountSvg() {
  // jsdom gives us document; create an SVG host for d3.
  const root = document.createElement('div');
  document.body.appendChild(root);
  const svg = d3.select(root).append('svg');
  return { svg, root };
}

describe('ensureLayer', () => {
  test('creates the layer group on first call', () => {
    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'links-layer');
    expect(layer.size()).toBe(1);
    expect(layer.node().tagName.toLowerCase()).toBe('g');
    expect(layer.attr('class')).toBe('links-layer');
    expect(svg.selectAll('g.links-layer').size()).toBe(1);
  });

  test('returns the same element on subsequent calls (no duplicates)', () => {
    const { svg } = mountSvg();
    const a = ensureLayer(svg, 'nodes-layer');
    const b = ensureLayer(svg, 'nodes-layer');
    expect(a.node()).toBe(b.node());
    expect(svg.selectAll('g.nodes-layer').size()).toBe(1);
  });

  test('supports multiple distinct layers under one parent', () => {
    const { svg } = mountSvg();
    const links = ensureLayer(svg, 'links-layer');
    const nodes = ensureLayer(svg, 'nodes-layer');
    expect(links.node()).not.toBe(nodes.node());
    expect(svg.selectAll('g').size()).toBe(2);
    expect(svg.select('g.links-layer').empty()).toBe(false);
    expect(svg.select('g.nodes-layer').empty()).toBe(false);
  });

  test('refuses to compose selectors from non-alnum class names', () => {
    const { svg } = mountSvg();
    // ensureLayer must not accept a class with special characters that could
    // escape the selector. We check that calling with a bad class does not
    // crash and does not append anything.
    expect(() => ensureLayer(svg, 'bad class')).not.toThrow();
    expect(svg.selectAll('g').size()).toBe(0);
  });
});

describe('applyKeyedJoin', () => {
  test('first run: all elements enter, no updates/exits', () => {
    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'links-layer');
    const res = applyKeyedJoin(
      layer,
      'line.link',
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      (d) => d.id,
      {
        onEnter: (enter) => enter.append('line').attr('class', 'link'),
      }
    );
    expect(res.enter.size()).toBe(3);
    expect(res.update.size()).toBe(0);
    expect(res.exit.size()).toBe(0);
    expect(res.merged.size()).toBe(3);
    expect(layer.selectAll('line.link').size()).toBe(3);
  });

  test('re-run with same data: everything is update, no entries / exits, DOM identity preserved', () => {
    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'links-layer');
    applyKeyedJoin(layer, 'line.link', [{ id: 'a' }, { id: 'b' }], (d) => d.id, {
      onEnter: (enter) => enter.append('line').attr('class', 'link'),
    });
    const before = Array.from(layer.selectAll('line.link').nodes());

    const res = applyKeyedJoin(
      layer,
      'line.link',
      [{ id: 'a' }, { id: 'b' }],
      (d) => d.id,
      { onEnter: (enter) => enter.append('line').attr('class', 'link') }
    );

    const after = Array.from(layer.selectAll('line.link').nodes());
    expect(before.length).toBe(after.length);
    expect(before.length).toBe(2);
    expect(before[0]).toBe(after[0]);
    expect(before[1]).toBe(after[1]);
    expect(res.enter.size()).toBe(0);
    expect(res.update.size()).toBe(2);
    expect(res.exit.size()).toBe(0);
  });

  test('mixed delta: survivors update, new ids enter, missing ids exit', () => {
    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'nodes-layer');
    applyKeyedJoin(
      layer,
      'g.node',
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      (d) => d.id,
      { onEnter: (enter) => enter.append('g').attr('class', 'node') }
    );
    // Capture DOM identity via `.nodes()` — `.select()` would propagate the
    // layer's own datum onto the child (d3 behaviour) and corrupt the join.
    const initialNodes = layer.selectAll('g.node').nodes();
    const nodeA = initialNodes.find((el) => d3.select(el).datum().id === 'a');
    expect(layer.selectAll('g.node').size()).toBe(3);

    const res = applyKeyedJoin(
      layer,
      'g.node',
      [{ id: 'a' }, { id: 'd' }],
      (d) => d.id,
      { onEnter: (enter) => enter.append('g').attr('class', 'node') }
    );

    // Starting [a, b, c] → new [a, d]. Survivor: a. Enter: d. Exit: b, c.
    expect(res.enter.size()).toBe(1);
    expect(res.update.size()).toBe(1);
    // d3 selections survive `.remove()` — the DOM is detached but the
    // selection still references the old nodes. We assert on the DOM itself
    // for what ended up on screen.
    expect(res.exit.size()).toBe(2);
    expect(layer.selectAll('g.node').size()).toBe(2);

    // Survivor 'a' is the same DOM node as before.
    const surviving = layer.selectAll('g.node').nodes();
    const aStill = surviving.find((el) => d3.select(el).datum().id === 'a');
    expect(aStill).toBe(nodeA);
  });

  test('onExit hook defers removal to caller', () => {
    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'chips-layer');
    applyKeyedJoin(layer, 'g.chip', [{ id: 'x' }, { id: 'y' }], (d) => d.id, {
      onEnter: (enter) => enter.append('g').attr('class', 'chip'),
    });
    let exitCalls = 0;
    const res = applyKeyedJoin(layer, 'g.chip', [{ id: 'x' }], (d) => d.id, {
      onEnter: (enter) => enter.append('g').attr('class', 'chip'),
      onExit: (exit) => {
        exitCalls = exit.size();
        // Intentionally do not remove — caller simulates a transitioned exit.
      },
    });
    expect(exitCalls).toBe(1);
    expect(res.exit.size()).toBe(1);
    expect(layer.selectAll('g.chip').size()).toBe(2); // survivor + deferred exit
  });

  test('handles null/empty inputs safely', () => {
    const empty1 = applyKeyedJoin(null, 'g.node', [], (d) => d.id);
    expect(empty1.enter.size()).toBe(0);
    expect(empty1.merged.size()).toBe(0);

    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'nodes-layer');
    const empty2 = applyKeyedJoin(layer, 'g.node', null, (d) => d.id);
    expect(empty2.enter.size()).toBe(0);
    expect(empty2.merged.size()).toBe(0);
  });

  test('keyed rebind does not recreate survivors (DOM identity preserved)', () => {
    // Guard the #103 contract: a rebind with the same keys must not
    // re-`.append()` anything. Callers rely on this for the
    // "existing nodes stay put" behaviour.
    const { svg } = mountSvg();
    const layer = ensureLayer(svg, 'nodes-layer');
    let appends = 0;
    const build = (enter) => {
      appends += enter.size();
      return enter.append('g').attr('class', 'node');
    };

    applyKeyedJoin(layer, 'g.node', [{ id: 'a' }, { id: 'b' }], (d) => d.id, {
      onEnter: build,
    });
    const firstPassAppends = appends;

    applyKeyedJoin(layer, 'g.node', [{ id: 'a' }, { id: 'b' }], (d) => d.id, {
      onEnter: build,
    });
    const secondPassAppends = appends - firstPassAppends;

    expect(firstPassAppends).toBe(2);
    expect(secondPassAppends).toBe(0);
  });
});
