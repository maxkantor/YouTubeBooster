import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { analytics } from './lib/analytics';
import {
  claimAuditCompletion,
  ensureAuditAttemptForDemoLanding,
  shouldCountAsUserAudit
} from './lib/auditEventGate';
import { billingApi, meApi, publicApi } from './lib/api';
import { startPremiumCheckout } from './lib/startCheckout';
import { DEFAULT_DEMO_CHANNEL, getDisplayHandle, getStoredDemoChannel, normalizeChannelForComparison } from './lib/demo';
import { useAuth } from './AuthContext';
import { DemoAnalysisLoadingPanel } from './components/DemoAnalysisLoadingPanel';
import type { DemoPreview } from './types';
import { UnifiedDashboard } from './UnifiedDashboard';

function PaidRouteLoading() {
  return (
    <div className="page narrow-page">
      <div className="surface surface-static">
        <DemoAnalysisLoadingPanel />
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
  const demoOpenedTrackedRef = useRef(false);
  const orphanStartTrackedRef = useRef(false);

  useEffect(() => {
    if (variant !== 'marketing' || !isDefaultChannelDemo || demoOpenedTrackedRef.current) return;
    demoOpenedTrackedRef.current = true;
    analytics.demoOpenedOnDemoRoute();
  }, [variant, isDefaultChannelDemo]);

  // User channel on /demo without a prior form start: fire one audit_started (session-deduped).
  useEffect(() => {
    if (variant !== 'marketing' || !shouldCountAsUserAudit(isDefaultChannelDemo)) return;
    if (orphanStartTrackedRef.current) return;
    if (typeof window === 'undefined') return;
    orphanStartTrackedRef.current = true;
    const channelKey = inputNormalized || inputHandle || 'unknown';
    const { attemptId, shouldTrackStart } = ensureAuditAttemptForDemoLanding(
      window.sessionStorage,
      channelKey
    );
    if (shouldTrackStart) {
      const auditSource =
        (location.state as { auditSource?: string } | null)?.auditSource || 'demo_landing';
      analytics.auditStarted(auditSource, { auditAttemptId: attemptId });
    }
  }, [variant, isDefaultChannelDemo, inputNormalized, inputHandle, location.state]);

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
          // Paid dashboard audits are entitled users, not acquisition funnel events.
          // Completions require a prior start on the same attempt id.
          if (
            variant === 'marketing' &&
            shouldCountAsUserAudit(isDefaultChannelDemo) &&
            typeof window !== 'undefined'
          ) {
            const channelKey = inputNormalized || inputHandle || 'unknown';
            const { attemptId } = ensureAuditAttemptForDemoLanding(window.sessionStorage, channelKey);
            if (claimAuditCompletion(window.sessionStorage, attemptId)) {
              analytics.auditCompleted({ auditAttemptId: attemptId });
            }
          }
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
  }, [channelInput, isDefaultChannelDemo, inputNormalized, inputHandle, variant]);

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
      onCreateCheckout={async (ch, email) => {
        const channel = ch || channelInput;
        if (!authSession) {
          return startPremiumCheckout({ channelInput: channel, email });
        }
        return billingApi.createCheckoutSession(authSession.idToken, channel, 'premium');
      }}
    />
  );
}
