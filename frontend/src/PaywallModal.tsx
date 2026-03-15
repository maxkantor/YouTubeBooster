import { useState } from 'react';
import { analytics } from './lib/analytics';
import type { CheckoutSession } from './types';

const BENEFITS = [
  'Full AI channel audit',
  'SEO title rewrite engine',
  'Traffic opportunity analysis',
  'Content strategy recommendations',
  'Continuous optimization tools',
  'Future platform improvements'
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
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function handleUnlock() {
    if (!email.trim()) {
      setError('Enter your email to unlock.');
      return;
    }
    setError('');
    try {
      analytics.checkoutStarted();
      const session = await onCreateCheckout(channelInput ?? '', email);
      window.location.href = session.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content paywall-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Unlock full AI channel analysis</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="paywall-subtitle">
          Unlock the full AI growth report for your channel. One payment. Lifetime access.
        </p>
        <ul className="feature-list paywall-list">
          {BENEFITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="paywall-price">$49.99 one-time</p>
        <div className="input-stack">
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUnlock}
            disabled={isLoading}
          >
            {isLoading ? 'Starting checkout…' : 'Unlock Full Report'}
          </button>
        </div>
        <button type="button" className="btn btn-secondary paywall-continue" onClick={onClose}>
          Continue Demo
        </button>
        <p className="paywall-reassurance">One payment. Lifetime access.</p>
      </div>
    </div>
  );
}
