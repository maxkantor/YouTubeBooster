import { Link } from 'react-router-dom';

import { BRAND } from '../../config/brand';

export type HubItem = { slug: string; title: string; description: string };

export function SeoHubPage({
  title,
  intro,
  basePath,
  items
}: {
  title: string;
  intro: string;
  basePath: '/audit' | '/solutions' | '/guides';
  items: HubItem[];
}) {
  return (
    <main className="page narrow-page seo-page">
      <header className="seo-article-header">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden> / </span>
          <span>{title.replace(` – ${BRAND.name}`, '')}</span>
        </nav>
        <h1>{title.split(' | ')[0]}</h1>
        <p className="seo-lead">{intro}</p>
      </header>
      <ul className="seo-hub-list">
        {items.map((it) => (
          <li key={it.slug}>
            <article className="seo-hub-card surface">
              <h2>
                <Link to={`${basePath}/${it.slug}`}>{it.title.split(' | ')[0]}</Link>
              </h2>
              <p>{it.description}</p>
              <Link to={`${basePath}/${it.slug}`} className="seo-hub-cta">
                Read more →
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
