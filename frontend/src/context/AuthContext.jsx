/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth as authApi, getToken, setToken as saveToken, removeToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const activeToken = getToken();
      if (!activeToken) return null;
      const savedUser = localStorage.getItem('tro_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => getToken());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Revalidate session on initial mount if token is found
  useEffect(() => {
    let isMounted = true;

    async function revalidateSession() {
      const activeToken = getToken();
      if (!activeToken) {
        if (isMounted) {
          removeToken();
          setUser(null);
          setToken(null);
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await authApi.getMe();
        if (isMounted) {
          setUser(currentUser);
          localStorage.setItem('tro_user', JSON.stringify(currentUser));
          setToken(activeToken);
          setAuthError(null);
        }
      } catch (err) {
        // Only invalidate session if credentials are explicitly rejected by backend (401/403)
        if (err.status === 401 || err.status === 403) {
          console.warn('Session verification failed (expired/invalid), logging out:', err.message);
          if (isMounted) {
            removeToken();
            setUser(null);
            setToken(null);
          }
        } else {
          // Network error or backend temporarily unavailable: keep stored user profile
          console.warn('Backend currently unreachable, preserving offline session:', err.message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    revalidateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const data = await authApi.login(username, password);
      const userProfile = {
        id: data.user_id,
        username: data.username,
        role: data.role,
        full_name: data.full_name,
      };

      saveToken(data.access_token);
      localStorage.setItem('tro_user', JSON.stringify(userProfile));

      setToken(data.access_token);
      setUser(userProfile);
      return userProfile;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserProfile = useCallback(async () => {
    try {
      const currentUser = await authApi.getMe();
      setUser(currentUser);
      localStorage.setItem('tro_user', JSON.stringify(currentUser));
      return currentUser;
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
      return null;
    }
  }, []);

  const register = useCallback(async (userData) => {
    setLoading(true);
    setAuthError(null);
    try {
      const newUser = await authApi.register(userData);
      // Auto login after successful registration if password is provided
      const cleanUsername = newUser?.username || (userData.username ? userData.username.split('::')[0].trim() : '');
      if (userData.password) {
        return await login(cleanUsername, userData.password);
      }
      return newUser;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [login]);

  const logout = useCallback(() => {
    removeToken();
    localStorage.removeItem('tro_tenant_room_id');
    setUser(null);
    setToken(null);
    setAuthError(null);
  }, []);

  // Listen for global session expiration dispatched by API client
  useEffect(() => {
    const handleSessionExpired = () => {
      logout();
    };
    window.addEventListener('tro:session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('tro:session_expired', handleSessionExpired);
    };
  }, [logout]);

  const value = {
    user,
    token,
    loading,
    authError,
    isAuthenticated: Boolean(token && user),
    isLandlord: Boolean(token && user?.role === 'landlord'),
    isTenant: Boolean(token && user?.role === 'tenant'),
    isAdmin: Boolean(token && (user?.role === 'admin' || user?.role === 'root_admin')),
    isRootAdmin: Boolean(token && user?.role === 'root_admin'),
    isPendingAdmin: Boolean(token && user?.role === 'pending_admin'),
    refreshUser: fetchUserProfile,
    login,
    register,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
