import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import { IdentityProvider } from '../context/IdentityContext';
import { AuthProvider } from '../context/AuthContext';
import * as AuthContext from '../context/AuthContext';
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

  it('shows profile name when authenticated user has a name', () => {
    const useAuthSpy = jest.spyOn(AuthContext, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 'user-1', email: 'a@b.co', name: 'Alex User' },
      isAuthenticated: true,
      refreshMe: jest.fn(),
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      updateProfile: jest.fn(),
    });
    try {
      render(
        <IdentityProvider initialRegisteredUserId="user-1">
          <LibraryAccountChip />
        </IdentityProvider>
      );
      expect(screen.getByText('Alex User')).toBeInTheDocument();
      expect(screen.getByTitle('Alex User (user-1)')).toBeInTheDocument();
    } finally {
      useAuthSpy.mockRestore();
    }
  });
});
