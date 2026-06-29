import { useEffect, useState } from 'react';
import { analytics } from './lib/analytics';
import { useAuth } from './AuthContext';
import { billingApi, meApi } from './lib/api';
import { getSession as cognitoGetSession } from './lib/auth';
import { isCheckoutEmailValid, startPremiumCheckout } from './lib/startCheckout';
import type { CheckoutSession } from './types';
import { usePricing } from './PricingContext';

const BENEFITS = [
  'Find what is killing your views',
  'Fix weak titles and low CTR',
  'Discover missed keyword and traffic opportunities',
  'Improve thumbnails and video packaging',
  'Save your report and track progress'
];

export function PaywallModal({
  featureName: _featureName,
  channelInput,
  onClose,
  onCreateCheckout,
  isLoading
}: {
  featureName?: string;
  channelInput?: string;
  onClose: () => void;
  onCreateCheckout: (channelInput: string, email: string) => Promise<CheckoutSession>;
  isLoading: boolean;
}) {
  const { oneTimePriceLabel } = usePricing();
  const { session: authSession } = useAuth();
  const [error, setError] = useState('');
  const [hasPremium, setHasPremium] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');

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
    if (hasPremium) {
      setError('You already have premium access.');
      return;
    }

    const channel = channelInput?.trim() ? channelInput : 'account';
    setError('');

    try {
      if (!authSession) {
        if (!isCheckoutEmailValid(checkoutEmail)) {
          setError('Enter a valid email to continue to secure checkout.');
          return;
        }
        analytics.checkoutStarted(channel);
        const session = await startPremiumCheckout({ channelInput: channel, email: checkoutEmail });
        window.location.href = session.checkoutUrl;
        return;
      }

      analytics.checkoutStarted(channel);
      const session = await onCreateCheckout(channel, authSession.email ?? '');
      window.location.href = session.checkoutUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';

      const shouldRetry401 = authSession && (msg.includes('401') || msg.toLowerCase().includes('unauthorized'));
      if (shouldRetry401) {
        try {
          const fresh = await cognitoGetSession();
          if (fresh?.idToken) {
            const retrySession = await billingApi.createCheckoutSession(fresh.idToken, channel, 'premium');
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
          Start with a free preview. Upgrade only if you want the full channel audit, recommendations, and growth plan.
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
          {authSession ? (
            <p className="muted" style={{ margin: 0 }}>
              Your purchase unlocks the account you’re signed into (works across all devices).
            </p>
          ) : (
            <>
              <label className="field-label" htmlFor="paywall-checkout-email">
                Email for checkout and account access
              </label>
              <input
                id="paywall-checkout-email"
                type="email"
                className="landing-demo-input"
                placeholder="you@example.com"
                value={checkoutEmail}
                onChange={(e) => {
                  setCheckoutEmail(e.target.value);
                  setError('');
                }}
                autoComplete="email"
              />
              <p className="muted" style={{ margin: 0 }}>
                Pay with Stripe, then create your account with the same email to unlock your report.
              </p>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn btn-primary" onClick={handleUnlock} disabled={isLoading || hasPremium}>
            {hasPremium
              ? 'Already unlocked'
              : isLoading
                ? 'Starting checkout…'
                : authSession
                  ? `Get My Full Growth Fix — ${oneTimePriceLabel}`
                  : `Continue to Secure Checkout — ${oneTimePriceLabel}`}
          </button>
        </div>
        <button type="button" className="btn btn-secondary paywall-continue" onClick={onClose}>
          Continue Demo
        </button>
        <p className="paywall-reassurance">One-time payment. No subscription. Secure checkout via Stripe.</p>
      </div>
    </div>
  );
}
