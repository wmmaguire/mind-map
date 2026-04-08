import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import GuestIdentityBanner, { DEV_PREVIEW_USER_ID } from './GuestIdentityBanner';

describe('GuestIdentityBanner', () => {
  it('shows compact guest label by default', () => {
    render(
      <IdentityProvider>
        <GuestIdentityBanner />
      </IdentityProvider>
    );
    expect(screen.getByRole('status', { name: /account mode/i })).toBeInTheDocument();
    expect(screen.getByText('Guest', { exact: true })).toBeInTheDocument();
  });

  it('shows signed-in id when registered', () => {
    render(
      <IdentityProvider initialRegisteredUserId="acct-test-1">
        <GuestIdentityBanner />
      </IdentityProvider>
    );
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByText('acct-test-1')).toBeInTheDocument();
  });

  it('exposes dev preview user id constant for parity with preview button', () => {
    expect(DEV_PREVIEW_USER_ID).toBe('dev-preview-user');
  });
});
