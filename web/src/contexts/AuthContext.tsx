import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { verifySession, loginRequest, logoutRequest } from '../lib/api';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  checkSession: () => Promise<void>;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkSession = async () => {
    setIsAuthenticated(await verifySession());
  };

  useEffect(() => {
    checkSession().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (password: string) => {
    const res = await loginRequest(password);
    if (res.ok) setIsAuthenticated(true);
    return res;
  };

  const logout = async () => {
    await logoutRequest();
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, checkSession, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
