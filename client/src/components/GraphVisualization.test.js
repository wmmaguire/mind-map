import '../setupPolyfills';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import GraphVisualization from './GraphVisualization';

jest.mock('../context/SessionContext', () => ({
  useSession: () => ({ sessionId: 'test-session' }),
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
