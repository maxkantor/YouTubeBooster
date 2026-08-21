import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MarketingFooter } from '../../components/MarketingFooter';
import { analytics, trackEvent } from '../../lib/analytics';
import { beginAuditAttempt } from '../../lib/auditEventGate';
import { publicApi } from '../../lib/api';
import { getDisplayHandle } from '../../lib/demo';
import { validateYouTubeChannelInput } from '../../lib/youtubeChannelInput';
import type { DemoPreview } from '../../types';
import { usePricing } from '../../PricingContext';

function buildTrackedDemoUrl(channel: string, params: URLSearchParams): string {
  const q = new URLSearchParams();
  q.set('channel', channel);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref']) {
    const v = params.get(key);
    if (v) q.set(key, v);
  }
  if (!q.get('utm_source')) q.set('utm_source', 'mini_audit_share');
  if (!q.get('utm_medium')) q.set('utm_medium', 'share_page');
  if (!q.get('utm_campaign')) q.set('utm_campaign', 'acq_share');
  return `/demo?${q.toString()}`;
}

function pickObservation(data: DemoPreview | null): string {
  if (!data) return '';
  const fromFindings = (data.findings || []).find((f) => f && f.trim().length > 12);
  if (fromFindings) return fromFindings.trim();
  const fromRecs = (data.previewRecommendations || []).find((f) => f && f.trim().length > 12);
  if (fromRecs) return fromRecs.trim();
  if (data.healthScore > 0 && data.healthScore < 70) {
    return `Public signals put this channel’s growth health near ${data.healthScore}/100 — packaging and topic clarity are usually the first levers worth testing.`;
  }
  return 'Public packaging signals suggest clarifying the payoff in titles and thumbnails before changing the niche.';
}

/**
 * Personalized mini-audit share page for founder outreach / referrals.
 * Shows one useful public-data observation + CTA to the full free audit.
 */
export function MiniAuditSharePage() {
  const [params] = useSearchParams();
  const { oneTimePrice } = usePricing();
  const channelParam = (params.get('channel') || '').trim();
  const [input, setInput] = useState(channelParam);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DemoPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const channel = preview?.channelInput || channelParam || '';
    if (!channel) return '';
    const q = new URLSearchParams();
    q.set('channel', channel);
    q.set('utm_source', params.get('utm_source') || 'creator_referral');
    q.set('utm_medium', 'share_link');
    q.set('utm_campaign', params.get('utm_campaign') || 'acq_share');
    return `${window.location.origin}/share?${q.toString()}`;
  }, [preview, channelParam, params]);

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackEvent('share_link_copied', {
        destination: 'share',
        utm_campaign: params.get('utm_campaign') || 'acq_share'
      });
      trackEvent('share_attempt', { method: 'clipboard' });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      trackEvent('share_attempt', { method: 'clipboard_failed' });
    }
  }

  const observation = useMemo(() => pickObservation(preview), [preview]);
  const demoHref = preview
    ? buildTrackedDemoUrl(preview.channelInput || preview.channelHandle || channelParam, params)
    : buildTrackedDemoUrl(channelParam || input, params);

  useEffect(() => {
    trackEvent('mini_audit_share_viewed', {
      has_channel: channelParam ? '1' : '0',
      utm_source: params.get('utm_source') || 'none'
    });
  }, [channelParam, params]);

  useEffect(() => {
    const raw = channelParam.trim();
    if (!raw) {
      setPreview(null);
      setLoadError(null);
      return;
    }
    const validated = validateYouTubeChannelInput(raw);
    if (!validated.ok) {
      setLoadError(validated.message);
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    publicApi
      .runDemo(validated.normalized)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          trackEvent('mini_audit_observation_ready', {
            health_score: data.healthScore,
            source: params.get('utm_source') || 'share'
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreview(null);
          setLoadError(err instanceof Error ? err.message : 'Could not load a public preview for this channel.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelParam, params]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const channel = input.trim();
    if (!channel) {
      setError('Enter a channel URL or @handle.');
      return;
    }
    const validated = validateYouTubeChannelInput(channel);
    if (!validated.ok) {
      setError(validated.message);
      return;
    }
    const q = new URLSearchParams(params);
    q.set('channel', validated.normalized);
    window.location.search = q.toString();
  }

  function startFullAudit() {
    const channel = (preview?.channelInput || channelParam || input).trim();
    if (!channel) return;
    const validated = validateYouTubeChannelInput(channel);
    if (!validated.ok) return;
    if (typeof window !== 'undefined') {
      const { attemptId } = beginAuditAttempt(window.sessionStorage);
      analytics.auditStarted('mini_audit_share', { auditAttemptId: attemptId });
    } else {
      analytics.auditStarted('mini_audit_share');
    }
    trackEvent('mini_audit_cta_clicked', { destination: 'demo' });
    window.location.href = buildTrackedDemoUrl(validated.normalized, params);
  }

  const handle = preview
    ? getDisplayHandle(preview.channelHandle || preview.channelTitle)
    : channelParam
      ? getDisplayHandle(channelParam)
      : null;

  return (
    <div className="page marketing-page mini-audit-share-page">
      <header className="marketing-topbar">
        <Link to="/" className="brand-link">
          YouTubeBooster AI
        </Link>
        <nav className="marketing-topnav">
          <Link to="/sample-report">Sample report</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/demo">Free audit</Link>
        </nav>
      </header>

      <main className="mini-audit-share-main">
        <p className="mini-audit-kicker">Public-data mini audit</p>
        <h1 className="mini-audit-title">One clear observation. Then the full free audit.</h1>
        <p className="mini-audit-lead">
          Built for sharing with creators — a single practical note from public YouTube signals, plus a tracked link to
          run the complete free preview.
        </p>

        {!channelParam ? (
          <form className="mini-audit-form" onSubmit={onSubmit} noValidate>
            <label htmlFor="mini-audit-channel">Channel URL or @handle</label>
            <div className="mini-audit-form-row">
              <input
                id="mini-audit-channel"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://youtube.com/@channel or @channel"
                autoComplete="url"
              />
              <button type="submit" className="btn btn-primary">
                Preview observation
              </button>
            </div>
            {error ? (
              <p className="mini-audit-error" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        ) : null}

        {loading ? <p className="mini-audit-status">Reading public channel signals…</p> : null}
        {loadError ? (
          <p className="mini-audit-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {preview && !loading ? (
          <section className="mini-audit-card" aria-label="Mini audit observation">
            <div className="mini-audit-channel-meta">
              <strong>{preview.channelTitle || handle}</strong>
              {handle ? <span>{handle}</span> : null}
              {typeof preview.healthScore === 'number' ? (
                <span className="mini-audit-score">Public health score {preview.healthScore}/100</span>
              ) : null}
            </div>
            <h2>What I’d test first</h2>
            <p className="mini-audit-observation">{observation}</p>
            <p className="mini-audit-disclaimer">
              Based on public YouTube data only — not private Studio analytics. One observation is not a full audit.
            </p>
            <div className="mini-audit-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={startFullAudit}>
                Run the free full audit
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void copyShareLink()} disabled={!shareUrl}>
                {copied ? 'Link copied' : 'Copy share link for another creator'}
              </button>
              <Link className="btn btn-secondary" to={`/pricing?utm_source=mini_audit_share&utm_campaign=acq_share`}>
                See full report ({oneTimePrice})
              </Link>
            </div>
            <p className="mini-audit-share-hint">
              Product-led referral: send the share link to another creator. Copies are tracked; acquisition only counts
              when they land and start an audit.
            </p>
            <p className="mini-audit-tracked">
              Full audit link (tracked): <Link to={demoHref}>{demoHref}</Link>
            </p>
          </section>
        ) : null}

        {channelParam && !loading && !preview && !loadError ? null : null}

        <section className="mini-audit-secondary">
          <h2>Want the paid-report shape?</h2>
          <p>
            See a concrete sample on the MaxKantorCooking showcase — titles, packaging, and unlock modules — before you
            buy.
          </p>
          <Link className="btn btn-secondary" to="/sample-report">
            View sample paid report
          </Link>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

export default MiniAuditSharePage;
