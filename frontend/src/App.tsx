import React, { type ReactNode, useCallback, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BRAND } from './config/brand';
import { usePageTracking } from './hooks/usePageTracking';
import { analytics } from './lib/analytics';
import { adminApi, authApi, billingApi, meApi, premiumApi, userApi } from './lib/api';
import { StructuredData } from './components/StructuredData';
import { SeoHead } from './SeoHead';
import { FOOTER_COMPARE_PAGES, FOOTER_GROWTH_PAGES } from './seo/growthGuides';
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
import { AdminSessionProvider } from './admin/AdminSessionContext';
import { AdminCrmGate } from './admin/AdminCrmGate';
import {
  AdminHomePage,
  UsersPage,
  UserDetailPage,
  OrdersPage,
  AuditsPage,
  ContactTicketPage,
  ContactListPage,
  ActivityLogsPage
} from './admin/crmPages.lazy';

/**
 * Scroll to top on route changes or handle anchor-based scrolling
 */
function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    // Handle anchor links (e.g., #product, #pricing, #faq)
    const hash = location.hash;
    if (hash) {
      // Remove the '#' and get the element
      const elementId = hash.substring(1);
      const element = document.getElementById(elementId);
      if (element) {
        // Wait for next frame to ensure DOM is ready
        requestAnimationFrame(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    } else {
      // No hash: scroll to top for route changes
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location]);

  return null;
}

function AdminContactToSupportTicketRedirect() {
  const { ticketId } = useParams<{ ticketId: string }>();
  return <Navigate to={`/admin/contacts/${encodeURIComponent(ticketId ?? '')}`} replace />;
}

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
const AboutPage = React.lazy(() => import('./pages/marketing/MarketingPages').then((m) => ({ default: m.AboutPage })));
const ContactPage = React.lazy(() => import('./pages/marketing/MarketingPages').then((m) => ({ default: m.ContactPage })));
const PrivacyPage = React.lazy(() => import('./pages/marketing/MarketingPages').then((m) => ({ default: m.PrivacyPage })));
const DisclaimerPage = React.lazy(() => import('./pages/marketing/MarketingPages').then((m) => ({ default: m.DisclaimerPage })));
const GrowthGuideRoutePage = React.lazy(() =>
  import('./pages/marketing/GrowthGuidePages').then((m) => ({ default: m.GrowthGuideRoutePage }))
);

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
      try {
        if (!userSession.authenticated) {
          await authApi.cognitoLogin(token);
          await refreshUserSession();
        }
      } catch {
        // ignore; polling below will surface a concrete API error if one exists
      }

      setStatus('checking');
      setError('');
      const start = Date.now();
      let reconcileAttempted = false;
      while (!cancelled && Date.now() - start < 30_000) {
        try {
          if (!reconcileAttempted && sessionId) {
            reconcileAttempted = true;
            await billingApi.reconcileCheckoutSession(token, sessionId);
          }

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
        setError(sessionId
          ? 'Payment is not confirmed as paid yet. If your card was declined, no access was unlocked.'
          : 'Still confirming your access. Refresh in a moment.');
        setStatus('error');
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [authSession, navigate, refreshUserSession, sessionId, userSession.authenticated]);

  return (
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
  const [signingOut, setSigningOut] = useState(false);

  // Do not auto-redirect to /admin — users opening /admin/login directly were confused when sent away
  // while still holding a valid admin cookie. Offer explicit Continue / Sign out instead.

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
        {sessionLoading ? (
          <p className="admin-login-lead">Checking admin session…</p>
        ) : adminSession.authenticated ? (
          <div className="admin-login-signed-in">
            <p className="success-text" style={{ margin: '0 0 16px' }}>
              You already have an admin session as <strong>{adminSession.email ?? 'admin'}</strong>.
            </p>
            <div className="admin-login-signed-in-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/admin')}>
                Continue to CRM
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  setError('');
                  try {
                    await adminApi.logout();
                    await refreshAdminSession();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Sign out failed.');
                  } finally {
                    setSigningOut(false);
                  }
                }}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
            <p className="admin-login-lead" style={{ marginTop: 20, marginBottom: 0 }}>
              If you were sent here when trying to open <code className="admin-login-code">/admin/login</code>, it was because a previous admin
              cookie is still valid. Use <strong>Sign out</strong> to sign in with different credentials.
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}

function AppInner() {
  usePageTracking();

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
      // Ensure parent re-renders with new admin cookie before navigate('/admin') runs (otherwise AdminRoute still sees authenticated:false → blank or bounce).
      flushSync(() => {
        setAdminSession(session);
      });
      return session;
    } catch {
      const fallback = { authenticated: false, email: null };
      flushSync(() => {
        setAdminSession(fallback);
      });
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

  // Magic link verification (token query param)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        await authApi.verifyMagicLink(token);
        await refreshUserSession();
      } catch (err) {
        console.warn('Magic link verification failed:', err);
      } finally {
        if (!cancelled) {
          window.location.replace('/');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshUserSession]);

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
      window.sessionStorage.setItem('yb_post_logout_redirect', '/');
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
    // Never default to noindex on resolver errors — that can de-index the whole app in Search Console.
    seoResolved = {
      title: BRAND.name,
      description: BRAND.tagline,
      canonicalPath: pathForSeo,
      noindex: false,
      jsonLd: [] as Record<string, unknown>[]
    };
  }

  return (
    <AdminSessionProvider value={{ adminSession, refreshAdminSession, sessionLoading }}>
    <>
      <SeoHead
        title={seoResolved.title}
        description={seoResolved.description}
        canonicalPath={seoResolved.canonicalPath}
        ogTitle={seoResolved.ogTitle}
        ogDescription={seoResolved.ogDescription}
        noindex={seoResolved.noindex === true}
        keywords={seoResolved.keywords}
        ogType={seoResolved.ogType ?? 'website'}
        articlePublishedTime={seoResolved.articlePublishedTime}
        articleModifiedTime={seoResolved.articleModifiedTime}
      />
      <StructuredData graph={seoResolved.jsonLd ?? []} />
      {showGlobalNav && (
        <>
          <header className={`landing-header ${navScrolled ? 'landing-header-scrolled' : ''}`}>
            <div className="container landing-header-inner nav-shell">
              <Link
                to="/"
                className="landing-logo landing-logo-premium brand-link brand-with-play"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label={`${BRAND.name} home`}
              >
                <span className="brand-play-icon" aria-hidden />
                <span className="landing-logo-yt">{BRAND.namePart1}</span>
                <span className="landing-logo-boost">{BRAND.namePart2}</span>
              </Link>
              <nav className="landing-nav landing-nav-center" aria-label="Primary">
                <Link to="/#product" className="landing-nav-link">Product</Link>
                <Link to="/#ai-tools" className="landing-nav-link landing-nav-link-subtle">AI Studio</Link>
                <Link to="/#pricing" className="landing-nav-link">Pricing</Link>
                <Link to="/#faq" className="landing-nav-link">FAQ</Link>
                <Link to="/contact" className="landing-nav-link">Contact</Link>
              </nav>
              <div className="landing-nav-actions">
                {userSession.authenticated && userSession.user ? (
                  <>
                    <span className="landing-nav-user">{userSession.user.email ?? 'Account'}</span>
                    <button type="button" className="landing-nav-link landing-nav-signout" onClick={handleGlobalSignOut}>
                      Sign out
                    </button>
                    <a
                      href="https://youtubeboosterai.com/#audit"
                      className="landing-nav-link landing-nav-cta landing-nav-cta-primary"
                      title="Analyze Channel"
                    >
                      Analyze Channel
                    </a>
                  </>
                ) : (
                  <>
                    <Link
                      to={`/auth/signin?returnTo=${encodeURIComponent(globalReturnTo)}`}
                      className="landing-nav-link landing-nav-auth"
                    >
                      Sign In
                    </Link>
                    <Link
                      to={`/auth/signup?returnTo=${encodeURIComponent(globalReturnTo)}`}
                      className="landing-nav-link landing-nav-auth landing-nav-auth-strong"
                    >
                      Sign Up
                    </Link>
                    <a
                      href="https://youtubeboosterai.com/#audit"
                      className="landing-nav-link landing-nav-cta landing-nav-cta-primary"
                      title="Analyze Channel"
                    >
                      Analyze Channel
                    </a>
                  </>
                )}
              </div>
            </div>
          </header>
          <div className="landing-header-rule" aria-hidden />
        </>
      )}
      <Suspense fallback={
        <div className="page narrow-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <p style={{ opacity: 0.8 }}>Loading…</p>
        </div>
      }>
      <ScrollToTop />
      <Routes>
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
        <Route path="/admin/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminCrmGate />}>
          <Route index element={<AdminHomePage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="user/:id" element={<UserDetailPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="payments" element={<Navigate to="/admin/orders" replace />} />
          <Route path="audits" element={<AuditsPage />} />
        <Route path="contacts/:ticketId" element={<ContactTicketPage />} />
          <Route path="support/:ticketId" element={<ContactTicketPage />} />
        <Route path="contacts" element={<ContactListPage />} />
          <Route path="support" element={<ContactListPage />} />
        <Route path="contact" element={<Navigate to="/admin/contacts" replace />} />
          <Route path="contact/:ticketId" element={<AdminContactToSupportTicketRedirect />} />
          <Route path="activity" element={<ActivityLogsPage />} />
          <Route path="system-logs" element={<Navigate to="/admin/activity" replace />} />
        </Route>
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/index" element={<Navigate to="/" replace />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/why-your-youtube-has-no-views" element={<Navigate to="/why-your-youtube-channel-gets-no-views" replace />} />
        <Route path="/why-your-youtube-channel-gets-no-views" element={<GrowthGuideRoutePage />} />
        <Route path="/how-to-get-more-youtube-views" element={<GrowthGuideRoutePage />} />
        <Route path="/youtube-thumbnail-mistakes" element={<GrowthGuideRoutePage />} />
        <Route path="/low-click-through-rate-youtube" element={<GrowthGuideRoutePage />} />
        <Route path="/youtube-seo-for-small-channels" element={<GrowthGuideRoutePage />} />
        <Route path="/youtube-title-generator" element={<GrowthGuideRoutePage />} />
        <Route path="/how-to-increase-youtube-watch-time" element={<GrowthGuideRoutePage />} />
        <Route path="/youtube-retention-analysis" element={<GrowthGuideRoutePage />} />
        <Route path="/youtube-thumbnail-ctr" element={<GrowthGuideRoutePage />} />
        <Route path="/free-youtube-channel-audit" element={<GrowthGuideRoutePage />} />
        <Route path="/vidiq-alternative" element={<GrowthGuideRoutePage />} />
        <Route path="/tubebuddy-alternative" element={<GrowthGuideRoutePage />} />
        <Route path="/best-youtube-audit-tool" element={<GrowthGuideRoutePage />} />
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
      {showGlobalNav && (
        <footer className="landing-site-footer">
          <div className="landing-site-footer-divider" aria-hidden />
          <div className="container landing-site-footer-inner">
            <div className="landing-site-footer-brand">
              <Link
                to="/"
                className="landing-site-footer-logo brand-link brand-with-play"
                aria-label={`${BRAND.name} home`}
              >
                <span className="brand-play-icon" aria-hidden />
                <span className="landing-logo-yt">{BRAND.namePart1}</span>
                <span className="landing-logo-boost">{BRAND.namePart2}</span>
              </Link>
              <p className="landing-site-footer-tagline">
                AI YouTube channel audit and growth analysis for small creators who want clearer fixes and better decisions.
              </p>
            </div>
            <nav className="landing-site-footer-nav" aria-label="Footer">
              <div className="landing-site-footer-col">
                <h3 className="landing-site-footer-col-title">Company</h3>
                <ul className="landing-site-footer-links">
                  <li><Link to="/about">About Us</Link></li>
                  <li><Link to="/contact">Contact</Link></li>
                  <li><Link to="/platform">Platform</Link></li>
                </ul>
              </div>
              <div className="landing-site-footer-col">
                <h3 className="landing-site-footer-col-title">Growth</h3>
                <ul className="landing-site-footer-links">
                  {FOOTER_GROWTH_PAGES.map((g) => (
                    <li key={g.path}>
                      <Link to={g.path}>{g.cardTitle}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="landing-site-footer-col">
                <h3 className="landing-site-footer-col-title">Compare</h3>
                <ul className="landing-site-footer-links">
                  {FOOTER_COMPARE_PAGES.map((g) => (
                    <li key={g.path}>
                      <Link to={g.path}>{g.cardTitle}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="landing-site-footer-col">
                <h3 className="landing-site-footer-col-title">Legal</h3>
                <ul className="landing-site-footer-links">
                  <li><Link to="/privacy">Privacy Policy</Link></li>
                  <li><Link to="/disclaimer">Disclaimer</Link></li>
                </ul>
              </div>
            </nav>
          </div>
          <div className="landing-site-footer-bottom">
            <p className="landing-site-footer-copy">© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          </div>
        </footer>
      )}
    </>
    </AdminSessionProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
