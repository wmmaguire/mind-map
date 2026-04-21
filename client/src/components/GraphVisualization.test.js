import '../setupPolyfills';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
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
