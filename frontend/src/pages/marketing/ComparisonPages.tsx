import ReactMarkdown from 'react-markdown';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { SeoFunnelCta } from '../../components/SeoFunnelCta';
import { BRAND } from '../../config/brand';
import { getComparisonByPath, type ComparisonPageDef } from '../../seo/comparisonPageData';

function ComparisonTable({ table }: { table: ComparisonPageDef['featureTable'] }) {
  return (
    <div className="comparison-table-wrap" role="region" aria-label={table.caption}>
      <table className="comparison-table">
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={`${row[0]}-${index}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonShell({ page }: { page: ComparisonPageDef }) {
  return (
    <div className="page narrow-page marketing-static comparison-page">
      <main>
        <article className="surface marketing-static-surface comparison-surface">
          <nav className="growth-guide-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">{BRAND.name}</Link>
            <span className="growth-guide-bc-sep" aria-hidden>
              /
            </span>
            <span className="growth-guide-bc-current">Compare</span>
          </nav>

          <p className="marketing-static-eyebrow">
            <Link to="/" className="marketing-static-back">
              ← {BRAND.name}
            </Link>
          </p>

          <h1>{page.h1}</h1>
          <p className="marketing-static-lead">{page.lead}</p>

          <SeoFunnelCta source={`comparison_top:${page.path}`} />

          <section className="comparison-summary-panel" aria-labelledby="comparison-summary-heading">
            <h2 id="comparison-summary-heading" className="growth-guide-h2">
              Executive summary
            </h2>
            <p className="comparison-summary-text">{page.executiveSummary}</p>
          </section>

          <div className="marketing-static-body comparison-body">
            {page.sections.map((section) => (
              <section key={section.h2} className="seo-section">
                <h2 className="growth-guide-h2">{section.h2}</h2>
                <div className="seo-prose">
                  <ReactMarkdown>{section.body}</ReactMarkdown>
                </div>
              </section>
            ))}
          </div>

          <section className="seo-section" aria-labelledby="feature-comparison-heading">
            <h2 id="feature-comparison-heading" className="growth-guide-h2">
              Feature comparison
            </h2>
            <ComparisonTable table={page.featureTable} />
          </section>

          <section className="seo-section" aria-labelledby="pricing-comparison-heading">
            <h2 id="pricing-comparison-heading" className="growth-guide-h2">
              Pricing comparison
            </h2>
            <ComparisonTable table={page.pricingTable} />
          </section>

          <section className="seo-section" aria-labelledby="pros-cons-heading">
            <h2 id="pros-cons-heading" className="growth-guide-h2">
              Pros and cons
            </h2>
            <div className="comparison-pros-cons-grid">
              {page.prosCons.map((block) => (
                <div key={block.name} className="comparison-pros-cons-card">
                  <h3 className="comparison-pros-cons-title">{block.name}</h3>
                  <p className="comparison-pros-cons-label">Pros</p>
                  <ul className="comparison-list">
                    {block.pros.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="comparison-pros-cons-label">Cons</p>
                  <ul className="comparison-list comparison-list-cons">
                    {block.cons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="seo-section" aria-labelledby="best-for-heading">
            <h2 id="best-for-heading" className="growth-guide-h2">
              Best for different creator types
            </h2>
            <div className="comparison-best-for-grid">
              {page.bestFor.map((item) => (
                <div key={item.audience} className="comparison-best-for-card">
                  <h3 className="comparison-best-for-audience">{item.audience}</h3>
                  <p className="comparison-best-for-pick">
                    <strong>Recommended:</strong> {item.pick}
                  </p>
                  <p className="comparison-best-for-reason">{item.reason}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="seo-section" aria-labelledby="comparison-faq-heading">
            <h2 id="comparison-faq-heading">FAQ</h2>
            <dl className="seo-faq">
              {page.faq.map((item) => (
                <div key={item.question} className="seo-faq-item">
                  <dt>{item.question}</dt>
                  <dd>{item.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          <SeoFunnelCta source={`comparison_bottom:${page.path}`} />
        </article>
      </main>
    </div>
  );
}

export function ComparisonRoutePage() {
  const location = useLocation();
  const page = getComparisonByPath(location.pathname);
  if (!page) {
    return <Navigate to="/" replace />;
  }
  return <ComparisonShell page={page} />;
}
