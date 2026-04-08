import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import { AuthProvider } from '../context/AuthContext';
import LibraryAccountChip from './LibraryAccountChip';

describe('LibraryAccountChip', () => {
  it('shows guest session for default identity', () => {
    render(
      <AuthProvider>
        <IdentityProvider>
          <LibraryAccountChip />
        </IdentityProvider>
      </AuthProvider>
    );
    expect(screen.getByText(/Guest session/i)).toBeInTheDocument();
  });

  it('shows signed-in affordance when registered', () => {
    render(
      <AuthProvider>
        <IdentityProvider initialRegisteredUserId="acct-1">
          <LibraryAccountChip />
        </IdentityProvider>
      </AuthProvider>
    );
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByTitle('acct-1')).toBeInTheDocument();
  });
});
