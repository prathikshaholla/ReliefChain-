'use client';
// ============================================================================
// Client session: JWT storage, authenticated fetch, global data refresh.
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { UserRole } from '@/lib/permissions';

export interface SessionUser {
  userId: number;
  email: string;
  fullName: string;
  role: UserRole;
  zoneId: number | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface SessionValue {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  api: <T = any>(path: string, opts?: { method?: string; body?: unknown }) => Promise<T>;
  /** Increments after every successful mutation; data hooks refetch on change. */
  version: number;
  refresh: () => void;
}

const TOKEN_KEY = 'reliefchain.token';
const SessionContext = createContext<SessionValue | null>(null);

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode - session lasts for this tab only */
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const request = useCallback(
    async (path: string, opts: { method?: string; body?: unknown } = {}, tok: string | null = token) => {
      const res = await fetch(path, {
        method: opts.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({ error: `Unexpected response (${res.status})` }));
      if (res.status === 401 && tok) logout();
      if (!res.ok || data.success === false) {
        throw new ApiError(res.status, data.details ? `${data.error}: ${data.details}` : data.error ?? 'Request failed');
      }
      return data;
    },
    [token, logout]
  );

  // Restore a saved session on first load
  useEffect(() => {
    const saved = readToken();
    if (!saved) {
      setReady(true);
      return;
    }
    request('/api/auth/me', {}, saved)
      .then((data) => {
        setToken(saved);
        setUser(data.user);
      })
      .catch(() => writeToken(null))
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await request('/api/auth/login', { method: 'POST', body: { email, password } }, null);
      writeToken(data.token);
      setToken(data.token);
      setUser(data.user);
    },
    [request]
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      ready,
      login,
      logout,
      api: (path, opts) => request(path, opts),
      version,
      refresh: () => setVersion((v) => v + 1),
    }),
    [user, ready, login, logout, request, version]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

/**
 * Fetch JSON from an API route; refetches when `path` changes or after any
 * mutation calls refresh(). Pass null to skip fetching.
 */
export function useApi<T = any>(path: string | null) {
  const { api, version } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version]);

  return { data, error, loading };
}
