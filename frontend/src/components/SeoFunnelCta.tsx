import { Link } from 'react-router-dom';

import { BRAND } from '../config/brand';
import { SeoAuditEntryForm } from './SeoAuditEntryForm';

/** Conversion funnel CTA for SEO / marketing pages (not the homepage). */
export function SeoFunnelCta({ source = 'seo_funnel_cta' }: { source?: string }) {
  return (
    <div className="growth-guide-cta-panel seo-funnel-cta">
      <h2 className="growth-guide-related-title">Run your free channel audit</h2>
      <p className="growth-guide-cta-lead">
        Paste your channel URL for a free preview, then unlock the full report when you are ready. No
        detour to the homepage — start here.
      </p>
      <SeoAuditEntryForm source={source} />
      <div className="growth-guide-cta-actions seo-funnel-cta-secondary-row">
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
