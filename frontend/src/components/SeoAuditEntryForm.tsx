import { FormEvent, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { analytics } from '../lib/analytics';
import { beginAuditAttempt } from '../lib/auditEventGate';
import { DEFAULT_DEMO_CHANNEL, setStoredDemoChannel } from '../lib/demo';
import { validateYouTubeChannelInput } from '../lib/youtubeChannelInput';

type SeoAuditEntryFormProps = {
  /** GA4 source label for this placement. */
  source?: string;
};

/**
 * Channel entry for SEO / growth pages.
 * Submits to /demo?channel=… (same path as homepage) instead of /#audit.
 */
export function SeoAuditEntryForm({ source = 'seo_page' }: SeoAuditEntryFormProps) {
  const navigate = useNavigate();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    const channel = value.trim();
    if (!channel) {
      setError('Enter a channel URL or @handle.');
      return;
    }
    const validated = validateYouTubeChannelInput(channel);
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    const normalized = validated.normalized;
    setSubmitting(true);
    analytics.auditUrlEntered(normalized);
    const { attemptId } =
      typeof window !== 'undefined'
        ? beginAuditAttempt(window.sessionStorage)
        : { attemptId: undefined as string | undefined };
    analytics.auditStarted(source, attemptId ? { auditAttemptId: attemptId } : undefined);
    setStoredDemoChannel(normalized);
    navigate(`/demo?channel=${encodeURIComponent(normalized)}`, {
      state: { channelInput: normalized, auditSource: source, auditAttemptId: attemptId }
    });
    setSubmitting(false);
  }

  function openInstantDemo() {
    setStoredDemoChannel(DEFAULT_DEMO_CHANNEL);
    analytics.heroInstantDemoClicked();
    navigate(`/demo?channel=${encodeURIComponent(DEFAULT_DEMO_CHANNEL)}`, {
      state: { channelInput: DEFAULT_DEMO_CHANNEL, auditSource: `${source}_instant_demo` }
    });
  }

  return (
    <form className="seo-audit-entry" onSubmit={onSubmit} noValidate>
      <label className="seo-audit-entry-label" htmlFor={inputId}>
        Paste your YouTube channel URL or @handle
      </label>
      <div className="seo-audit-entry-row">
        <input
          id={inputId}
          className="seo-audit-entry-input"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://youtube.com/@yourchannel or @yourchannel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          disabled={submitting}
        />
        <button type="submit" className="btn btn-primary seo-audit-entry-submit" disabled={submitting}>
          {submitting ? 'Starting…' : 'Analyze my channel'}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="seo-audit-entry-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="seo-audit-entry-hint">
        Free preview — no signup required.{' '}
        <button type="button" className="seo-audit-entry-demo-link" onClick={openInstantDemo}>
          Or try the instant demo
        </button>
        {' · '}
        <Link to="/pricing">Pricing</Link>
      </p>
    </form>
  );
}
