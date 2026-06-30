import { Link } from 'react-router-dom';

import { BRAND } from '../config/brand';
import { DEFAULT_DEMO_CHANNEL } from '../lib/demo';

const demoHref = `/demo?channel=${encodeURIComponent(DEFAULT_DEMO_CHANNEL)}`;

/** Conversion funnel CTA for SEO / marketing pages (not the homepage). */
export function SeoFunnelCta() {
  return (
    <div className="growth-guide-cta-panel seo-funnel-cta">
      <h2 className="growth-guide-related-title">Run your free channel audit</h2>
      <p className="growth-guide-cta-lead">
        Paste your channel URL for a free preview, then unlock the full report via Stripe when you are ready.
        New here? Try the live demo on MaxKantorCooking first.
      </p>
      <div className="growth-guide-cta-actions">
        <Link to="/#audit" className="btn btn-primary">
          Analyze your channel
        </Link>
        <Link to={demoHref} className="btn btn-secondary growth-guide-cta-secondary">
          Instant demo (MaxKantorCooking)
        </Link>
        <Link to="/#pricing" className="btn btn-secondary growth-guide-cta-secondary">
          Unlock full report
        </Link>
        <Link to="/" className="btn btn-secondary growth-guide-cta-secondary">
          {BRAND.name} home
        </Link>
      </div>
    </div>
  );
}
