import './setupPolyfills';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SessionProvider } from './context/SessionContext';

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
