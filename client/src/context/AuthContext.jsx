import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { apiRequest } from '../api/http';

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

  const logout = useCallback(async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setAuthState({ status: 'guest', user: null });
  }, []);

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

  const value = useMemo(() => ({
    status: authState.status,
    user: authState.user,
    isAuthenticated: authState.status === 'authenticated',
    refreshMe,
    register,
    login,
    logout,
    updateProfile,
  }), [authState.status, authState.user, refreshMe, register, login, logout, updateProfile]);

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

