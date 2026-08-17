import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MarketingFooter } from '../../components/MarketingFooter';
import { SeoAuditEntryForm } from '../../components/SeoAuditEntryForm';
import { trackEvent } from '../../lib/analytics';
import { demoDetectedProblems, demoRecommendations, demoTopVideos } from '../../demoData';
import { usePricing } from '../../PricingContext';

const SAMPLE_UTM = {
  utm_source: 'sample_report',
  utm_medium: 'product',
  utm_campaign: 'creator_acquisition'
} as const;

/**
 * Sanitized sample of the paid report. Illustrative cooking-niche data only —
 * not a live customer audit and not a claim that a named creator was reviewed.
 */
export function SampleReportPage() {
  const { oneTimePrice } = usePricing();

  useEffect(() => {
    document.title = 'Sample YouTube growth audit | YouTubeBooster AI';
    trackEvent('sample_report_view', { surface: 'sample_report' });
    trackEvent('sample_report_viewed', { surface: 'sample_report' });
  }, []);

  return (
    <div className="page marketing-page sample-report-page">
      <header className="marketing-topbar">
        <Link to="/" className="brand-link">
          YouTubeBooster AI
        </Link>
        <nav className="marketing-topnav">
          <Link to="/share">Mini audit</Link>
          <Link to="/pricing">Pricing</Link>
        </nav>
      </header>

      <main className="sample-report-main">
        <p className="sample-report-kicker">Sanitized sample — not a live creator audit</p>
        <h1>See the paid growth audit, then run yours</h1>
        <p className="sample-report-lead">
          Illustrative cooking-niche sample so you can see the shape of a one-time paid report. Figures are
          sanitized demo data. This page does not claim a real creator was audited or purchased.
        </p>

        <section className="sample-report-start" aria-label="Start a real channel audit">
          <h2 className="sample-report-cta-title">Audit my channel</h2>
          <p className="sample-report-cta-lead">
            Paste a public YouTube channel URL or @handle. Free preview — no signup. One-time full report{' '}
            {oneTimePrice} if you unlock later.
          </p>
          <SeoAuditEntryForm
            source="sample_report"
            submitLabel="Audit my channel"
            extraSearchParams={SAMPLE_UTM}
            onAuditClick={() =>
              trackEvent('sample_report_audit_click', {
                destination: 'demo',
                ...SAMPLE_UTM
              })
            }
          />
        </section>

        <section className="sample-report-hero-stats" aria-label="Illustrative sample snapshot">
          <div>
            <span className="sample-report-label">Sample channel</span>
            <strong>Illustrative cooking channel</strong>
            <span>Sanitized niche example — not a named customer</span>
          </div>
          <div>
            <span className="sample-report-label">Sample growth score</span>
            <strong>71 — GOOD</strong>
            <span>Momentum with packaging and search issues slowing growth (illustrative).</span>
          </div>
        </section>

        <section className="sample-report-grid">
          <div>
            <h2>Priority problems (sample)</h2>
            <ul>
              {demoDetectedProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>What you’d fix first (sample)</h2>
            <ul>
              {demoRecommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2>Example video packaging (illustrative titles)</h2>
          <ul className="sample-report-videos">
            {demoTopVideos.map((v) => (
              <li key={v.key}>
                <strong>{v.title}</strong>
                <span>
                  {v.viewCount.toLocaleString()} views · {v.tag} (sample)
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sample-report-unlock">
          <h2>Unlock the full report for your channel</h2>
          <p>
            The sample above is the paid-report shape: priority issues, first fixes, and packaging evidence. Run the
            free preview on your URL, then unlock the full list for {oneTimePrice} — one-time, not a subscription.
          </p>
          <div className="sample-report-actions">
            <Link className="btn btn-secondary" to="/pricing">
              Pricing
            </Link>
            <Link className="btn btn-secondary" to="/share">
              Mini audit to share
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

export default SampleReportPage;
