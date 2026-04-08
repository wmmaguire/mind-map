import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import GuestIdentityBanner from './GuestIdentityBanner';

describe('GuestIdentityBanner', () => {
  it('shows guest active mode by default', () => {
    render(
      <IdentityProvider>
        <GuestIdentityBanner />
      </IdentityProvider>
    );
    expect(screen.getByRole('status', { name: /account mode/i })).toBeInTheDocument();
    expect(screen.getByText('Guest', { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/guest session/i)).toBeInTheDocument();
    expect(screen.getByText(/no account id/i)).toBeInTheDocument();
  });

  it('shows signed-in active id when registered', () => {
    render(
      <IdentityProvider initialRegisteredUserId="acct-test-1">
        <GuestIdentityBanner />
      </IdentityProvider>
    );
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByText(/acct-test-1/i)).toBeInTheDocument();
  });
});
