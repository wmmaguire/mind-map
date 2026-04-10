import '../setupPolyfills';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdentityProvider } from '../context/IdentityContext';
import { GraphTitleProvider } from '../context/GraphTitleContext';
import { LibraryUiProvider } from '../context/LibraryUiContext';
import { GraphChromeUiProvider } from '../context/GraphChromeUiContext';
import { AuthProvider } from '../context/AuthContext';
import GuestIdentityBanner, { DEV_PREVIEW_USER_ID } from './GuestIdentityBanner';

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
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByText('acct-test-1')).toBeInTheDocument();
  });

  it('shows View menu on /visualize with Playback and Search toggles', () => {
    render(wrap(<GuestIdentityBanner />, { route: '/visualize' }));
    fireEvent.click(screen.getByRole('button', { name: /^View\b/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Playback/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox', { name: /Search/i })).toBeInTheDocument();
  });

  it('exposes dev preview user id constant for parity with preview button', () => {
    expect(DEV_PREVIEW_USER_ID).toBe('dev-preview-user');
  });
});
