import '../setupPolyfills';
import React, { useEffect } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext';
import { GraphTitleProvider } from '../context/GraphTitleContext';
import { LibraryUiProvider } from '../context/LibraryUiContext';
import { GraphChromeUiProvider } from '../context/GraphChromeUiContext';
import { AuthProvider } from '../context/AuthContext';
import {
  GraphHistoryUiProvider,
  useGraphHistoryUi,
} from '../context/GraphHistoryUiContext';
import GuestIdentityBanner, { DEV_PREVIEW_USER_ID } from './GuestIdentityBanner';

function RegisteredVisualizeWithShare() {
  const { setSharePayload } = useGraphHistoryUi();
  useEffect(() => {
    setSharePayload({ onShareClick: () => {} });
    return () => setSharePayload(null);
  }, [setSharePayload]);
  return <GuestIdentityBanner />;
}

function wrap(ui, { route = '/' } = {}) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <IdentityProvider>
          <GraphTitleProvider>
            <LibraryUiProvider>
              <GraphChromeUiProvider>{ui}</GraphChromeUiProvider>
            </LibraryUiProvider>
          </GraphTitleProvider>
        </IdentityProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('GuestIdentityBanner', () => {
  it('shows sign-in control when unauthenticated (no redundant Guest label)', async () => {
    render(wrap(<GuestIdentityBanner />));
    expect(screen.getByRole('status', { name: /account mode/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Sign in/i)).toBeInTheDocument();
    });
  });

  it('shows Visualize link on landing when registered', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <IdentityProvider initialRegisteredUserId="acct-test-1">
            <GraphTitleProvider>
              <LibraryUiProvider>
                <GraphChromeUiProvider>
                  <GuestIdentityBanner />
                </GraphChromeUiProvider>
              </LibraryUiProvider>
            </GraphTitleProvider>
          </IdentityProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    const visualize = screen.getByRole('button', {
      name: /visualize: open library and network graphs/i,
    });
    expect(visualize).toBeInTheDocument();
  });

  it('shows signed-in id when registered', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <IdentityProvider initialRegisteredUserId="acct-test-1">
            <GraphTitleProvider>
              <LibraryUiProvider>
                <GraphChromeUiProvider>
                  <GuestIdentityBanner />
                </GraphChromeUiProvider>
              </LibraryUiProvider>
            </GraphTitleProvider>
          </IdentityProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    const accountBtn = screen.getByRole('button', {
      name: /open account menu.*acct-test-1/i,
    });
    expect(accountBtn).toBeInTheDocument();
    expect(accountBtn.textContent).toMatch(/acct/);
  });

  it('shows View menu on /visualize with Playback, Search, and Insights toggles', () => {
    render(wrap(<GuestIdentityBanner />, { route: '/visualize' }));
    fireEvent.click(screen.getByRole('button', { name: /^View\b/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Playback/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Search/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /^Insights$/i })).toBeInTheDocument();
  });

  it('shows Go to home on /visualize and hides it on landing', () => {
    const { unmount } = render(wrap(<GuestIdentityBanner />, { route: '/visualize' }));
    expect(
      screen.getByRole('button', { name: /go to home/i })
    ).toBeInTheDocument();
    unmount();
    render(wrap(<GuestIdentityBanner />, { route: '/' }));
    expect(screen.queryByRole('button', { name: /go to home/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /visualize: open library and network graphs/i })
    ).toBeInTheDocument();
  });

  it('places Home to the left of Library on /visualize', () => {
    render(wrap(<GuestIdentityBanner />, { route: '/visualize' }));
    const homeBtn = screen.getByRole('button', { name: /go to home/i });
    const libraryBtn = screen.getByRole('button', { name: /open library/i });
    expect(
      homeBtn.compareDocumentPosition(libraryBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('navigates to landing when Go to home is activated', async () => {
    render(
      <MemoryRouter initialEntries={['/visualize']}>
        <AuthProvider>
          <IdentityProvider>
            <GraphTitleProvider>
              <LibraryUiProvider>
                <GraphChromeUiProvider>
                  <Routes>
                    <Route path="/visualize" element={<GuestIdentityBanner />} />
                    <Route path="/" element={<div>Landing</div>} />
                  </Routes>
                </GraphChromeUiProvider>
              </LibraryUiProvider>
            </GraphTitleProvider>
          </IdentityProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /go to home/i }));
    await waitFor(() => {
      expect(screen.getByText('Landing')).toBeInTheDocument();
    });
  });

  it('exposes share in View menu on /visualize when sharePayload is set', () => {
    render(
      <MemoryRouter initialEntries={['/visualize']}>
        <AuthProvider>
          <IdentityProvider initialRegisteredUserId="acct-share-ui">
            <GraphTitleProvider>
              <LibraryUiProvider>
                <GraphChromeUiProvider>
                  <GraphHistoryUiProvider>
                    <RegisteredVisualizeWithShare />
                  </GraphHistoryUiProvider>
                </GraphChromeUiProvider>
              </LibraryUiProvider>
            </GraphTitleProvider>
          </IdentityProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /^View\b/i }));
    expect(
      screen.getByRole('menuitem', {
        name: /copy read-only share link to clipboard/i,
      })
    ).toBeInTheDocument();
  });

  it('exposes dev preview user id constant for parity with preview button', () => {
    expect(DEV_PREVIEW_USER_ID).toBe('dev-preview-user');
  });
});
