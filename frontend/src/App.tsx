import React, { type ReactNode, useCallback, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BRAND } from './config/brand';
import { analytics } from './lib/analytics';
import { adminApi, authApi, billingApi, meApi, premiumApi, userApi } from './lib/api';
import { StructuredData } from './components/StructuredData';
import { SeoHead } from './SeoHead';
import { resolveSeoForPath } from './seo/resolveSeo';
import { AuthProvider } from './AuthContext';
import { ForgotPasswordPage, SignInPage, SignUpPage } from './AuthPages';
import { useAuth } from './AuthContext';
import type {
  AdminSessionStatus,
  DashboardOverview,
  MagicLinkLoginResponse,
  UserSessionStatus
} from './types';

const LandingPage = React.lazy(() => import('./LandingPage').then((m) => ({ default: m.LandingPage })));
const PlatformPage = React.lazy(() => import('./PlatformPage').then((m) => ({ default: m.PlatformPage })));
const UnifiedDashboard = React.lazy(() => import('./UnifiedDashboard').then((m) => ({ default: m.UnifiedDashboard })));
const ChannelAnalyzeDashboard = React.lazy(() =>
  import('./ChannelAnalyzeDashboard').then((m) => ({ default: m.ChannelAnalyzeDashboard }))
);
const AdminCrmApp = React.lazy(() => import('./admin/AdminCrmApp'));
const AuditHubPage = React.lazy(() => import('./pages/seo/SeoHubs').then((m) => ({ default: m.AuditHubPage })));
const SolutionsHubPage = React.lazy(() => import('./pages/seo/SeoHubs').then((m) => ({ default: m.SolutionsHubPage })));
const GuidesHubPage = React.lazy(() => import('./pages/seo/SeoHubs').then((m) => ({ default: m.GuidesHubPage })));
const AuditArticleRoute = React.lazy(() =>
  import('./pages/seo/SeoProgrammaticRoutes').then((m) => ({ default: m.AuditArticleRoute }))
);
const SolutionArticleRoute = React.lazy(() =>
  import('./pages/seo/SeoProgrammaticRoutes').then((m) => ({ default: m.SolutionArticleRoute }))
);
const GuideArticleRoute = React.lazy(() =>
  import('./pages/seo/SeoProgrammaticRoutes').then((m) => ({ default: m.GuideArticleRoute }))
);
const BlogIndexPage = React.lazy(() => import('./pages/seo/BlogIndexPage').then((m) => ({ default: m.BlogIndexPage })));
const BlogPostPage = React.lazy(() => import('./pages/seo/BlogPostPage').then((m) => ({ default: m.BlogPostPage })));
const HtmlSitemapPage = React.lazy(() => import('./pages/seo/HtmlSitemapPage').then((m) => ({ default: m.HtmlSitemapPage })));

/** Redirect from /app to the main dashboard (onboarding wizard removed). */
function AppEntryRedirect() {
  return <Navigate to="/dashboard" replace />;
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
  children
}: {
  userSession: UserSessionStatus;
  loading: boolean;
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
    <div
      className="page narrow-page admin-login-page"
      style={{ minHeight: '100vh', color: '#e5e7eb', position: 'relative', zIndex: 2 }}
    >
      <div className="surface">
        <h1>Admin CRM Login</h1>
        <p className="admin-login-lead">
          Sign in with the same <strong>admin email</strong> and <strong>password</strong> the API reads from AWS Systems Manager (e.g.{' '}
          <code className="admin-login-code">…/admin/email</code> and <code className="admin-login-code">…/admin/password</code>). Values are
          not loaded in the browser—enter them here to create an admin session cookie.
        </p>
        <div className="input-stack">
          <label className="field-label">
            <span>Admin email</span>
            <input
              name="admin-email"
              autoComplete="username"
              placeholder="Email stored in SSM (admin/email)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field-label">
            <span>Password</span>
            <input
              name="admin-password"
              autoComplete="current-password"
              placeholder="Password stored in SSM (admin/password)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleLogin} disabled={submitting}>
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

  // Post-auth hard-refresh redirect:
  // After login we hard-refresh to `/` to avoid Amplify deep-route 404s,
  // then redirect client-side once cookie session is restored.
  useEffect(() => {
    if (sessionLoading) return;
    if (!userSession.authenticated) return;
    // Never steal navigation away from admin CRM login (replaceState + popstate can leave RR with no match → blank).
    if (window.location.pathname.startsWith('/admin')) return;
    let to = '';
    try {
      to = window.sessionStorage.getItem('yb_post_auth_redirect') ?? '';
      if (to) window.sessionStorage.removeItem('yb_post_auth_redirect');
    } catch {
      to = '';
    }
    if (to && to !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [sessionLoading, userSession.authenticated]);

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

  // Post-logout hard-refresh redirect
  useEffect(() => {
    if (sessionLoading) return;
    if (userSession.authenticated) return;
    if (window.location.pathname.startsWith('/admin')) return;
    let to = '';
    try {
      to = window.sessionStorage.getItem('yb_post_logout_redirect') ?? '';
      if (to) window.sessionStorage.removeItem('yb_post_logout_redirect');
    } catch {
      to = '';
    }
    if (to) {
      window.history.replaceState(null, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [sessionLoading, userSession.authenticated]);

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
    try {
      window.sessionStorage.setItem('yb_post_logout_redirect', '/demo');
    } catch {
      // ignore
    }
    window.location.replace('/');
  }

  const pathForSeo = (path.replace(/\/$/, '') || '/') as string;
  let seoResolved;
  try {
    seoResolved = resolveSeoForPath(pathForSeo);
  } catch {
    seoResolved = {
      title: BRAND.name,
      description: 'YouTube Booster',
      canonicalPath: pathForSeo,
      noindex: true,
      jsonLd: [] as Record<string, unknown>[]
    };
  }

  /** Render outside lazy-route Suspense so /admin/login never waits on unrelated chunks. */
  const isAdminLoginPath = /^\/admin\/login\/?$/i.test(location.pathname);

  /** Must cover both `/admin` and `/admin/*` — some RR builds do not match bare `/admin` to `path="/admin/*"` only, → no route → black screen. */
  const adminCrmShell = (
    <AdminRoute adminSession={adminSession} loading={sessionLoading}>
      <React.Suspense fallback={<LoadingSurface title="Loading admin" detail="Opening CRM…" />}>
        <AdminCrmApp adminSession={adminSession} refreshAdminSession={refreshAdminSession} />
      </React.Suspense>
    </AdminRoute>
  );

  return (
    <>
      <SeoHead
        title={seoResolved.title}
        description={seoResolved.description}
        canonicalPath={seoResolved.canonicalPath}
        noindex={seoResolved.noindex}
        keywords={seoResolved.keywords}
        ogType={seoResolved.ogType ?? 'website'}
        articlePublishedTime={seoResolved.articlePublishedTime}
        articleModifiedTime={seoResolved.articleModifiedTime}
      />
      <StructuredData graph={seoResolved.jsonLd ?? []} />
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
      {isAdminLoginPath ? (
        <AdminLoginPage
          adminSession={adminSession}
          sessionLoading={sessionLoading}
          refreshAdminSession={refreshAdminSession}
        />
      ) : (
      <Suspense fallback={
        <div className="page narrow-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <p style={{ opacity: 0.8 }}>Loading…</p>
        </div>
      }>
      <Routes>
        <Route path="/admin/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={adminCrmShell} />
        <Route path="/admin/*" element={adminCrmShell} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/platform" element={<PlatformPage />} />
        <Route path="/audit" element={<AuditHubPage />} />
        <Route path="/audit/:slug" element={<AuditArticleRoute />} />
        <Route path="/solutions" element={<SolutionsHubPage />} />
        <Route path="/solutions/:slug" element={<SolutionArticleRoute />} />
        <Route path="/guides" element={<GuidesHubPage />} />
        <Route path="/guides/:slug" element={<GuideArticleRoute />} />
        <Route path="/blog" element={<BlogIndexPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/site-map" element={<HtmlSitemapPage />} />
        <Route path="/demo" element={<ChannelAnalyzeDashboard variant="marketing" />} />
        <Route
          path="/auth/signin"
          element={<SignInPage userSession={userSession} sessionLoading={sessionLoading} />}
        />
        <Route
          path="/auth/signup"
          element={<SignUpPage userSession={userSession} sessionLoading={sessionLoading} />}
        />
        <Route
          path="/auth/forgot"
          element={<ForgotPasswordPage userSession={userSession} sessionLoading={sessionLoading} />}
        />
        <Route
          path="/dashboard"
          element={
            <UserRoute userSession={userSession} loading={sessionLoading}>
              <DashboardPage userSession={userSession} refreshUserSession={refreshUserSession} />
            </UserRoute>
          }
        />
        <Route
          path="/dashboard/channel"
          element={
            <UserRoute userSession={userSession} loading={sessionLoading}>
              <ChannelAnalyzeDashboard variant="paid" />
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
            <UserRoute userSession={userSession} loading={sessionLoading}>
              <AppEntryRedirect />
            </UserRoute>
          }
        />
        <Route
          path="/app/onboarding"
          element={
            <UserRoute userSession={userSession} loading={sessionLoading}>
              <Navigate to="/dashboard" replace />
            </UserRoute>
          }
        />
      </Routes>
      </Suspense>
      )}
      {showGlobalNav && (
        <footer className="global-footer">
          <div className="global-footer-content">
            <p className="global-footer-line">Engineered by MK AI &amp; Performance Systems</p>
            <p className="global-footer-line">
              <Link to="/platform">Platform</Link>
              {' · '}
              <Link to="/blog">Blog</Link>
              {' · '}
              <Link to="/audit">Audits</Link>
              {' · '}
              <Link to="/site-map">Site map</Link>
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
