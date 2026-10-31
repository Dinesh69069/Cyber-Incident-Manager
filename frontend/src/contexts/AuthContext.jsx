/**
 * AuthContext.jsx
 * ---------------
 * Global authentication state management using React Context.
 * Stores the JWT token in localStorage and parses user info from the payload.
 *
 * In a real backend:
 *  - The token is issued by FastAPI's POST /auth/login endpoint.
 *  - The decoded payload contains: sub (email), user_id, role, is_premium, exp.
 *  - The token is sent as a Bearer token on every API request via api.js interceptor.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

const TOKEN_KEY = 'cyber_token';
const USER_KEY  = 'cyber_user';

/** Parse and validate a JWT payload (NOT cryptographic — frontend only) */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map((c) =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/** Check if a JWT token has not expired */
function isTokenValid(token) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now();
}

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session from localStorage on mount ────────────────────────────
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser  = localStorage.getItem(USER_KEY);

      if (storedToken && isTokenValid(storedToken) && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // localStorage blocked or corrupted
    }
    setLoading(false);
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    const { access_token, user_id, role, is_premium } = res.data;

    const payload = parseJwt(access_token);
    const userObj = {
      id:         user_id,
      email:      payload?.sub || email,
      full_name:  payload?.full_name || email.split('@')[0],
      role,
      is_premium,
    };

    try {
      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(userObj));
    } catch { /* storage blocked */ }

    setToken(access_token);
    setUser(userObj);
    return userObj;
  }, []);

  // ── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(async (full_name, email, password) => {
    const res = await authApi.register({ full_name, email, password });
    const { access_token, user_id, role, is_premium } = res.data;

    const payload = parseJwt(access_token);
    const userObj = {
      id:         user_id,
      email:      payload?.sub || email,
      full_name,
      role,
      is_premium,
    };

    try {
      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(userObj));
    } catch { /* storage blocked */ }

    setToken(access_token);
    setUser(userObj);
    return userObj;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* storage blocked */ }
    setToken(null);
    setUser(null);
  }, []);

  // ── Update local user (e.g., after premium upgrade) ───────────────────────
  const updateUser = useCallback((updates, newToken = null) => {
    if (newToken) {
      try { localStorage.setItem(TOKEN_KEY, newToken); } catch {}
      setToken(newToken);
    }
    setUser((prev) => {
      const updated = { ...prev, ...updates };
      try { localStorage.setItem(USER_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  // ── Decoded token accessor ────────────────────────────────────────────────
  const getTokenPayload = useCallback(() => {
    return token ? parseJwt(token) : null;
  }, [token]);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    isAdmin:         user?.role === 'admin',
    isPremium:       user?.is_premium === true,
    login,
    register,
    logout,
    updateUser,
    getTokenPayload,
    rawToken: token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
