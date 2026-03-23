import { Link } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { BRAND } from '../../config/brand';
import { MarketingStaticPage } from './MarketingStaticPage';
import { useAuth } from '../../AuthContext';
import { publicApi } from '../../lib/api';

export function AboutPage() {
  return (
    <MarketingStaticPage
      title="About Us"
      description={`${BRAND.name} helps creators understand why channels stall and what to fix next—with fast, AI-assisted audits and a clear dashboard.`}
    >
      <p>
        We focus on practical signals: titles, thumbnails, SEO fit, and momentum patterns—so you spend less time guessing and
        more time publishing what works.
      </p>
      <p>
        <Link to="/#audit">Run a free channel audit</Link> to preview the experience, or explore{' '}
        <Link to="/#pricing">pricing</Link> for full access.
      </p>
    </MarketingStaticPage>
  );
}

export function ContactPage() {
  const { session: authSession, loading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (authSession?.email) {
      setEmail((prev) => (prev.trim() ? prev : authSession.email!));
    }
  }, [authSession?.email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setError('');
    try {
      const res = await publicApi.submitContact({
        name: name.trim() || null,
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        channelUrl: channelUrl.trim() || null,
        orderReference: orderReference.trim() || null,
        accountEmail: accountEmail.trim() || null,
        productArea: 'general'
      });
      setTicketId(res.ticketId);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <MarketingStaticPage
      title="Contact"
      description="Billing, access, product questions, or partnerships — we read every message."
    >
      {authLoading ? (
        <p className="muted">Loading…</p>
      ) : authSession?.email ? (
        <p className="contact-signed-in-note" role="status">
          Signed in as <strong>{authSession.email}</strong>. Use this form for billing, access, support, or partnership
          questions.
        </p>
      ) : null}

      {status === 'success' ? (
        <div className="contact-success" role="status">
          <h2 className="contact-success-title">Thanks — your message was sent.</h2>
          <p className="contact-success-body">
            We&apos;ll review it and reply by email.
            {ticketId && (
              <>
                {' '}
                Reference: <code className="contact-ref">{ticketId}</code>
              </>
            )}
          </p>
          <button type="button" className="btn btn-secondary contact-reset" onClick={() => {
            setStatus('idle');
            setMessage('');
            setSubject('');
            setTicketId(null);
          }}>
            Send another message
          </button>
        </div>
      ) : (
        <form className="contact-form" onSubmit={onSubmit} noValidate>
          {status === 'error' && (
            <div className="contact-banner contact-banner-error" role="alert">
              {error}
            </div>
          )}

          <label className="contact-label" htmlFor="contact-name">
            Full name <span className="contact-req">*</span>
          </label>
          <input
            id="contact-name"
            className="contact-input"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-required="true"
          />

          <label className="contact-label" htmlFor="contact-email">
            Email <span className="contact-req">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            className="contact-input"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-required="true"
          />

          <label className="contact-label" htmlFor="contact-account-email">
            Account email <span className="contact-opt">(optional)</span>
          </label>
          <p className="contact-hint">If different from the email above (e.g. you purchased under another address).</p>
          <input
            id="contact-account-email"
            type="email"
            className="contact-input"
            autoComplete="off"
            value={accountEmail}
            onChange={(e) => setAccountEmail(e.target.value)}
          />

          <label className="contact-label" htmlFor="contact-subject">
            Subject <span className="contact-req">*</span>
          </label>
          <input
            id="contact-subject"
            className="contact-input"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-required="true"
          />

          <label className="contact-label" htmlFor="contact-message">
            Message <span className="contact-req">*</span>
          </label>
          <p className="contact-hint">At least 10 characters. Be specific so we can help quickly.</p>
          <textarea
            id="contact-message"
            className="contact-textarea"
            required
            minLength={10}
            maxLength={12000}
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-required="true"
          />

          <label className="contact-label" htmlFor="contact-order">
            Order reference <span className="contact-opt">(optional)</span>
          </label>
          <input
            id="contact-order"
            className="contact-input"
            value={orderReference}
            onChange={(e) => setOrderReference(e.target.value)}
            placeholder="Stripe session or internal ref"
          />

          <label className="contact-label" htmlFor="contact-channel">
            YouTube channel URL <span className="contact-opt">(optional)</span>
          </label>
          <input
            id="contact-channel"
            type="url"
            className="contact-input"
            placeholder="https://www.youtube.com/@channel"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
          />

          <div className="contact-actions">
            <button type="submit" className="btn btn-primary" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Sending…' : 'Send message'}
            </button>
          </div>
          <p className="muted contact-footnote">
            We do not offer phone support. Typical reply time is a few business days.
          </p>
        </form>
      )}
    </MarketingStaticPage>
  );
}

export function PrivacyPage() {
  return (
    <MarketingStaticPage
      title="Privacy Policy"
      description="This page summarizes how we handle information in connection with the hosted product. Replace with counsel-approved legal text when ready."
    >
      <h2 className="marketing-static-h2">What we collect</h2>
      <p>
        Accounts, billing-related data from our payment provider, and channel inputs you submit for audits may be processed to
        deliver the service.
      </p>
      <h2 className="marketing-static-h2">Cookies & analytics</h2>
      <p>
        We may use first-party cookies for sessions and optional analytics to understand product usage. You can control cookies
        in your browser settings.
      </p>
      <h2 className="marketing-static-h2">Contact</h2>
      <p>Privacy questions: send from the email associated with your account and include “Privacy” in the subject line.</p>
    </MarketingStaticPage>
  );
}

export function DisclaimerPage() {
  return (
    <MarketingStaticPage
      title="Disclaimer"
      description="Read this before relying on audit outputs for business or legal decisions."
    >
      <h2 className="marketing-static-h2">No guarantees</h2>
      <p>
        Audits and recommendations are informational. Results depend on public data availability, platform changes, and how you
        implement changes. We do not guarantee views, revenue, or rankings.
      </p>
      <h2 className="marketing-static-h2">Third-party data</h2>
      <p>
        YouTube and related marks belong to their owners. We are not affiliated with or endorsed by YouTube or Google.
      </p>
      <h2 className="marketing-static-h2">Not legal or financial advice</h2>
      <p>Nothing on this site is legal, tax, or investment advice. Consult professionals for those topics.</p>
    </MarketingStaticPage>
  );
}
