import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MarketingFooter } from '../../components/MarketingFooter';
import { trackEvent } from '../../lib/analytics';
import {
  demoChannelData,
  demoDetectedProblems,
  demoRecommendations,
  demoTopVideos
} from '../../demoData';
import { DEFAULT_DEMO_CHANNEL } from '../../lib/demo';
import { usePricing } from '../../PricingContext';

/**
 * Sample paid-report experience using MaxKantorCooking public showcase data.
 * Acquisition asset: shows what the paid unlock looks like without another generic SEO page.
 */
export function SampleReportPage() {
  const { oneTimePrice } = usePricing();

  useEffect(() => {
    trackEvent('sample_report_viewed', { demo_channel: 'maxkantorcooking' });
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
          <Link to={`/demo?channel=${encodeURIComponent(DEFAULT_DEMO_CHANNEL)}`}>Live demo</Link>
        </nav>
      </header>

      <main className="sample-report-main">
        <p className="sample-report-kicker">Sample paid report</p>
        <h1>What the full growth audit looks like</h1>
        <p className="sample-report-lead">
          This sample uses the public MaxKantorCooking showcase so creators can see the shape of a paid report before
          unlocking their own channel. Figures are demo/sample audit data for illustration.
        </p>

        <section className="sample-report-hero-stats" aria-label="Sample channel snapshot">
          <div>
            <span className="sample-report-label">Channel</span>
            <strong>{demoChannelData.channelTitle}</strong>
            <span>{demoChannelData.channelHandle}</span>
          </div>
          <div>
            <span className="sample-report-label">Growth score</span>
            <strong>
              {demoChannelData.growthScore} — {demoChannelData.growthScoreLabel}
            </strong>
            <span>{demoChannelData.scoreExplanation}</span>
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
          <h2>Top public videos used in the sample read</h2>
          <ul className="sample-report-videos">
            {demoTopVideos.map((v) => (
              <li key={v.key}>
                <strong>{v.title}</strong>
                <span>
                  {v.viewCount.toLocaleString()} views · {v.tag}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="sample-report-unlock">
          <h2>Unlock your channel’s full report</h2>
          <p>
            Run the free public preview on your URL first. If the diagnosis is specific, unlock the full fix list for{' '}
            {oneTimePrice} — one-time, not another subscription dashboard.
          </p>
          <div className="sample-report-actions">
            <Link
              className="btn btn-primary btn-lg"
              to="/share"
              onClick={() => trackEvent('sample_report_cta_clicked', { destination: 'share' })}
            >
              Get a mini audit to share
            </Link>
            <Link
              className="btn btn-secondary"
              to="/demo"
              onClick={() => trackEvent('sample_report_cta_clicked', { destination: 'demo' })}
            >
              Open free full preview
            </Link>
            <Link className="btn btn-secondary" to="/pricing">
              Pricing
            </Link>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

export default SampleReportPage;
