import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { analytics } from './lib/analytics';
import { useAuth } from './AuthContext';
import { billingApi, meApi } from './lib/api';
import { getSession as cognitoGetSession } from './lib/auth';
import type { CheckoutSession } from './types';
import { usePricing } from './PricingContext';

const BENEFITS = [
  'Find what’s killing your views',
  'Fix your titles for higher CTR',
  'Discover missed traffic opportunities',
  'Get simple steps to grow fast',
  'Save your report & track progress'
];

export function PaywallModal({
  featureName,
  channelInput,
  onClose,
  onCreateCheckout,
  isLoading
}: {
  featureName: string;
  channelInput?: string;
  onClose: () => void;
  onCreateCheckout: (channelInput: string, email: string) => Promise<CheckoutSession>;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { oneTimePriceLabel } = usePricing();
  const { session: authSession } = useAuth();
  const [error, setError] = useState('');
  const [hasPremium, setHasPremium] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!authSession?.idToken) {
      setHasPremium(false);
      return;
    }
    (async () => {
      try {
        const status = await meApi.getAccessStatus(authSession.idToken);
        if (!cancelled) setHasPremium(!!status.premium);
      } catch {
        if (!cancelled) setHasPremium(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authSession?.idToken]);

  async function handleUnlock() {
    if (!authSession) {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(`/auth/signup?returnTo=${encodeURIComponent(returnTo)}&channel=${encodeURIComponent(channelInput ?? '')}&plan=premium`);
      onClose();
      return;
    }
    if (hasPremium) {
      setError('You already have premium access.');
      return;
    }
    setError('');
    try {
      analytics.checkoutStarted();
      const session = await onCreateCheckout(channelInput?.trim() ? channelInput : 'account', '');
      window.location.href = session.checkoutUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';

      // If we got a 401, the JWT we used for the request can be expired/invalid.
      // Retry once using a fresh Cognito session token so the user sees the Stripe redirect.
      const shouldRetry401 = msg.includes('401') || msg.toLowerCase().includes('unauthorized');
      if (shouldRetry401) {
        // Debug visibility: lets us confirm retry code runs.
        // eslint-disable-next-line no-console
        console.log('[PaywallModal] checkout 401; retrying with fresh Cognito session');
        try {
          const fresh = await cognitoGetSession();
          if (fresh?.idToken) {
            // eslint-disable-next-line no-console
            console.log('[PaywallModal] fresh idToken present; retry create-checkout-session');
            const retryChannel = channelInput?.trim() ? channelInput : 'account';
            const retrySession = await billingApi.createCheckoutSession(fresh.idToken, retryChannel, 'premium');
            window.location.href = retrySession.checkoutUrl;
            return;
          }
        } catch {
          // Fall through to normal error UI.
        }
      }

      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content paywall-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>See why your channel isn’t growing</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="paywall-subtitle">
          Fix it in minutes — full report, your channel, one payment. No subscription.
        </p>
        <ul className="feature-list paywall-list">
          {BENEFITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="paywall-price">
          <span className="paywall-price-amount">{oneTimePriceLabel}</span>{' '}
          <span className="paywall-price-note">one-time</span>
        </p>
        <div className="input-stack">
          <p className="muted" style={{ margin: 0 }}>
            Your purchase unlocks the account you’re signed into (works across all devices).
          </p>
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn btn-primary" onClick={handleUnlock} disabled={isLoading || hasPremium}>
            {authSession ? (hasPremium ? 'Already unlocked' : (isLoading ? 'Starting checkout…' : 'Unlock Full Report')) : 'Sign in to unlock'}
          </button>
        </div>
        <button type="button" className="btn btn-secondary paywall-continue" onClick={onClose}>
          Continue Demo
        </button>
        <p className="paywall-reassurance">One-time payment. No subscription. Instant access.</p>
      </div>
    </div>
  );
}
