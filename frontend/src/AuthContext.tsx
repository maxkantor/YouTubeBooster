import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthSession } from './lib/auth';
import { getSession as cognitoGetSession, signOut as cognitoSignOut } from './lib/auth';
import { authApi } from './lib/api';

type AuthState = {
  loading: boolean;
  session: AuthSession | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await cognitoGetSession();
      setSession(s);
    } catch (e) {
      // If Cognito isn't configured (or the config endpoint fails), treat as logged out.
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Best-effort logout for both Cognito tokens and backend cookie.
    // Must be awaitable because callers hard-reload immediately after.
    try {
      await authApi.logout();
    } catch {
      // ignore; backend cookie might already be gone
    }

    cognitoSignOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(() => ({ loading, session, refresh, signOut }), [loading, session, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

