import './setupPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import {
  SessionProvider,
  resetSessionBootstrapForTests,
} from './context/SessionContext';
import { IdentityProvider } from './context/IdentityContext';
import { AuthProvider } from './context/AuthContext';
import { GraphTitleProvider } from './context/GraphTitleContext';
import { LibraryUiProvider } from './context/LibraryUiContext';
import { GraphHistoryUiProvider } from './context/GraphHistoryUiContext';

beforeEach(() => {
  resetSessionBootstrapForTests();
  sessionStorage.clear();
});

test('renders app title', () => {
  render(
    <BrowserRouter>
      <SessionProvider>
        <AuthProvider>
          <IdentityProvider>
            <GraphTitleProvider>
              <LibraryUiProvider>
                <GraphHistoryUiProvider>
                  <App />
                </GraphHistoryUiProvider>
              </LibraryUiProvider>
            </GraphTitleProvider>
          </IdentityProvider>
        </AuthProvider>
      </SessionProvider>
    </BrowserRouter>
  );
  expect(screen.getAllByText(/MindMap/i).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { name: /^How it works$/i })).toBeInTheDocument();
  // Landing page (#76) now ships hero + bottom CTAs, so multiple "Get Started" buttons exist.
  expect(
    screen.getAllByRole('button', { name: /^get started$/i }).length
  ).toBeGreaterThanOrEqual(1);
});

test('shows guest identity banner', async () => {
  render(
    <BrowserRouter>
      <SessionProvider>
        <AuthProvider>
          <IdentityProvider>
            <GraphTitleProvider>
              <LibraryUiProvider>
                <GraphHistoryUiProvider>
                  <App />
                </GraphHistoryUiProvider>
              </LibraryUiProvider>
            </GraphTitleProvider>
          </IdentityProvider>
        </AuthProvider>
      </SessionProvider>
    </BrowserRouter>
  );
  expect(screen.getByRole('status', { name: /account mode/i })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/Sign in/i)).toBeInTheDocument();
  });
});
