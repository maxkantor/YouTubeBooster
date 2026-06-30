import { Link } from 'react-router-dom';

import { SeoFunnelCta } from '../../components/SeoFunnelCta';
import { BRAND } from '../../config/brand';
import blogPosts from '../../seo/data/blogPosts.json';

export function BlogIndexPage() {
  const posts = blogPosts as { slug: string; title: string; description: string; datePublished: string }[];
  return (
    <main className="page narrow-page seo-page">
      <header className="seo-article-header">
        <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden> / </span>
          <span>Blog</span>
        </nav>
        <h1>Blog — {BRAND.name}</h1>
        <p className="seo-lead">Long-form guides on YouTube SEO, AI audits, and sustainable channel growth.</p>
      </header>
      <ul className="seo-hub-list">
        {posts.map((p) => (
          <li key={p.slug}>
            <article className="seo-hub-card surface">
              <time dateTime={p.datePublished}>{p.datePublished}</time>
              <h2>
                <Link to={`/blog/${p.slug}`}>{p.title}</Link>
              </h2>
              <p>{p.description}</p>
              <Link to={`/blog/${p.slug}`} className="seo-hub-cta">
                Read article →
              </Link>
            </article>
          </li>
        ))}
      </ul>
      <SeoFunnelCta />
    </main>
  );
}
