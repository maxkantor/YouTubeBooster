import React, { type ReactNode, useCallback, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { analytics } from './lib/analytics';
import { adminApi, authApi, publicApi, userApi } from './lib/api';
import { DEFAULT_DEMO_CHANNEL, getStoredDemoChannel, normalizeChannelForComparison } from './lib/demo';
import { SeoHead } from './SeoHead';
import type {
  AdminSessionStatus,
  AdminSummary,
  DashboardOverview,
  DemoPreview,
  MagicLinkLoginResponse,
  UserOnboardingState,
  UserSessionStatus
} from './types';

const LandingPage = React.lazy(() => import('./LandingPage').then((m) => ({ default: m.LandingPage })));
const PlatformPage = React.lazy(() => import('./PlatformPage').then((m) => ({ default: m.PlatformPage })));
const UnifiedDashboard = React.lazy(() => import('./UnifiedDashboard').then((m) => ({ default: m.UnifiedDashboard })));

/** Demo dashboard at /demo — full demo (default channel) vs preview (user channel with blur). */
function DemoDashboardView() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const channelFromState = (location.state as { channelInput?: string } | null)?.channelInput;
  const channelFromQuery = searchParams.get('channel');
  const channelFromStorage = getStoredDemoChannel();
  const channelInput = channelFromState ?? channelFromQuery ?? channelFromStorage ?? DEFAULT_DEMO_CHANNEL;
  const isFullDemo = normalizeChannelForComparison(channelInput) === normalizeChannelForComparison(DEFAULT_DEMO_CHANNEL);

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
      onCreateCheckout={async (ch, email) => publicApi.createCheckoutSession(ch || channelInput, email)}
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
  if (loading) {
    return <LoadingSurface title="Checking purchased access" detail="Restoring your session and purchase state." />;
  }

  if (!userSession.authenticated || !userSession.user) {
    return <Navigate to="/checkout/success" replace />;
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
    return <Navigate to="/login/admin" replace />;
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
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [magicLink, setMagicLink] = useState<MagicLinkLoginResponse | null>(null);

  useEffect(() => {
    if (!sessionLoading && userSession.authenticated && userSession.user) {
      navigate(userSession.user.onboardingCompleted ? '/dashboard' : '/app/onboarding', { replace: true });
    }
  }, [navigate, sessionLoading, userSession]);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      return;
    }
    const magicToken = token;

    let cancelled = false;
    async function verifyToken() {
      setSubmitting(true);
      setError('');
      try {
        await authApi.verifyMagicLink(magicToken);
        const session = await refreshUserSession();
        if (!cancelled && session.authenticated && session.user) {
          analytics.purchaseCompleted();
          navigate(session.user.onboardingCompleted ? '/dashboard' : '/app/onboarding', { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not verify magic link.');
        }
      } finally {
        if (!cancelled) {
          setSubmitting(false);
        }
      }
    }

    verifyToken();
    return () => {
      cancelled = true;
    };
  }, [navigate, refreshUserSession, searchParams]);

  async function handleSendMagicLink() {
    if (!email) {
      setError('Enter the purchase email you used at checkout.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await authApi.requestMagicLink(email, '/checkout/success');
      setMagicLink(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your magic link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page narrow-page">
      <div className="surface">
        <div className="locked-label">Purchased access</div>
        <h1>Complete your sign-in</h1>
        <p>
          {searchParams.get('mockCheckout')
            ? 'Mock checkout completed. Enter your purchase email to continue.'
            : 'Use your purchase email to receive a secure magic link and continue into onboarding.'}
        </p>
        <div className="input-stack">
          <input
            type="email"
            placeholder="Purchase email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleSendMagicLink} disabled={submitting}>
            {submitting ? 'Sending link...' : 'Email Me a Sign-in Link'}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {magicLink && (
          <div className="status-card">
            <strong>{magicLink.message}</strong>
            <p>Delivery mode: {magicLink.delivery}</p>
            {magicLink.magicLinkUrl && (
              <a className="btn btn-secondary" href={magicLink.magicLinkUrl}>
                Open Magic Link
              </a>
            )}
          </div>
        )}
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
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      try {
        const data = await userApi.loadDashboardOverview();
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
    await authApi.logout();
    await refreshUserSession();
    navigate('/demo', { replace: true });
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
      channelInput={overview?.channelTitle ?? ''}
      userEmail={userSession.user?.email}
      onCreateCheckout={async (_, email) => publicApi.createCheckoutSession(channelTitle, email)}
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
      navigate('/login/admin', { replace: true });
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
      navigate('/login/admin', { replace: true });
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

function AdminDashboardPage({
  adminSession,
  refreshAdminSession
}: {
  adminSession: AdminSessionStatus;
  refreshAdminSession: () => Promise<AdminSessionStatus>;
}) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      try {
        const data = await adminApi.loadSummary();
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load admin summary.');
        }
      }
    }

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await adminApi.logout();
    await refreshAdminSession();
    navigate('/login/admin', { replace: true });
  }

  return (
    <div className="page">
      <div className="surface">
        <h1>Admin CRM Dashboard</h1>
        <p>Visibility into demos, purchases, support, drop-offs, and customer activity.</p>
        <div className="pill-row">
          <span className="info-pill">Signed in as {adminSession.email}</span>
          <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {summary && (
        <>
          <div className="metric-grid">
            <div className="metric-tile"><span>Total Users</span><strong>{summary.totalUsers}</strong></div>
            <div className="metric-tile"><span>Total Demos</span><strong>{summary.totalDemos}</strong></div>
            <div className="metric-tile"><span>Total Purchases</span><strong>{summary.totalPurchases}</strong></div>
            <div className="metric-tile"><span>Conversion Rate</span><strong>{summary.conversionRate}</strong></div>
            <div className="metric-tile"><span>Gross Revenue</span><strong>{summary.grossRevenue}</strong></div>
          </div>
          <div className="surface">
            <h2>Recent activity</h2>
            <ul className="feature-list">
              {summary.recentActivity.map((item) => (
                <li key={`${item.title}-${item.timestamp}`}>{item.title}: {item.detail}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="section-grid">
        <div className="surface">
          <h2>CRM areas</h2>
          <ul className="feature-list">
            <li>User management</li>
            <li>Purchase records</li>
            <li>Demo funnel analytics</li>
            <li>Support inbox and replies via SES</li>
            <li>Audit trail and internal notes</li>
          </ul>
        </div>
        <div className="surface">
          <h2>Operational alerts</h2>
          <ul className="feature-list">
            <li>Failed onboarding flows</li>
            <li>Support backlog</li>
            <li>Demo abuse spikes</li>
            <li>Checkout drop-off anomalies</li>
            <li>Feature usage trends</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [userSession, setUserSession] = useState<UserSessionStatus>({ authenticated: false, user: null });
  const [adminSession, setAdminSession] = useState<AdminSessionStatus>({ authenticated: false, email: null });
  const [sessionLoading, setSessionLoading] = useState(true);

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

  const location = useLocation();
  const showGlobalNav = location.pathname !== '/' && location.pathname !== '/platform';

  const path = location.pathname;
  const seo = path === '/' ? { title: 'YouTubeBuster – AI YouTube Channel Growth Analyzer', canonical: '/' }
    : path === '/demo' ? { title: 'Demo – YouTubeBuster', canonical: '/demo' }
    : path === '/dashboard' ? { title: 'Dashboard – YouTubeBuster', canonical: '/dashboard' }
    : path === '/platform' ? { title: 'MK Platform – YouTubeBuster', canonical: '/platform' }
    : path === '/login/admin' ? { title: 'Admin', noindex: true as const }
    : {};

  return (
    <>
      <SeoHead
        title={'title' in seo ? seo.title : undefined}
        canonical={'canonical' in seo ? seo.canonical : undefined}
        noindex={'noindex' in seo ? seo.noindex : undefined}
      />
      {showGlobalNav && (
        <nav className="top-nav landing-top-nav">
          <Link
            to="/"
            className="brand"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            YouTubeBuster
          </Link>
          <div className="nav-links">
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
            Run Free Channel Audit
          </button>
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
          path="/login/admin"
          element={
            sessionLoading ? (
              <LoadingSurface title="Loading" detail="Checking session." />
            ) : adminSession.authenticated ? (
              <AdminRoute adminSession={adminSession} loading={false}>
                <AdminDashboardPage adminSession={adminSession} refreshAdminSession={refreshAdminSession} />
              </AdminRoute>
            ) : (
              <AdminLoginPage
                adminSession={adminSession}
                sessionLoading={sessionLoading}
                refreshAdminSession={refreshAdminSession}
              />
            )
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
