import '../setupPolyfills';
import React, { useEffect } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    expect(screen.getByText(/Create account/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Sign in/i)).toBeInTheDocument();
    });
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
    expect(accountBtn).toHaveTextContent(/^acct/);
  });

  it('shows View menu on /visualize with Playback and Search toggles', () => {
    render(wrap(<GuestIdentityBanner />, { route: '/visualize' }));
    fireEvent.click(screen.getByRole('button', { name: /^View\b/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Playback/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Search/i })).toBeInTheDocument();
  });

  it('places share control to the left of View on /visualize when sharePayload is set', () => {
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
    const shareBtn = screen.getByRole('button', {
      name: /copy read-only share link to clipboard/i,
    });
    const viewBtn = screen.getByRole('button', { name: /^View\b/i });
    expect(
      shareBtn.compareDocumentPosition(viewBtn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('exposes dev preview user id constant for parity with preview button', () => {
    expect(DEV_PREVIEW_USER_ID).toBe('dev-preview-user');
  });
});
