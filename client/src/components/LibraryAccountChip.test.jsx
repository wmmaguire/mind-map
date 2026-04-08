import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import LibraryAccountChip from './LibraryAccountChip';

describe('LibraryAccountChip', () => {
  it('shows guest session for default identity', () => {
    render(
      <IdentityProvider>
        <LibraryAccountChip />
      </IdentityProvider>
    );
    expect(screen.getByText(/Guest session/i)).toBeInTheDocument();
  });

  it('shows signed-in affordance when registered', () => {
    render(
      <IdentityProvider initialRegisteredUserId="acct-1">
        <LibraryAccountChip />
      </IdentityProvider>
    );
    expect(screen.getByText(/Signed in/i)).toBeInTheDocument();
    expect(screen.getByTitle('acct-1')).toBeInTheDocument();
  });
});
