import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { BRAND } from '../../config/brand';
import { getGrowthGuideByPath, GROWTH_GUIDE_PAGES, type GrowthGuidePageDef } from '../../seo/growthGuides';

function MarkdownLink({
  href,
  children
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!href) {
    return <>{children}</>;
  }
  if (href.startsWith('/')) {
    return <Link to={href}>{children}</Link>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function GrowthGuideShell({ guide }: { guide: GrowthGuidePageDef }) {
  const related = guide.relatedPaths
    .map((path) => getGrowthGuideByPath(path))
    .filter((item): item is GrowthGuidePageDef => Boolean(item));

  return (
    <div className="page narrow-page marketing-static growth-guide-page">
      <main>
        <article className="surface marketing-static-surface growth-guide-surface">
          <nav className="growth-guide-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span className="growth-guide-bc-sep" aria-hidden>
              /
            </span>
            <span className="growth-guide-bc-current">{guide.h1}</span>
          </nav>

          <p className="marketing-static-eyebrow">
            <Link to="/" className="marketing-static-back">
              ← {BRAND.name}
            </Link>
          </p>

          <h1>{guide.h1}</h1>
          <p className="marketing-static-lead">{guide.lead}</p>

          <div className="marketing-static-body growth-guide-body">
            {guide.sections.map((section) => (
              <section key={section.h2} className="seo-section">
                <h2 className="growth-guide-h2">{section.h2}</h2>
                <div className="seo-prose">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>
                    }}
                  >
                    {section.body}
                  </ReactMarkdown>
                </div>
              </section>
            ))}
          </div>

          {guide.faq.length > 0 && (
            <section className="seo-section" aria-labelledby="growth-guide-faq-heading">
              <h2 id="growth-guide-faq-heading">FAQ</h2>
              <dl className="seo-faq">
                {guide.faq.map((item) => (
                  <div key={item.question} className="seo-faq-item">
                    <dt>{item.question}</dt>
                    <dd>{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="growth-guide-related" aria-labelledby="related-guides-heading">
            <h2 className="growth-guide-related-title" id="related-guides-heading">
              Related guides
            </h2>
            <ul className="growth-guide-related-list">
              {related.map((item) => (
                <li key={item.path}>
                  <Link to={item.path} className="growth-guide-related-link">
                    {item.cardTitle}
                  </Link>
                  <p className="growth-guide-related-snippet">{item.teaser}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="growth-guide-cta-panel">
            <h2 className="growth-guide-related-title">Ready to See What&apos;s Blocking Your Growth?</h2>
            <p className="growth-guide-cta-lead">
              No signup required for the preview. Upgrade only if you want the full fix.
            </p>
            <div className="growth-guide-cta-actions">
              <Link to="/#audit" className="btn btn-primary">
                Run Free Channel Audit
              </Link>
              <Link to="/" className="btn btn-secondary growth-guide-cta-secondary">
                Back to home
              </Link>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}

export function GrowthGuideRoutePage() {
  const location = useLocation();
  const guide = getGrowthGuideByPath(location.pathname);
  if (!guide) {
    return <Navigate to="/" replace />;
  }
  return <GrowthGuideShell guide={guide} />;
}
