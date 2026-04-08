import './setupPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  SessionProvider,
  resetSessionBootstrapForTests,
} from './context/SessionContext';
import { IdentityProvider } from './context/IdentityContext';
import { GraphTitleProvider } from './context/GraphTitleContext';
import { LibraryUiProvider } from './context/LibraryUiContext';
import App from './App';

const sessionId = 'test-session-uuid';

function jsonFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
  };
}

/**
 * Mocks `global.fetch` so real `apiRequest()` (SessionContext + LibraryVisualize)
 * succeeds without a server. Required instead of `jest.mock('./api/http')` because
 * SessionContext binds `apiRequest` once; App.test loads that module first with
 * the real client.
 */
function setupApiFetchMock() {
  global.fetch = jest.fn((url, init) => {
    const u = typeof url === 'string' ? url : String(url);
    if (u.includes('/api/sessions') && init?.method === 'POST') {
      return Promise.resolve(jsonFetchResponse({ sessionId }));
    }
    if (u.includes('/api/files')) {
      return Promise.resolve(jsonFetchResponse({ files: [] }));
    }
    if (u.includes('/api/graphs') && !init?.method) {
      return Promise.resolve(jsonFetchResponse({ graphs: [] }));
    }
    return Promise.resolve(jsonFetchResponse({}));
  });
}

function renderApp(initialEntries) {
  resetSessionBootstrapForTests();
  sessionStorage.clear();
  localStorage.clear();
  setupApiFetchMock();

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SessionProvider>
        <IdentityProvider>
          <GraphTitleProvider>
            <LibraryUiProvider>
              <App />
            </LibraryUiProvider>
          </GraphTitleProvider>
        </IdentityProvider>
      </SessionProvider>
    </MemoryRouter>
  );
}

describe('critical path integration (mocked fetch)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('bootstraps session and shows landing', async () => {
    renderApp(['/']);

    await waitFor(() => {
      expect(screen.getByText(/MindMap/i)).toBeInTheDocument();
    });

    expect(
      screen.getByRole('status', { name: /account mode/i })
    ).toBeInTheDocument();

    expect(global.fetch).toHaveBeenCalled();
    const sessionsPost = global.fetch.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/sessions') && init?.method === 'POST'
    );
    expect(sessionsPost).toBeDefined();
  });

  it('loads visualize route and empty library', async () => {
    renderApp(['/visualize']);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /^Library$/i })
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/No uploaded files yet/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole('link', { name: /Go to home/i })
    ).toBeInTheDocument();

    expect(
      global.fetch.mock.calls.some(([url]) => String(url).includes('/api/files'))
    ).toBe(true);
    expect(
      global.fetch.mock.calls.some(([url]) => String(url).includes('/api/graphs'))
    ).toBe(true);
  });

  it('navigates from landing to visualize', async () => {
    const user = userEvent.setup();
    renderApp(['/']);

    await waitFor(() => {
      expect(screen.getByText(/MindMap/i)).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Visualize/i })
    );

    await waitFor(() => {
      expect(screen.getByText(/No uploaded files yet/i)).toBeInTheDocument();
    });
  });
});
