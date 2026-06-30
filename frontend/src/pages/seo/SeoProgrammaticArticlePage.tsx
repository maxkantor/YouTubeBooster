import { Link, Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

import { SeoFunnelCta } from '../../components/SeoFunnelCta';
import { BRAND } from '../../config/brand';

export type ProgrammaticSection = { h2: string; body: string };

export type ProgrammaticEntry = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: ProgrammaticSection[];
  faq?: { question: string; answer: string }[];
  related: string[];
  /** Guides only — rendered as HowTo JSON-LD in resolveSeo */
  howTo?: { name: string; description: string; steps: { name: string; text: string }[] };
};

export function SeoProgrammaticArticlePage({
  basePath,
  hubLabel,
  entry,
  allSlugs
}: {
  basePath: '/audit' | '/solutions' | '/guides';
  hubLabel: string;
  entry: ProgrammaticEntry | undefined;
  allSlugs: string[];
}) {
  if (!entry || !allSlugs.includes(entry.slug)) {
    return <Navigate to={basePath} replace />;
  }

  return (
    <main className="page narrow-page seo-page">
      <article itemScope itemType="https://schema.org/Article">
        <header className="seo-article-header">
          <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden> / </span>
            <Link to={basePath}>{hubLabel}</Link>
            <span aria-hidden> / </span>
            <span>{entry.h1}</span>
          </nav>
          <h1 itemProp="headline">{entry.h1}</h1>
          <p className="seo-lead" itemProp="description">
            {entry.intro}
          </p>
        </header>

        {entry.sections.map((s) => (
          <section key={s.h2} className="seo-section">
            <h2>{s.h2}</h2>
            <div className="seo-prose">
              <ReactMarkdown>{s.body}</ReactMarkdown>
            </div>
          </section>
        ))}

        {(entry.faq?.length ?? 0) > 0 && (
          <section className="seo-section" aria-labelledby="faq-heading">
            <h2 id="faq-heading">FAQ</h2>
            <dl className="seo-faq">
              {(entry.faq ?? []).map((f) => (
                <div key={f.question} className="seo-faq-item">
                  <dt>{f.question}</dt>
                  <dd>{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {entry.related.length > 0 && (
          <section className="seo-section" aria-labelledby="related-heading">
            <h2 id="related-heading">Related pages</h2>
            <ul className="seo-related">
              {entry.related.map((href) => (
                <li key={href}>
                  <Link to={href}>{href}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="seo-article-footer">
          <SeoFunnelCta />
          <p className="muted">
            <Link to={basePath}>← Back to {hubLabel}</Link>
          </p>
        </footer>
      </article>
    </main>
  );
}
