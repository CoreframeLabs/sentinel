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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
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
    () => ({ user, loading, login, logout, markTourSeen }),
    [user, loading, login, logout, markTourSeen]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
