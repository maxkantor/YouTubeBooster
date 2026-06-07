import { Link } from 'react-router-dom';

import { BRAND } from '../config/brand';
import {
  FOOTER_AUDIT_TOPIC_PAGES,
  FOOTER_COMPARE_PAGES,
  FOOTER_GROWTH_PAGES,
} from '../seo/growthGuides';

type MarketingFooterProps = {
  showFinalCta?: boolean;
};

export function MarketingFooter({ showFinalCta = false }: MarketingFooterProps) {
  return (
    <footer className="landing-site-footer">
      {showFinalCta && (
        <div className="landing-site-footer-cta-shell">
          <div className="container landing-site-footer-cta">
            <p className="landing-site-footer-cta-eyebrow">Free preview first</p>
            <h2 className="landing-site-footer-cta-title">Run Your Free AI Channel Audit</h2>
            <p className="landing-site-footer-cta-copy">
              Preview YouTube SEO, YouTube CTR, thumbnail optimization, retention signals,
              and video packaging issues before you decide to unlock the full report.
            </p>
            <a href="#audit" className="btn btn-primary btn-lg landing-site-footer-cta-button">
              Run Free Channel Audit
            </a>
          </div>
        </div>
      )}
      <div className="landing-site-footer-divider" aria-hidden />
      <div className="container landing-site-footer-inner">
        <div className="landing-site-footer-brand-bar">
          <Link
            to="/"
            className="landing-site-footer-logo brand-link brand-with-play"
            aria-label={`${BRAND.name} home`}
          >
            <span className="brand-play-icon" aria-hidden />
            <span className="landing-logo-yt">{BRAND.namePart1}</span>
            <span className="landing-logo-boost">{BRAND.namePart2}</span>
          </Link>
          <p className="landing-site-footer-tagline">{BRAND.corePositioning}</p>
        </div>

        <nav className="landing-site-footer-nav" aria-label="Footer">
          <div className="landing-site-footer-col">
            <h3 className="landing-site-footer-col-title">Creator Guides</h3>
            <ul className="landing-site-footer-links">
              {FOOTER_GROWTH_PAGES.map((page) => (
                <li key={page.path}>
                  <Link to={page.path}>{page.cardTitle}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-site-footer-col">
            <h3 className="landing-site-footer-col-title">Resources</h3>
            <ul className="landing-site-footer-links">
              {FOOTER_AUDIT_TOPIC_PAGES.map((page) => (
                <li key={page.path}>
                  <Link to={page.path}>{page.cardTitle}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-site-footer-col">
            <h3 className="landing-site-footer-col-title">Platform</h3>
            <ul className="landing-site-footer-links">
              {FOOTER_COMPARE_PAGES.map((page) => (
                <li key={page.path}>
                  <Link to={page.path}>{page.cardTitle}</Link>
                </li>
              ))}
              <li>
                <Link to="/platform">Platform</Link>
              </li>
              <li>
                <Link to="/pricing">Pricing</Link>
              </li>
              <li>
                <Link to="/faq">FAQ</Link>
              </li>
              <li>
                <Link to="/about">About</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
            </ul>
          </div>

          <div className="landing-site-footer-col">
            <h3 className="landing-site-footer-col-title">Legal</h3>
            <ul className="landing-site-footer-links">
              <li>
                <Link to="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link to="/disclaimer">Disclaimer</Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="landing-site-footer-bottom">
        <p className="landing-site-footer-copy">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
