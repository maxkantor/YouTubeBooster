import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MarketingFooter } from '../../components/MarketingFooter';
import { trackEvent } from '../../lib/analytics';
import { publicApi } from '../../lib/api';
import { usePricing } from '../../PricingContext';

type PersonalizedAudit = {
  token: string;
  channelName: string;
  handle: string;
  campaign: string;
  analyzedVideoTitle?: string | null;
  analyzedVideoUrl?: string | null;
  analyzedThumbnailUrl?: string | null;
  primaryOpportunity?: string | null;
  opportunityScore?: number;
  observation: string;
  suggestedImprovement?: string | null;
  topActions?: string[];
  numberOneFix?: string;
  sections?: {
    channelSnapshot?: { subscriberRange?: string; language?: string };
    discovery?: { summary?: string; languageLocalization?: string | null };
    click?: { titleOpportunity?: string | null };
    convert?: { descriptionOpportunity?: string | null; ctaHint?: string | null };
    watch?: { note?: string };
  };
  offer?: {
    priceLabel?: string;
    headline?: string;
    body?: string;
    demoHref?: string;
  };
};

function isOpaqueAuditToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{24,64}$/.test(value);
}

/**
 * Personalized free audit for COOK-001 outreach.
 * Opens without auth/payment; attribution stays on yb_oid.
 */
export function PersonalizedCreatorAuditPage() {
  const paramsRoute = useParams();
  const token = (paramsRoute.token || paramsRoute.slug || '').trim();
  const [params] = useSearchParams();
  const { oneTimePrice } = usePricing();
  const [data, setData] = useState<PersonalizedAudit | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const demoHref = useMemo(() => {
    const base = data?.offer?.demoHref || '/demo';
    const q = new URLSearchParams(base.includes('?') ? base.split('?')[1] : '');
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_id', 'yb_oid', 'exp']) {
      const v = params.get(key);
      if (v && !q.get(key)) q.set(key, v);
    }
    if (!q.get('yb_oid') && token) q.set('yb_oid', token);
    const path = base.split('?')[0] || '/demo';
    return `${path}?${q.toString()}`;
  }, [data, params, token]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isOpaqueAuditToken(token)) {
        setError('This audit link is not valid.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || ''}/api/public/acq/audit/${encodeURIComponent(token)}`
        );
        if (!res.ok) throw new Error('audit_not_found');
        const json = (await res.json()) as PersonalizedAudit;
        if (cancelled) return;
        setData(json);
        try {
          sessionStorage.setItem(
            'yb_outreach_attribution',
            JSON.stringify({
              yb_oid: token,
              utm_source: params.get('utm_source') || 'outreach',
              utm_medium: params.get('utm_medium') || 'email',
              utm_campaign: params.get('utm_campaign') || json.campaign || 'COOK-001',
              exp: params.get('exp') || '004'
            })
          );
        } catch {
          /* ignore */
        }
        trackEvent('personalized_audit_viewed', {
          campaign: json.campaign || 'COOK-001',
          has_video: json.analyzedVideoTitle ? '1' : '0'
        });
        void publicApi.trackFunnelEvent('audit_viewed', token, { yb_oid: token });
      } catch {
        if (!cancelled) setError('We could not find this free audit. The link may be expired.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, params]);

  async function onEngage() {
    trackEvent('personalized_audit_engaged', { campaign: data?.campaign || 'COOK-001' });
    try {
      await fetch(
        `${import.meta.env.VITE_API_BASE_URL || ''}/api/public/acq/audit/${encodeURIComponent(token)}/engage`,
        { method: 'POST' }
      );
    } catch {
      /* non-blocking */
    }
  }

  if (loading) {
    return (
      <main className="marketing-page">
        <section className="marketing-hero">
          <p className="ops-muted">Loading your free audit…</p>
        </section>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="marketing-page">
        <section className="marketing-hero">
          <h1>Free YouTube Growth Audit</h1>
          <p>{error || 'Audit unavailable.'}</p>
          <Link className="btn btn-primary" to="/demo">
            Run a free audit
          </Link>
        </section>
        <MarketingFooter />
      </main>
    );
  }

  const numberOne = data.numberOneFix || data.observation;
  const actions = (data.topActions || []).slice(0, 3);

  return (
    <main className="marketing-page personalized-audit">
      <section className="marketing-hero">
        <p className="eyebrow">YouTubeBooster AI</p>
        <h1>{data.channelName}</h1>
        <p className="lead">Free YouTube Growth Audit</p>
        {data.analyzedVideoTitle ? (
          <p>
            <strong>Analyzed:</strong> {data.analyzedVideoTitle}
          </p>
        ) : null}
        <div className="personalized-audit-opportunity">
          <h2>#1 opportunity we found</h2>
          <p>{numberOne}</p>
          <a className="btn btn-primary" href="#details" onClick={() => void onEngage()}>
            View details
          </a>
        </div>
      </section>

      <section id="details" className="marketing-section">
        <h2>Channel snapshot</h2>
        <p>
          {data.handle}
          {data.sections?.channelSnapshot?.subscriberRange
            ? ` · ${data.sections.channelSnapshot.subscriberRange} subscribers`
            : ''}
          {data.sections?.channelSnapshot?.language
            ? ` · ${data.sections.channelSnapshot.language}`
            : ''}
        </p>
      </section>

      <section className="marketing-section">
        <h2>Discovery</h2>
        <p>{data.sections?.discovery?.summary || data.observation}</p>
        {data.sections?.discovery?.languageLocalization ? (
          <p>{data.sections.discovery.languageLocalization}</p>
        ) : null}
      </section>

      {(data.sections?.click?.titleOpportunity || data.sections?.convert?.descriptionOpportunity) && (
        <section className="marketing-section">
          <h2>Click &amp; convert</h2>
          {data.sections?.click?.titleOpportunity ? <p>{data.sections.click.titleOpportunity}</p> : null}
          {data.sections?.convert?.descriptionOpportunity ? (
            <p>{data.sections.convert.descriptionOpportunity}</p>
          ) : null}
          {data.sections?.convert?.ctaHint ? <p>{data.sections.convert.ctaHint}</p> : null}
        </section>
      )}

      <section className="marketing-section">
        <h2>Watch</h2>
        <p>
          {data.sections?.watch?.note ||
            'Recommendations use public packaging signals only — not private retention or CTR analytics.'}
        </p>
      </section>

      <section className="marketing-section">
        <h2>Top 3 actions</h2>
        <ol>
          {actions.map((a) => (
            <li key={a.slice(0, 48)}>{a}</li>
          ))}
        </ol>
      </section>

      <section className="marketing-section">
        <h2>Your #1 thing to fix first</h2>
        <p>{numberOne}</p>
      </section>

      <section className="marketing-section">
        <h2>{data.offer?.headline || 'Get the full YouTubeBooster AI audit'}</h2>
        <p>{data.offer?.body}</p>
        <p>
          <strong>{data.offer?.priceLabel || oneTimePrice || '$9.99 one-time'}</strong>
        </p>
        <Link className="btn btn-primary" to={demoHref} onClick={() => void onEngage()}>
          Continue free audit
        </Link>
      </section>

      <MarketingFooter />
    </main>
  );
}

export default PersonalizedCreatorAuditPage;
