import './setupPolyfills';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import {
  SessionProvider,
  resetSessionBootstrapForTests,
} from './context/SessionContext';
import { IdentityProvider } from './context/IdentityContext';
import { GraphTitleProvider } from './context/GraphTitleContext';

beforeEach(() => {
  resetSessionBootstrapForTests();
  sessionStorage.clear();
});

test('renders app title', () => {
  render(
    <BrowserRouter>
      <SessionProvider>
        <IdentityProvider>
          <GraphTitleProvider>
            <App />
          </GraphTitleProvider>
        </IdentityProvider>
      </SessionProvider>
    </BrowserRouter>
  );
  expect(screen.getByText(/MindMap/i)).toBeInTheDocument();
});

test('shows guest identity banner', () => {
  render(
    <BrowserRouter>
      <SessionProvider>
        <IdentityProvider>
          <GraphTitleProvider>
            <App />
          </GraphTitleProvider>
        </IdentityProvider>
      </SessionProvider>
    </BrowserRouter>
  );
  expect(screen.getByRole('status', { name: /account mode/i })).toBeInTheDocument();
  expect(screen.getByText('Guest', { exact: true })).toBeInTheDocument();
});
