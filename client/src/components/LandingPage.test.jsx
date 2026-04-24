import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';

function renderLanding(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/visualize" element={<div>visualize-route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LandingPage (#76)', () => {
  test('renders hero, onboarding, feature cards, and reflection', () => {
    renderLanding();

    expect(
      screen.getByRole('heading', { level: 1, name: /^mindmap$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^how it works$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^what you can do$/i })
    ).toBeInTheDocument();
    // "Why it matters" is now collapsed behind a `<details>` disclosure whose
    // `<summary>` reads "Why MindMap?". Assert the summary is present.
    expect(screen.getByText(/^why mindmap\?$/i)).toBeInTheDocument();

    // Each of the six feature cards is present.
    expect(screen.getByRole('heading', { level: 3, name: /ingest your sources/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /analyze into a graph/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /explore the canvas/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /edit, generate, explode/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /^see the shape$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /gleam insights/i })).toBeInTheDocument();
  });

  test('both Get Started CTAs navigate to /visualize', async () => {
    const user = userEvent.setup();
    renderLanding();

    const ctas = screen.getAllByRole('button', { name: /^get started$/i });
    expect(ctas).toHaveLength(2);

    await user.click(ctas[0]);
    expect(screen.getByText('visualize-route')).toBeInTheDocument();
  });
});
