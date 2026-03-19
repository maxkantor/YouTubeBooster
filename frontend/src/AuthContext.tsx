import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthSession } from './lib/auth';
import { getSession as cognitoGetSession, signOut as cognitoSignOut } from './lib/auth';
import { authApi } from './lib/api';

type AuthState = {
  loading: boolean;
  session: AuthSession | null;
  refresh: () => Promise<void>;
  signOut: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await cognitoGetSession();
      setSession(s);
    } catch (e) {
      // Important: don't blindly overwrite an existing session on transient errors.
      // Cognito config/session checks can fail temporarily (network, config endpoint, etc).
      // Overwriting with `null` makes the UI look like you're logged out on actions like
      // "Analyze Your Channel", even though the backend cookie/token is still valid.
      console.warn('Cognito session refresh failed (keeping existing session if any):', e);
      setSession((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep tokens fresh so authenticated endpoints don't randomly 401.
  // Cognito tokens can expire while the user stays on the site.
  useEffect(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!session?.expiresAtMs) return;

    // Refresh slightly before ID token expiry.
    const msUntilExpiry = session.expiresAtMs - Date.now();
    const refreshLeadMs = 60_000; // 1 minute
    const delay = msUntilExpiry - refreshLeadMs;

    if (delay <= 0) {
      void refresh();
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void refresh();
    }, delay);

    return () => {
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    };
  }, [session?.expiresAtMs, refresh]);

  const signOut = useCallback(() => {
    // Best-effort logout for both Cognito tokens and backend cookie.
    void authApi.logout().catch(() => undefined).finally(() => {
      cognitoSignOut();
      setSession(null);
    });
  }, []);

  const value = useMemo<AuthState>(() => ({ loading, session, refresh, signOut }), [loading, session, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

