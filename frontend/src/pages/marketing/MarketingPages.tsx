import { Link } from 'react-router-dom';
import { BRAND } from '../../config/brand';
import { MarketingStaticPage } from './MarketingStaticPage';

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
  return (
    <MarketingStaticPage
      title="Contact"
      description="Questions about the product, your account, or partnerships—we read every message."
    >
      <p>
        Signed in users should use the same email as their account for billing and access questions. Include your order
        reference when writing about a purchase.
      </p>
      <p className="muted">
        We do not offer phone support. Typical reply time is a few business days.
      </p>
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
