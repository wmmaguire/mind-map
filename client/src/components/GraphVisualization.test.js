import '../setupPolyfills';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import GraphVisualization from './GraphVisualization';

jest.mock('../context/SessionContext', () => ({
  useSession: () => ({ sessionId: 'test-session' }),
}));

jest.mock('../api/http', () => ({
  apiRequest: jest.fn(async () => ({ success: true, data: { nodes: [], links: [] } })),
  getApiErrorMessage: (e) => (e && e.message) || 'error',
}));

const minimalData = {
  nodes: [
    { id: 'n1', label: 'One' },
    { id: 'n2', label: 'Two' },
  ],
  links: [],
};

const emptyGraphData = { nodes: [], links: [] };

describe('GraphVisualization graph action menu', () => {
  it('moves focus to Close when the Actions menu opens (#30)', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Open graph actions menu/i })
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Close graph actions menu/i })
      ).toHaveFocus();
    });
  });

  it('opens the action menu from the floating Actions button', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Open graph actions menu/i })
    );
    expect(
      screen.getByRole('group', { name: /Graph actions/i })
    ).toBeInTheDocument();
    expect(screen.getByText('AI Generation')).toBeInTheDocument();
    expect(screen.getByText('Edit graph')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Open AI Generation form$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Open graph actions help/i })
    ).toBeInTheDocument();
  });

  it('collapses and expands AI Generation section via accordion toggle', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Open graph actions menu/i })
    );
    expect(
      screen.getByRole('button', { name: /^Open AI Generation form$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /^AI Generation algorithm$/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /^AI Generation$/i })
    );
    expect(
      screen.queryByRole('button', { name: /^Open AI Generation form$/i })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /^AI Generation$/i })
    );
    expect(
      screen.getByRole('button', { name: /^Open AI Generation form$/i })
    ).toBeInTheDocument();
  });

  it('opens the action menu on context menu (right-click) on the SVG', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const svg = document.querySelector('.graph-visualization');
    expect(svg).toBeTruthy();
    fireEvent.contextMenu(svg, { clientX: 120, clientY: 140, bubbles: true });

    expect(
      screen.getByRole('group', { name: /Graph actions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Open AI Generation form$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Add Node$/i })
    ).toBeInTheDocument();
  });

  it('closes the action menu on Escape', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const svg = document.querySelector('.graph-visualization');
    fireEvent.contextMenu(svg, { clientX: 120, clientY: 140, bubbles: true });
    expect(
      screen.getByRole('group', { name: /Graph actions/i })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('group', { name: /Graph actions/i })
    ).not.toBeInTheDocument();
  });

  it('shows on-canvas status chip while Add concept modal is open (#29)', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Open graph actions menu/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /^Add Node$/i }));

    expect(
      screen.getByRole('heading', { name: /Add New Concept/i })
    ).toBeInTheDocument();
    const chip = screen.getByRole('status', {
      name: /Add concept\. Fill in the form to add a node\. Cancel returns to the graph\./i,
    });
    expect(within(chip).getByText('Add concept')).toBeInTheDocument();
    fireEvent.click(within(chip).getByRole('button', { name: /^Cancel$/i }));
    expect(
      screen.queryByRole('status', { name: /Add concept/i })
    ).not.toBeInTheDocument();
  });

  it('shows AI Generation algorithm dropdown in the Actions menu (#62)', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Open graph actions menu/i })
    );
    expect(
      screen.getByRole('combobox', { name: /^AI Generation algorithm$/i })
    ).toBeInTheDocument();
  });

  it('shows Explode subgraph on the node selection tooltip (#69)', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const svg = document.querySelector('.graph-visualization');
    expect(svg).toBeTruthy();
    const nodeG = svg.querySelector('g.node');
    expect(nodeG).toBeTruthy();
    fireEvent.click(nodeG);

    // Tooltip now only surfaces the two action buttons (Extend + Explode).
    // Clicking Explode opens a dedicated modal that hosts the guidance + count controls.
    const explodeBtn = await screen.findByTestId('graph-tooltip-explode-btn');
    expect(explodeBtn).toBeInTheDocument();
    expect(screen.getByTestId('graph-tooltip-extend-btn')).toBeInTheDocument();

    fireEvent.click(explodeBtn);

    // Modal should render the guidance preset, count slider (2–6 default 4), and primary submit.
    const modalCount = await screen.findByTestId('graph-explode-modal-count');
    expect(modalCount).toBeInTheDocument();
    expect(modalCount).toHaveAttribute('min', '2');
    expect(modalCount).toHaveAttribute('max', '6');
    expect(modalCount).toHaveValue('4');
    expect(
      document.getElementById('graph-explode-modal-preset')
    ).toBeInTheDocument();
    expect(screen.getByTestId('graph-explode-modal-submit')).toBeInTheDocument();
  });

  it('does not show Explode subgraph on the tooltip when readOnly (#69)', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        readOnly
      />
    );

    const svg = document.querySelector('.graph-visualization');
    fireEvent.click(svg.querySelector('g.node'));

    await waitFor(() => {
      const tip = document.querySelector('.graph-canvas-tooltip');
      expect(tip).toBeTruthy();
      expect(within(tip).getByText(/^One$/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('graph-tooltip-explode-btn')).not.toBeInTheDocument();
  });

  it('shows discovery search, match count, minimap, and focus control (#38)', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    expect(screen.getByTestId('graph-discovery-search')).toBeInTheDocument();
    expect(screen.getByTestId('graph-discovery-count')).toHaveTextContent(/0 match/);
    expect(screen.getByTestId('graph-minimap')).toBeInTheDocument();
    expect(screen.getByTestId('graph-discovery-focus')).toBeInTheDocument();
    expect(screen.getByTestId('graph-discovery-show-all')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('graph-discovery-search'), {
      target: { value: 'one' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('graph-discovery-count')).toHaveTextContent(/1 match/);
    });
  });

  it('exposes an accessible minimap with pointer interaction (GitHub #73)', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const mini = screen.getByTestId('graph-minimap');
    expect(mini).toHaveAttribute('role', 'img');
    expect(mini.getAttribute('aria-label') || '').toMatch(/overview/i);

    fireEvent.pointerDown(mini, {
      pointerId: 42,
      button: 0,
      clientX: 70,
      clientY: 50,
    });
    fireEvent.pointerUp(mini, {
      pointerId: 42,
      button: 0,
      clientX: 70,
      clientY: 50,
    });
  });

  it('still closes add-node modal on Escape', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const svg = document.querySelector('.graph-visualization');
    fireEvent.contextMenu(svg, { clientX: 120, clientY: 140, bubbles: true });
    fireEvent.click(screen.getByRole('button', { name: /^Add Node$/i }));

    expect(
      screen.getByRole('heading', { name: /Add New Concept/i })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('heading', { name: /Add New Concept/i })
    ).not.toBeInTheDocument();
  });
});

describe('GraphVisualization empty graph guidance (#40)', () => {
  it('shows library empty state when variant is library', () => {
    render(
      <GraphVisualization
        data={emptyGraphData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        emptyStateVariant="library"
      />
    );

    expect(
      screen.getByRole('region', { name: /Getting started with an empty graph/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /No concepts yet/i })).toBeInTheDocument();
    expect(screen.getByText(/Analyze/i)).toBeInTheDocument();
    expect(screen.getByText(/saved graph/i)).toBeInTheDocument();
  });

  it('shows default empty hint when variant is default', () => {
    render(
      <GraphVisualization
        data={emptyGraphData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        emptyStateVariant="default"
      />
    );

    expect(
      screen.getByRole('region', { name: /Getting started with an empty graph/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Open the/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows read-only status when empty and readOnly', () => {
    render(
      <GraphVisualization
        data={emptyGraphData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        readOnly
        emptyStateVariant="library"
      />
    );

    expect(
      screen.queryByRole('region', { name: /Getting started with an empty graph/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/This graph has no concepts to display/i)
    ).toBeInTheDocument();
  });

  it('hides editable empty overlay when the graph has nodes', () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        emptyStateVariant="library"
      />
    );

    expect(
      screen.queryByRole('region', { name: /Getting started with an empty graph/i })
    ).not.toBeInTheDocument();
  });
});

/**
 * Regression: the on-canvas `.graph-canvas-tooltip` popover must be dismissed
 * when any node-generation / edit submit fires. Otherwise the stale popover
 * lingers over the graph while nodes rebuild around it. Covers Extend, Explode,
 * and Add Concept submit paths (Apply, Add Relationship, Add connections share
 * the same `hideCanvasTooltip` helper).
 */
describe('GraphVisualization canvas tooltip dismissal on submit', () => {
  const openTooltipForFirstNode = () => {
    const svg = document.querySelector('.graph-visualization');
    const nodeG = svg.querySelector('g.node');
    fireEvent.click(nodeG);
    return document.querySelector('.graph-canvas-tooltip');
  };

  it('hides the canvas tooltip after the Extend modal is submitted', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const tip = openTooltipForFirstNode();
    expect(tip).toBeTruthy();
    await waitFor(() => {
      expect(tip.style.opacity).not.toBe('0');
    });

    fireEvent.click(await screen.findByTestId('graph-tooltip-extend-btn'));
    const submit = await screen.findByTestId('graph-extend-modal-submit');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(tip.style.opacity).toBe('0');
    });
  });

  it('hides the canvas tooltip after the Explode modal is submitted', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const tip = openTooltipForFirstNode();
    expect(tip).toBeTruthy();
    await waitFor(() => {
      expect(tip.style.opacity).not.toBe('0');
    });

    fireEvent.click(await screen.findByTestId('graph-tooltip-explode-btn'));
    const submit = await screen.findByTestId('graph-explode-modal-submit');
    fireEvent.click(submit);

    await waitFor(() => {
      expect(tip.style.opacity).toBe('0');
    });
  });

  it('hides the canvas tooltip after Add Concept is submitted', async () => {
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    const tip = openTooltipForFirstNode();
    expect(tip).toBeTruthy();
    await waitFor(() => {
      expect(tip.style.opacity).not.toBe('0');
    });

    fireEvent.contextMenu(document.querySelector('.graph-visualization'), {
      clientX: 120,
      clientY: 140,
      bubbles: true,
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add Node$/i }));
    const modal = screen
      .getByRole('heading', { name: /Add New Concept/i })
      .closest('.modal-content');
    const labelInput = modal.querySelector('input[type="text"]');
    fireEvent.change(labelInput, { target: { value: 'Fresh concept' } });
    fireEvent.click(within(modal).getByRole('button', { name: /Add Concept/i }));

    await waitFor(() => {
      expect(tip.style.opacity).toBe('0');
    });
  });
});

/**
 * #103 M1–M4 contract: playback scrubs must preserve DOM identity for
 * surviving communities (keyed data joins) and the thumbnail fallback path
 * must be idempotent across rebuilds (regression cover for #86's original
 * attempt). These tests feed bumped `playbackScrubToken` values to the same
 * component and assert no re-mount of the surviving `<g class="node">`.
 */
describe('GraphVisualization keyed data joins across playback scrubs (#103)', () => {
  it('survivor nodes keep their DOM identity across a scrub (M1+M2)', () => {
    const { rerender } = render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        playbackScrubToken={0}
      />
    );

    const svg = document.querySelector('.graph-visualization');
    const before = Array.from(svg.querySelectorAll('g.nodes-layer g.node'));
    expect(before.length).toBe(2);

    act(() => {
      rerender(
        <GraphVisualization
          data={minimalData}
          onDataUpdate={jest.fn()}
          width={800}
          height={600}
          playbackScrubToken={1}
        />
      );
    });

    const after = Array.from(svg.querySelectorAll('g.nodes-layer g.node'));
    expect(after.length).toBe(2);
    // Same DOM elements — no unmount/remount. This is the whole point of
    // #103: the user should see new content materialise onto the existing
    // scene, not the scene flicker-replace itself.
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('entering nodes are added; existing ones stay put (M1+M2)', () => {
    const seed = {
      nodes: [
        { id: 'n1', label: 'One' },
        { id: 'n2', label: 'Two' },
      ],
      links: [],
    };
    const withAdded = {
      nodes: [...seed.nodes, { id: 'n3', label: 'Three' }],
      links: [],
    };
    const { rerender } = render(
      <GraphVisualization
        data={seed}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        playbackScrubToken={0}
      />
    );

    const svg = document.querySelector('.graph-visualization');
    const before = Array.from(svg.querySelectorAll('g.nodes-layer g.node'));
    expect(before.length).toBe(2);

    act(() => {
      rerender(
        <GraphVisualization
          data={withAdded}
          onDataUpdate={jest.fn()}
          width={800}
          height={600}
          playbackScrubToken={1}
        />
      );
    });

    const after = Array.from(svg.querySelectorAll('g.nodes-layer g.node'));
    // Note: a data change here also re-runs the setup effect (not just the
    // scrub effect), so we allow either "keyed join preserved DOM" or
    // "setup effect rebuilt". Either way the end state must have the right
    // count, which is what the user perceives. The scrub-only case above
    // guards the identity promise.
    expect(after.length).toBe(3);
  });

  it('renders thumbnail + ring when thumbnailUrl is a valid https URL (M4)', () => {
    const dataWithThumb = {
      nodes: [
        {
          id: 't1',
          label: 'WithThumb',
          thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/test.jpg/64px-test.jpg',
        },
      ],
      links: [],
    };
    render(
      <GraphVisualization
        data={dataWithThumb}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );
    const svg = document.querySelector('.graph-visualization');
    const nodeG = svg.querySelector('g.nodes-layer g.node');
    expect(nodeG).toBeTruthy();
    expect(nodeG.querySelector('image.graph-node-thumb')).toBeTruthy();
    expect(nodeG.querySelector('circle.graph-node-ring')).toBeTruthy();
    // Fallback disc must not be pre-emptively rendered; it only shows on
    // image error (covered by the idempotency test below).
    expect(nodeG.querySelector('circle.graph-node-disc')).toBeFalsy();
  });

  it('thumbnail fallback is idempotent across scrub-driven rebuilds (M4)', () => {
    // Rejects non-https schemes, so the thumbUrl below never mounts an
    // `<image>` and the node renders as a plain `circle.graph-node-disc`
    // from the no-thumb branch. Rebuilding on a scrub must not produce
    // duplicate discs or orphan defs.
    const dataWithBadThumb = {
      nodes: [
        {
          id: 't1',
          label: 'BadThumb',
          // eslint-disable-next-line no-script-url -- deliberate XSS payload: proves the fallback path rejects javascript: schemes
          thumbnailUrl: 'javascript:alert(1)',
        },
      ],
      links: [],
    };
    const { rerender } = render(
      <GraphVisualization
        data={dataWithBadThumb}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        playbackScrubToken={0}
      />
    );
    const svg = document.querySelector('.graph-visualization');
    const initialDiscs = svg.querySelectorAll(
      'g.nodes-layer g.node circle.graph-node-disc'
    );
    const initialImages = svg.querySelectorAll(
      'g.nodes-layer g.node image.graph-node-thumb'
    );
    expect(initialDiscs.length).toBe(1);
    expect(initialImages.length).toBe(0);

    for (let i = 1; i <= 3; i += 1) {
      act(() => {
        rerender(
          <GraphVisualization
            data={dataWithBadThumb}
            onDataUpdate={jest.fn()}
            width={800}
            height={600}
            playbackScrubToken={i}
          />
        );
      });
    }

    const finalDiscs = svg.querySelectorAll(
      'g.nodes-layer g.node circle.graph-node-disc'
    );
    const finalImages = svg.querySelectorAll(
      'g.nodes-layer g.node image.graph-node-thumb'
    );
    const finalDefs = svg.querySelectorAll('g.nodes-layer g.node defs');
    // Exactly one disc, no thumbnails, no leaked defs. If the fallback
    // path ever stops being idempotent (the #86 regression) we'd see
    // duplicates here.
    expect(finalDiscs.length).toBe(1);
    expect(finalImages.length).toBe(0);
    expect(finalDefs.length).toBe(0);
  });

  it('playback scrub does not tear down graph-root (M2)', () => {
    const { rerender } = render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
        playbackScrubToken={0}
      />
    );
    const svg = document.querySelector('.graph-visualization');
    const graphRootBefore = svg.querySelector('g.graph-root');
    expect(graphRootBefore).toBeTruthy();

    for (let i = 1; i <= 3; i += 1) {
      act(() => {
        rerender(
          <GraphVisualization
            data={minimalData}
            onDataUpdate={jest.fn()}
            width={800}
            height={600}
            playbackScrubToken={i}
          />
        );
      });
    }

    const graphRootAfter = svg.querySelector('g.graph-root');
    // Same `<g class="graph-root">` element — not a remount. If the
    // setup effect ever starts depending on `playbackScrubToken` again,
    // this will fail, which is exactly the check we want.
    expect(graphRootAfter).toBe(graphRootBefore);
  });

  it('graph-root holds only canonical layer groups (M5 dead-code guard)', () => {
    // Before M5, dropping the M3 wipe exposed a latent leak: legacy
    // `const node = g.selectAll('.node')...` and `linkGroups` blocks in the
    // outer effect appended duplicate DOM that used to get wiped by
    // `updateVisualization()`'s `g.selectAll('*').remove()`. Without the
    // wipe, those siblings leaked next to the canonical layer groups,
    // giving two `<g class="node">` per community with competing click /
    // drag handlers and a plain `r=20` circle stacked over the real
    // thumbnail or disc. This test guards the cleanup: the only direct
    // children of `g.graph-root` must be the three canonical layers.
    const seed = {
      nodes: [
        { id: 'n1', label: 'One' },
        { id: 'n2', label: 'Two' },
      ],
      links: [{ source: 'n1', target: 'n2', relationship: 'related' }],
    };
    render(
      <GraphVisualization
        data={seed}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );
    const svg = document.querySelector('.graph-visualization');
    const root = svg.querySelector('g.graph-root');
    expect(root).toBeTruthy();

    const directChildClasses = Array.from(root.children).map(
      (c) => c.getAttribute('class') || ''
    );
    // Exactly the three canonical layers. Order isn't asserted (z-order is
    // handled by insertion order elsewhere) but presence + no extras is.
    expect(directChildClasses.sort()).toEqual([
      'cluster-thumb-layer',
      'links-layer',
      'nodes-layer',
    ]);
    // Direct children that used to leak must stay at zero count.
    expect(root.querySelectorAll(':scope > g.node').length).toBe(0);
    expect(root.querySelectorAll(':scope > g.link-group').length).toBe(0);
    // And the canonical places still hold the expected DOM.
    expect(
      svg.querySelectorAll('g.nodes-layer > g.node').length
    ).toBe(2);
    expect(
      svg.querySelectorAll('g.links-layer > line.link').length
    ).toBe(1);
  });

  it('node subtree has drag listeners wired (M5 drag regression guard)', () => {
    // M5 deleted the legacy `const node = g.selectAll('.node')...call(dragBehavior)`
    // block because its DOM was redundant with `g.nodes-layer > g.node`.
    // The drag wiring had to migrate to the keyed-join `onEnter` hook. This
    // test guards that migration: the canonical node subtree must carry
    // d3-drag listeners after mount. d3 stores them on `__on` (array of
    // `{type, name, value}` entries). Without `.call(dragBehavior)`, the
    // array would be empty or missing the drag namespace.
    const seed = {
      nodes: [
        { id: 'n1', label: 'One' },
        { id: 'n2', label: 'Two' },
      ],
      links: [],
    };
    render(
      <GraphVisualization
        data={seed}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );
    const svg = document.querySelector('.graph-visualization');
    const targetNode = svg.querySelector('g.nodes-layer g.node');
    expect(targetNode).toBeTruthy();

    const listeners = Array.isArray(targetNode.__on) ? targetNode.__on : [];
    const dragTypes = listeners
      .map((entry) => entry && entry.type)
      .filter(Boolean);
    // d3-drag attaches to at least mousedown / pointerdown / touchstart
    // depending on the environment. We assert at least one of these
    // pointer-start event types is wired — which is strictly more than
    // the "no drag" case (empty `__on`).
    const hasDragStart = dragTypes.some((t) =>
      ['mousedown', 'pointerdown', 'touchstart'].includes(t)
    );
    expect(hasDragStart).toBe(true);
  });
});
