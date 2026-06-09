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
      description={`${BRAND.name} was built for small YouTube creators who want clearer growth diagnosis, practical fixes, and a simpler path to better publishing decisions.`}
    >
      <p>
        {BRAND.name} exists for creators who are tired of guessing. The product is built
        around a simple question: why is this channel not growing, and what should change
        first? Instead of leaning on hype or vanity claims, the platform focuses on the
        areas that usually decide whether a small channel gets momentum at all: packaging,
        CTR, thumbnails, retention, search fit, and overall content positioning.
      </p>

      <h2 className="marketing-static-h2">Built for small creators</h2>
      <p>
        The mission is practical. Small channels do not need another giant software stack
        with more tabs than answers. They need a clearer read on what is suppressing
        growth and better guidance on the next move. That is why the product is shaped
        more like a creator consultant than a generic analytics warehouse.
      </p>

      <h2 className="marketing-static-h2">Actionable growth fixes</h2>
      <p>
        Recommendations are meant to be understandable and usable. The platform looks at
        areas like title strength, thumbnail clarity, search discoverability, retention
        leaks, and video packaging so creators can stop changing everything at once and
        start fixing the highest-leverage problem first.
      </p>

      <h2 className="marketing-static-h2">No subscription philosophy</h2>
      <p>
        The one-time unlock model is deliberate. Most creators do not need a recurring
        bill just to understand what is hurting performance. They need a trustworthy
        audit, a stronger set of recommendations, and enough clarity to make the next few
        uploads better than the last few.
      </p>

      <h2 className="marketing-static-h2">What we want the product to do well</h2>
      <p>
        The goal is to help creators understand why videos are not getting clicked, why
        viewers may be dropping early, where YouTube SEO is weak, and how packaging can
        improve without making the whole process feel more technical than the creative
        work itself. If the platform helps creators make cleaner publishing decisions, it
        is doing its job.
      </p>

      <div className="marketing-static-cta">
        <h2 className="marketing-static-h2">See the audit before you commit</h2>
        <p>
          <Link to="/#audit">Run a free channel audit</Link> to preview the experience, or
          explore <Link to="/#pricing">pricing</Link> if you want the full report and
          growth fix.
        </p>
      </div>
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
      void import('../../lib/analytics').then(({ analytics }) => analytics.contactSubmitted());
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <MarketingStaticPage
      title="Contact"
      description="Questions, feedback, partnerships, or creator support requests. Send a message and we will review it."
    >
      <p>
        Use this page for questions, feedback, partnerships, billing issues, or creator
        support requests. If you are reaching out about a specific audit or account,
        include the email or order reference tied to the purchase so we can help faster.
      </p>

      <h2 className="marketing-static-h2">What to contact us about</h2>
      <p>
        Product questions, creator workflow feedback, partnership inquiries, access
        issues, billing questions, and support follow-ups are all appropriate here. We do
        not offer phone support, but every message sent through the form is reviewed.
      </p>

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

export function PricingPage() {
  return (
    <MarketingStaticPage
      title="Pricing"
      description="See YouTubeBooster AI pricing: run a free preview first, then unlock the full AI YouTube channel audit and growth report with a one-time payment."
    >
      <p>
        YouTubeBooster AI is built around a simple pricing promise: preview the channel
        audit first, then unlock the full report only when the findings look useful. No
        subscription is required for the core audit experience.
      </p>

      <h2 className="marketing-static-h2">Free preview first</h2>
      <p>
        Start with the free channel preview to see how the audit reads your titles,
        channel positioning, SEO opportunities, retention signals, and packaging issues.
        The preview is designed to show whether the product can identify useful growth
        problems before you pay.
      </p>

      <h2 className="marketing-static-h2">One-time full report unlock</h2>
      <p>
        The paid unlock gives you the full dashboard experience, deeper recommendations,
        AI growth guidance, and a clearer next-step plan for improving clicks, watch
        time, and discoverability. Pricing details shown in the app are the source of
        truth for the current offer.
      </p>

      <h2 className="marketing-static-h2">Who it is for</h2>
      <p>
        The audit is meant for creators who want a practical read on what is holding a
        channel back: weak titles, unclear thumbnails, poor search fit, inconsistent
        positioning, or videos that do not confirm the click quickly enough.
      </p>

      <div className="marketing-static-cta">
        <h2 className="marketing-static-h2">Start with your channel</h2>
        <p>
          <Link to="/#audit">Run the free audit preview</Link>, then unlock the full
          report if you want the detailed growth fix.
        </p>
      </div>
    </MarketingStaticPage>
  );
}

export function FaqPage() {
  return (
    <MarketingStaticPage
      title="FAQ"
      description="Answers to common YouTubeBooster AI questions about channel audits, YouTube SEO, pricing, privacy, and what the AI growth report can and cannot do."
    >
      <h2 className="marketing-static-h2">What does YouTubeBooster AI analyze?</h2>
      <p>
        It looks at the public channel or video context you provide and organizes growth
        issues around titles, SEO, packaging, content positioning, retention risk, and
        practical recommendations for the next upload.
      </p>

      <h2 className="marketing-static-h2">Is the preview free?</h2>
      <p>
        Yes. You can run the free preview before deciding whether the full report is
        worth unlocking. The preview is intentionally useful enough to show the type of
        diagnosis the product provides.
      </p>

      <h2 className="marketing-static-h2">Does this guarantee more views?</h2>
      <p>
        No tool can guarantee YouTube views, subscribers, rankings, or revenue. The goal
        is to find likely growth blockers and give you clearer fixes so your next videos
        have a better chance to earn clicks and keep viewers.
      </p>

      <h2 className="marketing-static-h2">Is this affiliated with YouTube?</h2>
      <p>
        No. YouTubeBooster AI is an independent product and is not affiliated with,
        endorsed by, or sponsored by YouTube or Google.
      </p>

      <h2 className="marketing-static-h2">Where should I start?</h2>
      <p>
        Start with the <Link to="/#audit">free channel audit</Link>. If you want more
        background first, read <Link to="/why-your-channel-gets-no-views">why your
        channel gets no views</Link> or <Link to="/youtube-seo-for-small-channels">YouTube
        SEO for small channels</Link>.
      </p>
    </MarketingStaticPage>
  );
}

export function PrivacyPage() {
  return (
    <MarketingStaticPage
      title="Privacy Policy"
      description="Read how YouTubeBooster AI handles account details, contact messages, analytics, and creator-submitted information in connection with the hosted product."
    >
      <h2 className="marketing-static-h2">What information we handle</h2>
      <p>
        We may handle account information, contact form messages, payment-related records
        from our payment provider, and the channel inputs you submit to request audits or
        support. This information is used to operate the product, respond to creator
        questions, and deliver the services you request.
      </p>

      <h2 className="marketing-static-h2">Sessions, cookies, and analytics</h2>
      <p>
        The site may use first-party cookies or similar storage for sign-in sessions,
        product continuity, and optional analytics. Analytics are used to understand how
        people use the site and where the experience needs improvement. You can control
        cookie behavior through your browser settings.
      </p>

      <h2 className="marketing-static-h2">Independent platform disclosure</h2>
      <p>
        YouTubeBooster AI is an independent product and is not affiliated with YouTube or
        Google. The product provides informational growth insights and does not offer
        unauthorized access to creator accounts. Responsibility for account use, channel
        changes, and publishing decisions remains with the user.
      </p>

      <h2 className="marketing-static-h2">Support and privacy requests</h2>
      <p>
        If you have a privacy-related request, contact us from the email associated with
        your account and include enough information for us to identify your message or
        purchase. We will review privacy questions through the same support workflow used
        for creator and billing inquiries.
      </p>
    </MarketingStaticPage>
  );
}

export function DisclaimerPage() {
  return (
    <MarketingStaticPage
      title="Disclaimer"
      description="Understand the limits of YouTubeBooster AI recommendations, third-party platform references, and creator responsibility before relying on audit outputs."
    >
      <h2 className="marketing-static-h2">No guarantees</h2>
      <p>
        Audits, recommendations, and growth insights are informational only. Results
        depend on many factors, including public data availability, topic selection,
        creative execution, platform changes, and how recommendations are implemented. We
        do not guarantee views, subscribers, revenue, rankings, or business outcomes.
      </p>

      <h2 className="marketing-static-h2">Third-party data</h2>
      <p>
        YouTube and related marks belong to their respective owners. YouTubeBooster AI is
        an independent tool and is not affiliated with, endorsed by, or sponsored by
        YouTube or Google. References to third-party platforms are descriptive only.
      </p>

      <h2 className="marketing-static-h2">Account access and creator responsibility</h2>
      <p>
        The product is intended to help creators review packaging, discoverability, CTR,
        thumbnails, SEO, and retention signals. It does not grant unauthorized account
        access, does not act on your behalf inside YouTube, and does not remove the
        creator&apos;s responsibility to make final channel, content, or business
        decisions.
      </p>

      <h2 className="marketing-static-h2">Not legal, financial, or professional advice</h2>
      <p>
        Nothing on this site should be treated as legal, tax, accounting, investment, or
        other professional advice. If you need formal guidance in those areas, consult a
        qualified professional rather than relying on product output alone.
      </p>
    </MarketingStaticPage>
  );
}
