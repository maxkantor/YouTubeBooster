import React, { type ReactNode, useCallback, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BRAND, BRAND_DEFAULT_TITLE } from './config/brand';
import { analytics } from './lib/analytics';
import { adminApi, authApi, billingApi, meApi, premiumApi, publicApi, userApi } from './lib/api';
import { DEFAULT_DEMO_CHANNEL, getDisplayHandle, getStoredDemoChannel, normalizeChannelForComparison } from './lib/demo';
import { SeoHead } from './SeoHead';
import { AuthProvider } from './AuthContext';
import { ForgotPasswordPage, SignInPage, SignUpPage } from './AuthPages';
import { useAuth } from './AuthContext';
import type {
  AdminSessionStatus,
  DashboardOverview,
  DemoPreview,
  MagicLinkLoginResponse,
  UserOnboardingState,
  UserSessionStatus
} from './types';

const LandingPage = React.lazy(() => import('./LandingPage').then((m) => ({ default: m.LandingPage })));
const PlatformPage = React.lazy(() => import('./PlatformPage').then((m) => ({ default: m.PlatformPage })));
const UnifiedDashboard = React.lazy(() => import('./UnifiedDashboard').then((m) => ({ default: m.UnifiedDashboard })));
const AdminCrmApp = React.lazy(() => import('./admin/AdminCrmApp'));

/** Demo dashboard at /demo — full demo (default channel) vs preview (user channel with blur). */
function DemoDashboardView() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const channelFromState = (location.state as { channelInput?: string } | null)?.channelInput;
  const channelFromQuery = searchParams.get('channel');
  const channelFromStorage = getStoredDemoChannel();
  const channelInput = channelFromState ?? channelFromQuery ?? channelFromStorage ?? DEFAULT_DEMO_CHANNEL;
  const inputNormalized = normalizeChannelForComparison(channelInput);
  const defaultNormalized = normalizeChannelForComparison(DEFAULT_DEMO_CHANNEL);
  const inputHandle = normalizeChannelForComparison(getDisplayHandle(channelInput));
  const defaultHandle = normalizeChannelForComparison(getDisplayHandle(DEFAULT_DEMO_CHANNEL));
  const isFullDemo =
    inputNormalized === defaultNormalized ||
    inputHandle === defaultHandle ||
    inputHandle === '@maxkantorusa';

  const [apiDemoData, setApiDemoData] = useState<DemoPreview | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    analytics.demoDashboardViewed();
  }, []);

  useEffect(() => {
    const raw = (channelInput || '').trim();
    if (!raw) {
      setApiDemoData(null);
      setDemoError(null);
      return;
    }
    let cancelled = false;
    setDemoLoading(true);
    setDemoError(null);
    publicApi
      .runDemo(raw)
      .then((data: DemoPreview) => {
        if (!cancelled) {
          setApiDemoData(data);
          setDemoError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setApiDemoData(null);
          setDemoError(err instanceof Error ? err.message : 'Could not load channel preview.');
        }
      })
      .finally(() => {
        if (!cancelled) setDemoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelInput]);

  return (
    <UnifiedDashboard
      isDemo
      isFullDemo={isFullDemo}
      demoData={apiDemoData}
      dashboardOverview={null}
      channelInput={channelInput}
      demoLoading={demoLoading}
      demoError={demoError}
      onCreateCheckout={async (ch, _email) => {
        const channel = ch || channelInput;
        if (!authSession) {
          navigate(`/auth/signup?returnTo=${encodeURIComponent(`/demo?channel=${encodeURIComponent(channel)}`)}&channel=${encodeURIComponent(channel)}&plan=premium`);
          return { checkoutUrl: '/auth/signup', sessionId: 'auth_required', amount: 0, currency: 'USD' };
        }
        return billingApi.createCheckoutSession(authSession.idToken, channel, 'premium');
      }}
    />
  );
}

/** Redirect from /app to /dashboard or /app/onboarding based on onboarding state. */
function AppEntryRedirect({ userSession }: { userSession: UserSessionStatus }) {
  const completed = userSession.user?.onboardingCompleted ?? false;
  return <Navigate to={completed ? '/dashboard' : '/app/onboarding'} replace />;
}

function LoadingSurface({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

function UserRoute({
  userSession,
  loading,
  allowIncompleteOnboarding,
  children
}: {
  userSession: UserSessionStatus;
  loading: boolean;
  allowIncompleteOnboarding?: boolean;
  children: ReactNode;
}) {
  const location = useLocation();
  if (loading) {
    return <LoadingSurface title="Checking purchased access" detail="Restoring your session and purchase state." />;
  }

  if (!userSession.authenticated || !userSession.user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  if (!allowIncompleteOnboarding && !userSession.user.onboardingCompleted) {
    return <Navigate to="/app/onboarding" replace />;
  }

  if (allowIncompleteOnboarding && userSession.user.onboardingCompleted) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AdminRoute({
  adminSession,
  loading,
  children
}: {
  adminSession: AdminSessionStatus;
  loading: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return <LoadingSurface title="Checking admin session" detail="Loading protected CRM access." />;
  }

  if (!adminSession.authenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

function CheckoutSuccessPage({
  userSession,
  sessionLoading,
  refreshUserSession
}: {
  userSession: UserSessionStatus;
  sessionLoading: boolean;
  refreshUserSession: () => Promise<UserSessionStatus>;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session: authSession } = useAuth();
  const [status, setStatus] = useState<'idle' | 'checking' | 'active' | 'error'>('idle');
  const [error, setError] = useState('');
  const sessionId = searchParams.get('session_id');
  const checkoutReturnPath = sessionId
    ? searchParams.toString()
      ? `/checkout/success?${searchParams.toString()}`
      : '/checkout/success'
    : '/dashboard';

  // When session_id is missing, stop the "confirming access" loop.
  // If backend cookie session isn't ready, exchange Cognito JWT -> backend cookie first.
  useEffect(() => {
    if (!authSession) return;
    if (sessionId) return;

    let cancelled = false;
    (async () => {
      try {
        if (!userSession.authenticated) {
          await authApi.cognitoLogin(authSession.idToken);
          await refreshUserSession();
        }
      } catch {
        // ignore; we'll route to sign-in below
      }

      if (cancelled) return;
      // Re-read after refresh.
      const ok = !cancelled && (await refreshUserSession()).authenticated;
      if (ok) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate(`/auth/signin?returnTo=${encodeURIComponent('/dashboard')}`, { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authSession, sessionId, navigate, refreshUserSession, userSession.authenticated]);

  useEffect(() => {
    if (!authSession) return;
    if (!sessionId) return; // avoid polling while we are redirecting away
    const token = authSession.idToken;
    let cancelled = false;
    async function poll() {
      setStatus('checking');
      setError('');
      const start = Date.now();
      while (!cancelled && Date.now() - start < 30_000) {
        try {
          const data = await meApi.getAccessStatus(token);
          if (data.premium) {
            analytics.purchaseCompleted();
            setStatus('active');
            navigate('/dashboard', { replace: true });
            return;
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not confirm access.');
          setStatus('error');
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (!cancelled) {
        setError('Still confirming your access. Refresh in a moment.');
        setStatus('error');
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [authSession, navigate]);

  return (
    authSession ? <Navigate to="/dashboard" replace /> : (
    <div className="page narrow-page">
      <div className="surface">
        <div className="locked-label">Checkout</div>
        <h1>Confirming your access…</h1>
        <p className="muted">
          Your purchase unlocks the account you’re signed into. This page will update as soon as Stripe confirms payment.
        </p>
        {!authSession ? (
          <div className="status-card" style={{ marginTop: 16 }}>
            <strong>Sign in to finish</strong>
            <p className="muted" style={{ marginTop: 8 }}>
              You must be signed in to attach this purchase to your account.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <Link
                className="btn btn-primary"
                to={`/auth/signin?returnTo=${encodeURIComponent(checkoutReturnPath)}`}
              >
                Sign in
              </Link>
              <Link
                className="btn btn-secondary"
                to={`/auth/signup?returnTo=${encodeURIComponent(checkoutReturnPath)}`}
              >
                Create account
              </Link>
            </div>
          </div>
        ) : (
          <div className="status-card" style={{ marginTop: 16 }}>
            <strong>{status === 'active' ? 'Full access active' : status === 'checking' ? 'Checking Stripe confirmation…' : 'Waiting for confirmation'}</strong>
            <p className="muted" style={{ marginTop: 8 }}>
              Session: {sessionId ?? '—'}
            </p>
            {!sessionId && (
              <p style={{ marginTop: 10 }}>
                <span className="muted">
                  No `session_id` was provided in the URL. If payment completed, access should still activate automatically.
                </span>
              </p>
            )}
          </div>
        )}
        {error && <p className="error-text" style={{ marginTop: 14 }}>{error}</p>}
      </div>
    </div>
    )
  );
}

function DashboardPage({
  userSession,
  refreshUserSession
}: {
  userSession: UserSessionStatus;
  refreshUserSession: () => Promise<UserSessionStatus>;
}) {
  const navigate = useNavigate();
  const { session: authSession, signOut: authSignOut } = useAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      try {
        const data = authSession
          ? await premiumApi.loadDashboardOverview(authSession.idToken)
          : await userApi.loadDashboardOverview();
        if (!cancelled) {
          setOverview(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load dashboard.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await authSignOut();
    // Hard navigation so stale route state/cookies can't cause protected pages to render.
    window.location.href = '/demo';
  }

  if (error) {
    return (
      <div className="page">
        <p className="error-text">{error}</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSurface title="Loading your dashboard" detail="Pulling your purchased account data." />;
  }

  const channelTitle = overview?.channelTitle ?? 'Your Channel';

  return (
    <UnifiedDashboard
      isDemo={false}
      demoData={null}
      dashboardOverview={overview ?? null}
      channelInput={userSession.user?.channelUrl ?? overview?.channelTitle ?? ''}
      userEmail={userSession.user?.email}
      onCreateCheckout={async (ch, _email) => {
        const channel = ch || userSession.user?.channelUrl || channelTitle;
        if (!authSession) {
          navigate(`/auth/signup?returnTo=${encodeURIComponent('/dashboard')}&channel=${encodeURIComponent(channel)}&plan=premium`);
          return { checkoutUrl: '/auth/signup', sessionId: 'auth_required', amount: 0, currency: 'USD' };
        }
        return billingApi.createCheckoutSession(authSession.idToken, channel, 'premium');
      }}
      onSignOut={handleSignOut}
    />
  );
}

function OnboardingPage({
  refreshUserSession
}: {
  refreshUserSession: () => Promise<UserSessionStatus>;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<UserOnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [growthGoal, setGrowthGoal] = useState('');
  const [credentialsJson, setCredentialsJson] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [projectId, setProjectId] = useState('');
  const [authUri, setAuthUri] = useState('');
  const [tokenUri, setTokenUri] = useState('');
  const [redirectUri, setRedirectUri] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOnboarding() {
      try {
        const onboarding = await userApi.loadOnboarding();
        if (!cancelled) {
          setState(onboarding);
          setChannelUrl(onboarding.channelUrl || '');
          setGrowthGoal(onboarding.growthGoal || '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load onboarding.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOnboarding();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProgress(): Promise<boolean> {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const onboarding = await userApi.saveOnboarding(channelUrl, growthGoal);
      setState(onboarding);

      const hasGoogleInput = [
        credentialsJson,
        clientId,
        clientSecret,
        projectId,
        authUri,
        tokenUri,
        redirectUri
      ].some((value) => value.trim().length > 0);

      if (hasGoogleInput) {
        const settings = await userApi.saveYouTubeSettings({
          channelUrl,
          credentialsJson,
          clientId,
          clientSecret,
          projectId,
          authUri,
          tokenUri,
          redirectUri
        });

        setState((previous) => previous ? { ...previous, youTubeSettings: settings } : previous);
      }

      setMessage('Your onboarding progress has been saved.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save onboarding.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function completeSetup() {
    const saved = await saveProgress();
    if (!saved) {
      return;
    }

    setSaving(true);
    try {
      await userApi.completeOnboarding();
      const session = await refreshUserSession();
      if (session.authenticated) {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete onboarding.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>Post-purchase setup wizard</h1>
        <p>Configure the channel and buyer-owned Google settings tied to your purchased access.</p>
        {loading && <p>Loading your onboarding state...</p>}
        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}
        {state && (
          <>
            <div className="pill-row">
              <span className="info-pill">Purchase email: {state.email}</span>
              <span className="info-pill">Status: {state.onboardingCompleted ? 'Complete' : 'In progress'}</span>
              {state.youTubeSettings && (
                <span className="info-pill">
                  Google settings saved: {state.youTubeSettings.hasCredentialsJson || state.youTubeSettings.hasClientId ? 'Yes' : 'No'}
                </span>
              )}
            </div>
            <div className="input-stack">
              <label className="field-label">
                Primary channel URL or handle
                <input value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="https://www.youtube.com/@yourchannel" />
              </label>
              <label className="field-label">
                Growth goal
                <input value={growthGoal} onChange={(e) => setGrowthGoal(e.target.value)} placeholder="Increase CTR and publish with more consistency" />
              </label>
            </div>
            <div className="surface nested-surface">
              <h2>Your Google/YouTube settings</h2>
              <p>
                These settings are stored per user and encrypted before persistence. You can paste a full credentials JSON payload or enter the granular fields manually.
              </p>
              <div className="input-stack">
                <label className="field-label">
                  Full credentials JSON
                  <textarea value={credentialsJson} onChange={(e) => setCredentialsJson(e.target.value)} placeholder='{"web": {"client_id": "...", "client_secret": "..."}}' rows={6} />
                </label>
                <label className="field-label">
                  Client ID
                  <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Google OAuth client id" />
                </label>
                <label className="field-label">
                  Client secret
                  <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Google OAuth client secret" />
                </label>
                <label className="field-label">
                  Project ID
                  <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Optional project id" />
                </label>
                <label className="field-label">
                  Auth URI
                  <input value={authUri} onChange={(e) => setAuthUri(e.target.value)} placeholder="https://accounts.google.com/o/oauth2/auth" />
                </label>
                <label className="field-label">
                  Token URI
                  <input value={tokenUri} onChange={(e) => setTokenUri(e.target.value)} placeholder="https://oauth2.googleapis.com/token" />
                </label>
                <label className="field-label">
                  Redirect URI
                  <input value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)} placeholder="https://your-domain.com/oauth2/callback" />
                </label>
              </div>
            </div>
            <div className="hero-actions">
              <button className="btn btn-secondary" onClick={saveProgress} disabled={saving}>
                {saving ? 'Saving...' : 'Save Progress'}
              </button>
              <button className="btn btn-primary" onClick={completeSetup} disabled={saving}>
                {saving ? 'Completing...' : 'Complete Setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AdminLoginPage({
  adminSession,
  sessionLoading,
  refreshAdminSession
}: {
  adminSession: AdminSessionStatus;
  sessionLoading: boolean;
  refreshAdminSession: () => Promise<AdminSessionStatus>;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionLoading && adminSession.authenticated) {
      navigate('/admin', { replace: true });
    }
  }, [adminSession.authenticated, navigate, sessionLoading]);

  async function handleLogin() {
    if (!email || !password) {
      setError('Enter the admin email and password.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await adminApi.login(email, password);
      await refreshAdminSession();
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>Admin CRM Login</h1>
        <p>Protected admin access backed by credentials stored in AWS SSM Parameter Store.</p>
        <div className="input-stack">
          <input placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Password or one-time admin secret" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary" onClick={handleLogin} disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

function AppInner() {
  const [userSession, setUserSession] = useState<UserSessionStatus>({ authenticated: false, user: null });
  const [adminSession, setAdminSession] = useState<AdminSessionStatus>({ authenticated: false, email: null });
  const [sessionLoading, setSessionLoading] = useState(true);
  const { session: authSession, signOut: authSignOut, refresh: refreshAuth } = useAuth();

  const refreshUserSession = useCallback(async () => {
    try {
      const session = await authApi.getSession();
      setUserSession(session);
      return session;
    } catch {
      const fallback = { authenticated: false, user: null };
      setUserSession(fallback);
      return fallback;
    }
  }, []);

  const refreshAdminSession = useCallback(async () => {
    try {
      const session = await adminApi.getSession();
      setAdminSession(session);
      return session;
    } catch {
      const fallback = { authenticated: false, email: null };
      setAdminSession(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreSessions() {
      try {
        const [user, admin] = await Promise.all([authApi.getSession(), adminApi.getSession()]);
        if (!cancelled) {
          setUserSession(user);
          setAdminSession(admin);
        }
      } catch {
        if (!cancelled) {
          setUserSession({ authenticated: false, user: null });
          setAdminSession({ authenticated: false, email: null });
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    restoreSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  // If Cognito is authenticated but our backend cookie session isn't established yet
  // (can happen after deploys/reloads), exchange Cognito JWT -> backend cookie.
  useEffect(() => {
    if (sessionLoading) return;
    if (!authSession?.idToken) return;
    if (userSession.authenticated) return;
    void (async () => {
      try {
        await authApi.cognitoLogin(authSession.idToken);
        await refreshUserSession();
      } catch {
        // ignore; if cookie exchange fails, user will remain unauthenticated server-side.
      } finally {
        try {
          await refreshAuth();
        } catch {
          // ignore
        }
      }
    })();
  }, [authSession?.idToken, refreshAuth, refreshUserSession, sessionLoading, userSession.authenticated]);

  const location = useLocation();
  const pathAdmin = location.pathname.startsWith('/admin');
  const showGlobalNav =
    !pathAdmin && location.pathname !== '/' && location.pathname !== '/platform';
  let globalReturnTo = `${location.pathname}${location.search}`;
  // Avoid returning to checkout success without a session_id (common "wrong screen" loop).
  try {
    const u = new URL(globalReturnTo, window.location.origin);
    if (u.pathname === '/checkout/success' && !u.searchParams.get('session_id')) {
      globalReturnTo = '/dashboard';
    }
  } catch {
    // ignore
  }

  const path = location.pathname;
  const [navScrolled, setNavScrolled] = useState(false);
  const navScrolledRef = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      const v = window.scrollY > 20;
      if (v !== navScrolledRef.current) {
        navScrolledRef.current = v;
        setNavScrolled(v);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleGlobalSignOut() {
    // Best-effort logout for both the frontend session cookie and Cognito.
    await authSignOut();
    // Hard navigation so AuthProvider re-fetches backend cookie session state.
    window.location.reload();
  }

  const seo = path === '/' ? { title: BRAND_DEFAULT_TITLE, canonical: '/' }
    : path === '/demo' ? { title: `Demo – ${BRAND.name}`, canonical: '/demo' }
    : path === '/dashboard' ? { title: `Dashboard – ${BRAND.name}`, canonical: '/dashboard' }
    : path === '/platform' ? { title: `MK Platform – ${BRAND.name}`, canonical: '/platform' }
    : path.startsWith('/admin') ? { title: 'Admin', noindex: true as const }
    : {};

  return (
    <>
      <SeoHead
        title={'title' in seo ? seo.title : undefined}
        canonical={'canonical' in seo ? seo.canonical : undefined}
        noindex={'noindex' in seo ? seo.noindex : undefined}
      />
      {showGlobalNav && (
        <nav className={`top-nav landing-top-nav ${navScrolled ? 'top-nav-scrolled' : ''}`}>
          <div className="container nav-shell">
            <Link
              to="/"
              className="brand brand-link brand-with-play"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label={`${BRAND.name} home`}
            >
              <span className="brand-play-icon" aria-hidden />
              <span className="brand-word brand-word-1">{BRAND.namePart1}</span>
              <span className="brand-word brand-word-2">{BRAND.namePart2}</span>
            </Link>
            <div className="nav-links nav-links-center" aria-label="Primary">
              <a href="/#product">Product</a>
              <a href="/#example-audit">Example Audit</a>
              <a href="/#pricing">Pricing</a>
              <a href="/#faq">FAQ</a>
            </div>
            <button
              className="btn btn-primary nav-cta"
              onClick={() => {
                window.location.href = '/#audit';
              }}
            >
              Analyze Your Channel
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {userSession.authenticated && userSession.user ? (
                <>
                  <span style={{ color: 'rgba(226,232,240,0.95)', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {userSession.user.email ?? 'Account'}
                  </span>
                  <button type="button" className="btn btn-secondary" onClick={handleGlobalSignOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to={`/auth/signin?returnTo=${encodeURIComponent(globalReturnTo)}`}
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none' }}
                  >
                    Sign in
                  </Link>
                  <Link
                    to={`/auth/signup?returnTo=${encodeURIComponent(globalReturnTo)}`}
                    className="btn btn-primary"
                    style={{ textDecoration: 'none' }}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>
      )}
      <Suspense fallback={
        <div className="page narrow-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <p style={{ opacity: 0.8 }}>Loading…</p>
        </div>
      }>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/platform" element={<PlatformPage />} />
        <Route path="/demo" element={<DemoDashboardView />} />
        <Route path="/auth/signin" element={<SignInPage />} />
        <Route path="/auth/signup" element={<SignUpPage />} />
        <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
        <Route
          path="/dashboard"
          element={
            <UserRoute userSession={userSession} loading={sessionLoading}>
              <DashboardPage userSession={userSession} refreshUserSession={refreshUserSession} />
            </UserRoute>
          }
        />
        <Route
          path="/checkout/success"
          element={
            <CheckoutSuccessPage
              userSession={userSession}
              sessionLoading={sessionLoading}
              refreshUserSession={refreshUserSession}
            />
          }
        />
        <Route
          path="/app"
          element={
            <UserRoute userSession={userSession} loading={sessionLoading} allowIncompleteOnboarding>
              <AppEntryRedirect userSession={userSession} />
            </UserRoute>
          }
        />
        <Route
          path="/app/onboarding"
          element={
            <UserRoute userSession={userSession} loading={sessionLoading} allowIncompleteOnboarding>
              <OnboardingPage refreshUserSession={refreshUserSession} />
            </UserRoute>
          }
        />
        <Route
          path="/admin/login"
          element={
            <AdminLoginPage
              adminSession={adminSession}
              sessionLoading={sessionLoading}
              refreshAdminSession={refreshAdminSession}
            />
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminRoute adminSession={adminSession} loading={sessionLoading}>
              <React.Suspense fallback={<LoadingSurface title="Loading admin" detail="Opening CRM…" />}>
                <AdminCrmApp adminSession={adminSession} refreshAdminSession={refreshAdminSession} />
              </React.Suspense>
            </AdminRoute>
          }
        />
      </Routes>
      </Suspense>
      {showGlobalNav && (
        <footer className="global-footer">
          <div className="global-footer-content">
            <p className="global-footer-line">Engineered by MK AI &amp; Performance Systems</p>
            <p className="global-footer-line">
              <Link to="/platform">Platform</Link>
            </p>
            <p className="global-footer-copy">© 2026 YouTube Booster. All rights reserved.</p>
          </div>
        </footer>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
