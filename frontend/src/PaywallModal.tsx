import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analytics } from './lib/analytics';
import { useAuth } from './AuthContext';
import { billingApi, meApi } from './lib/api';
import { getSession as cognitoGetSession } from './lib/auth';
import { resolveCheckoutUrl } from './lib/startCheckout';
import { unlockReturnFromWindow, unlockSigninPath, unlockSignupPath } from './lib/unlockFlow';
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

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
        return;
      }

      analytics.checkoutStarted(channel);
      const session = await onCreateCheckout(channel, authSession.email ?? '');
      const checkoutUrl = resolveCheckoutUrl(session);
      if (!checkoutUrl) {
        setError('Could not start checkout. Please try again.');
        return;
      }
      window.location.assign(checkoutUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';

      const shouldRetry401 = authSession && (msg.includes('401') || msg.toLowerCase().includes('unauthorized'));
      if (shouldRetry401) {
        try {
          const fresh = await cognitoGetSession();
          if (fresh?.idToken) {
            const retrySession = await billingApi.createCheckoutSession(fresh.idToken, channel, 'premium');
            const retryUrl = resolveCheckoutUrl(retrySession);
            if (!retryUrl) {
              setError('Could not start checkout. Please try again.');
              return;
            }
            window.location.assign(retryUrl);
            return;
          }
        } catch {
          // Fall through to normal error UI.
        }
      }

      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    }
  }

  const unlockReturnTo = unlockReturnFromWindow();

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="paywall-title">
      <div className="modal-content paywall-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="paywall-title">See why your channel isn’t growing</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="paywall-subtitle">
          Start with a free preview. Upgrade only if you want the full channel audit, recommendations, and growth plan.
        </p>
        <ul className="paywall-list">
          {BENEFITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="paywall-price">
          <span className="paywall-price-amount">{oneTimePriceLabel}</span>{' '}
          <span className="paywall-price-note">one-time</span>
        </p>
        {authSession ? (
          <form
            className="input-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void handleUnlock();
            }}
          >
            <p className="muted" style={{ margin: 0 }}>
              Your purchase unlocks the account you’re signed into (works across all devices).
            </p>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={isLoading || hasPremium}>
              {hasPremium
                ? 'Already unlocked'
                : isLoading
                  ? 'Starting checkout…'
                  : `Get My Full Growth Fix — ${oneTimePriceLabel}`}
            </button>
          </form>
        ) : (
          <div className="input-stack">
            <p className="muted" style={{ margin: 0 }}>
              Create a free account first, then complete secure one-time checkout to unlock your full report.
            </p>
            <Link className="btn btn-primary" to={unlockSignupPath(unlockReturnTo)} onClick={onClose}>
              Sign up to unlock — {oneTimePriceLabel}
            </Link>
            <Link className="btn btn-secondary" to={unlockSigninPath(unlockReturnTo)} onClick={onClose}>
              Already have an account? Sign in
            </Link>
          </div>
        )}
        <button type="button" className="btn btn-secondary paywall-continue" onClick={onClose}>
          Continue Demo
        </button>
        <p className="paywall-reassurance">One-time payment. No subscription. Secure checkout via Stripe.</p>
      </div>
    </div>
  );
}
