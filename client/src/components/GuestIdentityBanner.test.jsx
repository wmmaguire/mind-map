import '../setupPolyfills';
import { render, screen, waitFor } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import { GraphTitleProvider } from '../context/GraphTitleContext';
import { LibraryUiProvider } from '../context/LibraryUiContext';
import { AuthProvider } from '../context/AuthContext';
import GuestIdentityBanner, { DEV_PREVIEW_USER_ID } from './GuestIdentityBanner';

function wrap(ui) {
  return (
    <AuthProvider>
      <IdentityProvider>
        <GraphTitleProvider>
          <LibraryUiProvider>{ui}</LibraryUiProvider>
        </GraphTitleProvider>
      </IdentityProvider>
    </AuthProvider>
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
      <AuthProvider>
        <IdentityProvider initialRegisteredUserId="acct-test-1">
          <GraphTitleProvider>
            <LibraryUiProvider>
              <GuestIdentityBanner />
            </LibraryUiProvider>
          </GraphTitleProvider>
        </IdentityProvider>
      </AuthProvider>
    );
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByText('acct-test-1')).toBeInTheDocument();
  });

  it('exposes dev preview user id constant for parity with preview button', () => {
    expect(DEV_PREVIEW_USER_ID).toBe('dev-preview-user');
  });
});
