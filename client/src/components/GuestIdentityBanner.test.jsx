import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import { GraphTitleProvider } from '../context/GraphTitleContext';
import { LibraryUiProvider } from '../context/LibraryUiContext';
import GuestIdentityBanner, { DEV_PREVIEW_USER_ID } from './GuestIdentityBanner';

function wrap(ui) {
  return (
    <IdentityProvider>
      <GraphTitleProvider>
        <LibraryUiProvider>{ui}</LibraryUiProvider>
      </GraphTitleProvider>
    </IdentityProvider>
  );
}

describe('GuestIdentityBanner', () => {
  it('shows compact guest label by default', () => {
    render(wrap(<GuestIdentityBanner />));
    expect(screen.getByRole('status', { name: /account mode/i })).toBeInTheDocument();
    expect(screen.getByText('Guest', { exact: true })).toBeInTheDocument();
  });

  it('shows signed-in id when registered', () => {
    render(
      <IdentityProvider initialRegisteredUserId="acct-test-1">
        <GraphTitleProvider>
          <LibraryUiProvider>
            <GuestIdentityBanner />
          </LibraryUiProvider>
        </GraphTitleProvider>
      </IdentityProvider>
    );
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByText('acct-test-1')).toBeInTheDocument();
  });

  it('exposes dev preview user id constant for parity with preview button', () => {
    expect(DEV_PREVIEW_USER_ID).toBe('dev-preview-user');
  });
});
