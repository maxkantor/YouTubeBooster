import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { analytics } from './lib/analytics';
import { billingApi, meApi, publicApi } from './lib/api';
import { DEFAULT_DEMO_CHANNEL, getDisplayHandle, getStoredDemoChannel, normalizeChannelForComparison } from './lib/demo';
import { useAuth } from './AuthContext';
import type { DemoPreview } from './types';
import { UnifiedDashboard } from './UnifiedDashboard';

function PaidRouteLoading() {
  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>Checking subscription</h1>
        <p>Loading full channel analysis…</p>
      </div>
    </div>
  );
}

/**
 * Public marketing demo (`/demo`) or paid-user channel audit (`/dashboard/channel`).
 * Paid users who analyze their own URL should use the paid route so they always get full unlock for that channel, not the public demo path.
 */
export function ChannelAnalyzeDashboard({ variant }: { variant: 'marketing' | 'paid' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const channelFromState = (location.state as { channelInput?: string } | null)?.channelInput;
  const channelFromQuery = searchParams.get('channel');
  const channelFromStorage = getStoredDemoChannel();

  const channelInput =
    variant === 'paid'
      ? (channelFromQuery ?? channelFromState ?? '').trim()
      : (channelFromQuery ?? channelFromState ?? channelFromStorage ?? DEFAULT_DEMO_CHANNEL);

  if (variant === 'paid' && !channelInput) {
    return <Navigate to="/dashboard" replace />;
  }

  const inputNormalized = normalizeChannelForComparison(channelInput);
  const defaultNormalized = normalizeChannelForComparison(DEFAULT_DEMO_CHANNEL);
  const inputHandle = normalizeChannelForComparison(getDisplayHandle(channelInput));
  const defaultHandle = normalizeChannelForComparison(getDisplayHandle(DEFAULT_DEMO_CHANNEL));
  const isDefaultChannelDemo =
    inputNormalized === defaultNormalized ||
    inputHandle === defaultHandle ||
    inputHandle === '@maxkantorcooking';

  const [hasPremium, setHasPremium] = useState(false);
  /** Paid-only: null = still verifying subscription with the API. */
  const [paidPremiumAllowed, setPaidPremiumAllowed] = useState<boolean | null>(() => (variant === 'paid' ? null : true));

  const effectiveFullDemo = variant === 'paid' ? true : isDefaultChannelDemo || hasPremium;
  const premiumUnlocked = variant === 'paid' ? true : hasPremium && !isDefaultChannelDemo;

  const [apiDemoData, setApiDemoData] = useState<DemoPreview | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    analytics.demoDashboardViewed();
  }, []);

  const refreshPremium = useCallback(async () => {
    if (!authSession?.idToken) {
      setHasPremium(false);
      return;
    }
    try {
      const status = await meApi.getAccessStatus(authSession.idToken);
      const p = !!status.premium;
      setHasPremium(p);
      if (variant === 'paid') setPaidPremiumAllowed(p);
    } catch {
      setHasPremium(false);
      if (variant === 'paid') setPaidPremiumAllowed(false);
    }
  }, [authSession?.idToken, variant]);

  useEffect(() => {
    void refreshPremium();
  }, [refreshPremium]);

  useEffect(() => {
    if (!authSession?.idToken) return;
    const t1 = window.setTimeout(() => void refreshPremium(), 2500);
    const t2 = window.setTimeout(() => void refreshPremium(), 8000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [authSession?.idToken, refreshPremium]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshPremium();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshPremium]);

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

  if (variant === 'paid') {
    if (!authSession?.idToken) {
      return <PaidRouteLoading />;
    }
    if (paidPremiumAllowed === null) {
      return <PaidRouteLoading />;
    }
    if (paidPremiumAllowed === false) {
      return <Navigate to={`/demo?channel=${encodeURIComponent(channelInput)}`} replace />;
    }
  }

  return (
    <UnifiedDashboard
      isDemo
      isFullDemo={effectiveFullDemo}
      premiumUnlocked={premiumUnlocked}
      paidChannelAudit={variant === 'paid'}
      demoData={apiDemoData}
      dashboardOverview={null}
      channelInput={channelInput}
      userEmail={authSession?.email ?? undefined}
      demoLoading={demoLoading}
      demoError={demoError}
      onCreateCheckout={async (ch, _email) => {
        const channel = ch || channelInput;
        if (!authSession) {
          const returnPath =
            variant === 'paid'
              ? `/dashboard/channel?channel=${encodeURIComponent(channel)}`
              : `/demo?channel=${encodeURIComponent(channel)}`;
          navigate(`/auth/signup?returnTo=${encodeURIComponent(returnPath)}&channel=${encodeURIComponent(channel)}&plan=premium`);
          return { checkoutUrl: '/auth/signup', sessionId: 'auth_required', amount: 0, currency: 'USD' };
        }
        return billingApi.createCheckoutSession(authSession.idToken, channel, 'premium');
      }}
    />
  );
}
