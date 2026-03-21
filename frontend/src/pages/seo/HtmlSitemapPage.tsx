import { Link } from 'react-router-dom';

import { BRAND } from '../../config/brand';
import { allProgrammaticAndBlogPaths } from '../../seo/registry';

export function HtmlSitemapPage() {
  const urls = allProgrammaticAndBlogPaths();
  return (
    <main className="page narrow-page seo-page">
      <header className="seo-article-header">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden> / </span>
          <span>HTML sitemap</span>
        </nav>
        <h1>Site map</h1>
        <p className="seo-lead">
          Indexable pages for {BRAND.name} — use with <Link to="/sitemap.xml">XML sitemap</Link> and{' '}
          <Link to="/robots.txt">robots.txt</Link>.
        </p>
      </header>
      <ul className="seo-sitemap-list">
        {urls.map((u) => (
          <li key={u.path}>
            <Link to={u.path}>{u.path}</Link>
            <span className="seo-sitemap-meta">
              {' '}
              priority {u.priority} · {u.changefreq}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
