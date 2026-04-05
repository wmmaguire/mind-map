import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('GraphVisualization edit modes', () => {
  it('makes tool modes mutually exclusive (delete vs add node)', async () => {
    const user = userEvent.setup();
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    await user.click(screen.getByRole('button', { name: /Delete/i }));
    expect(
      screen.getByText(/Click on a node or relationship to delete/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Add Node/i }));
    expect(
      screen.queryByText(/Click on a node or relationship to delete/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Add New Concept/i })
    ).toBeInTheDocument();
  });

  it('clears edit modes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    await user.click(screen.getByRole('button', { name: /Add Node/i }));
    expect(
      screen.getByRole('heading', { name: /Add New Concept/i })
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('heading', { name: /Add New Concept/i })
    ).not.toBeInTheDocument();
  });

  it('turns off Add Relationship when opening Add Node', async () => {
    const user = userEvent.setup();
    render(
      <GraphVisualization
        data={minimalData}
        onDataUpdate={jest.fn()}
        width={800}
        height={600}
      />
    );

    await user.click(screen.getByRole('button', { name: /Add Relationship/i }));
    const relBtn = screen.getByRole('button', { name: /Add Relationship/i });
    expect(relBtn).toHaveClass('active');

    await user.click(screen.getByRole('button', { name: /Add Node/i }));
    expect(relBtn).not.toHaveClass('active');
    expect(
      screen.getByRole('heading', { name: /Add New Concept/i })
    ).toBeInTheDocument();
  });
});
