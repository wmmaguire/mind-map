import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { apiRequest, ApiError } from '../api/http';
import { isGoogleIdentityReady, isGoogleSignInConfigured } from '../lib/googleIdentity';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    status: 'loading', // loading | guest | authenticated
    user: null,
  });

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiRequest('/api/auth/me', { method: 'GET' });
      if (data?.success && data.user) {
        setAuthState({ status: 'authenticated', user: data.user });
      } else {
        setAuthState({ status: 'guest', user: null });
      }
    } catch {
      setAuthState({ status: 'guest', user: null });
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const register = useCallback(async ({ email, password, name }) => {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      json: { email, password, name },
    });
    if (data?.success && data.user) {
      setAuthState({ status: 'authenticated', user: data.user });
    } else {
      await refreshMe();
    }
    return data;
  }, [refreshMe]);

  const login = useCallback(async ({ email, password }) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      json: { email, password },
    });
    if (data?.success && data.user) {
      setAuthState({ status: 'authenticated', user: data.user });
    } else {
      await refreshMe();
    }
    return data;
  }, [refreshMe]);

  /**
   * Disable Google auto-select so the next page load doesn't silently re-sign
   * the user after they've logged out. Safe to call when GIS hasn't loaded.
   * #102.
   */
  const disableGoogleAutoSelect = useCallback(() => {
    try {
      if (isGoogleIdentityReady()) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch (err) {
      console.warn('[auth] google.accounts.id.disableAutoSelect failed', err);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    disableGoogleAutoSelect();
    setAuthState({ status: 'guest', user: null });
  }, [disableGoogleAutoSelect]);

  /**
   * Request a fresh nonce from the server. The server mints a 32-byte token,
   * sets it as an httpOnly cookie, and returns it in the body so we can pass
   * it into the GIS initialize call. Server verifies both copies match on the
   * subsequent POST /api/auth/google (#102).
   *
   * @returns {Promise<string>} the nonce string.
   */
  const requestGoogleNonce = useCallback(async () => {
    const data = await apiRequest('/api/auth/google/nonce', { method: 'POST' });
    if (!data?.success || typeof data.nonce !== 'string') {
      throw new Error('Failed to mint Google nonce');
    }
    return data.nonce;
  }, []);

  /**
   * Exchange a Google credential (ID token) for a MindMap session.
   *
   * Resolves to one of:
   *   - `{ outcome: 'signed-in', user }` — session cookie is now set.
   *   - `{ outcome: 'link-required', linkToken, email }` — caller must show a
   *     confirmation dialog and then call `linkGoogleAccount(linkToken)`.
   *
   * Throws on any other failure (network, invalid credential, etc.).
   *
   * #102.
   */
  const signInWithGoogle = useCallback(async ({ credential, nonce }) => {
    try {
      const data = await apiRequest('/api/auth/google', {
        method: 'POST',
        json: { credential, nonce },
      });
      if (data?.success && data.user) {
        setAuthState({ status: 'authenticated', user: data.user });
        return { outcome: 'signed-in', user: data.user };
      }
      await refreshMe();
      return { outcome: 'signed-in', user: data?.user || null };
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LINK_REQUIRED' && err.body?.linkToken) {
        return {
          outcome: 'link-required',
          linkToken: err.body.linkToken,
          email: err.body.email || '',
        };
      }
      throw err;
    }
  }, [refreshMe]);

  /**
   * Finalize Google ↔ password account linking after user confirmation. Only
   * called when `signInWithGoogle` returned `link-required`. On success, the
   * server writes `googleId` onto the existing row and issues a fresh session
   * cookie. #102.
   */
  const linkGoogleAccount = useCallback(async (linkToken) => {
    const data = await apiRequest('/api/auth/google/link', {
      method: 'POST',
      json: { linkToken },
    });
    if (data?.success && data.user) {
      setAuthState({ status: 'authenticated', user: data.user });
    } else {
      await refreshMe();
    }
    return data;
  }, [refreshMe]);

  const updateProfile = useCallback(async ({ name }) => {
    const data = await apiRequest('/api/auth/me', {
      method: 'PATCH',
      json: { name },
    });
    if (data?.success && data.user) {
      setAuthState({ status: 'authenticated', user: data.user });
    }
    return data;
  }, []);

  const requestPasswordReset = useCallback(async ({ email }) => {
    return apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      json: { email },
    });
  }, []);

  const completePasswordReset = useCallback(async ({ token, password }) => {
    const data = await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      json: { token, password },
    });
    if (data?.success && data.user) {
      setAuthState({ status: 'authenticated', user: data.user });
    }
    return data;
  }, []);

  const value = useMemo(() => ({
    status: authState.status,
    user: authState.user,
    isAuthenticated: authState.status === 'authenticated',
    refreshMe,
    register,
    login,
    logout,
    updateProfile,
    requestPasswordReset,
    completePasswordReset,
    // #102 — Google Sign-In
    isGoogleSignInConfigured: isGoogleSignInConfigured(),
    requestGoogleNonce,
    signInWithGoogle,
    linkGoogleAccount,
    disableGoogleAutoSelect,
  }), [
    authState.status,
    authState.user,
    refreshMe,
    register,
    login,
    logout,
    updateProfile,
    requestPasswordReset,
    completePasswordReset,
    requestGoogleNonce,
    signInWithGoogle,
    linkGoogleAccount,
    disableGoogleAutoSelect,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

