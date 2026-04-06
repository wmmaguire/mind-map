import '../setupPolyfills';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('GraphVisualization graph action menu', () => {
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
      screen.getByRole('menu', { name: /Graph actions/i })
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
      screen.getByRole('menu', { name: /Graph actions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Generate Nodes$/i })
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
      screen.getByRole('menu', { name: /Graph actions/i })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('menu', { name: /Graph actions/i })
    ).not.toBeInTheDocument();
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
