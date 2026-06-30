import { Link, Navigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

import { SeoFunnelCta } from '../../components/SeoFunnelCta';
import blogPosts from '../../seo/data/blogPosts.json';

type Post = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified: string;
  keywords: string[];
  sections: { h2: string; body: string }[];
  faq: { question: string; answer: string }[];
};

export function BlogPostPage() {
  const { slug = '' } = useParams();
  const posts = blogPosts as Post[];
  const post = posts.find((p) => p.slug === slug);
  if (!post) return <Navigate to="/blog" replace />;

  return (
    <main className="page narrow-page seo-page">
      <article itemScope itemType="https://schema.org/BlogPosting">
        <header className="seo-article-header">
          <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden> / </span>
            <Link to="/blog">Blog</Link>
            <span aria-hidden> / </span>
            <span>{post.title}</span>
          </nav>
          <time dateTime={post.datePublished} itemProp="datePublished">
            {post.datePublished}
          </time>
          {post.dateModified !== post.datePublished && (
            <time dateTime={post.dateModified} itemProp="dateModified" className="seo-muted-time">
              {' '}
              · Updated {post.dateModified}
            </time>
          )}
          <h1 itemProp="headline">{post.title}</h1>
          <p className="seo-lead" itemProp="description">
            {post.description}
          </p>
        </header>

        {post.sections.map((s) => (
          <section key={s.h2} className="seo-section">
            <h2>{s.h2}</h2>
            <div className="seo-prose">
              <ReactMarkdown>{s.body}</ReactMarkdown>
            </div>
          </section>
        ))}

        {post.faq.length > 0 && (
          <section className="seo-section" aria-labelledby="blog-faq">
            <h2 id="blog-faq">FAQ</h2>
            <dl className="seo-faq">
              {post.faq.map((f) => (
                <div key={f.question} className="seo-faq-item">
                  <dt>{f.question}</dt>
                  <dd>{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <SeoFunnelCta />
        <p className="seo-article-footer">
          <Link to="/blog">← Back to blog</Link>
        </p>
      </article>
    </main>
  );
}
