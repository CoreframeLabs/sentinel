import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { api, ApiError } from './api';
import { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Records tour completion (finish or skip) server-side so it never
   * auto-starts again for this user, on any device. */
  markTourSeen(): Promise<void>;
  /** Deployment-level flag from GET /api/config: this is a demo instance, so
   * the dashboards show a role-aware scenario card. */
  demoMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Public endpoint, fetched independently of the session: a visitor needs
  // it before logging in, and a failure here must never block the app.
  useEffect(() => {
    api<{ demoMode: boolean }>('/api/config')
      .then((res) => setDemoMode(res.demoMode))
      .catch(() => setDemoMode(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    } finally {
      setUser(null);
    }
  }, []);

  const markTourSeen = useCallback(async () => {
    // Optimistic: the tour must not reappear even if the network call fails;
    // the server flag catches up on the next successful call.
    setUser((u) => (u ? { ...u, tourCompletedAt: u.tourCompletedAt ?? new Date().toISOString() } : u));
    try {
      await api('/api/users/me/tour-complete', { method: 'POST' });
    } catch {
      // Non-fatal: purely a UX preference.
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, markTourSeen, demoMode }),
    [user, loading, login, logout, markTourSeen, demoMode]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
