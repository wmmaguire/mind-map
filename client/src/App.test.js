import './setupPolyfills';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import {
  SessionProvider,
  resetSessionBootstrapForTests,
} from './context/SessionContext';

beforeEach(() => {
  resetSessionBootstrapForTests();
  sessionStorage.clear();
});

test('renders app title', () => {
  render(
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  );
  expect(screen.getByText(/MindMap/i)).toBeInTheDocument();
});
