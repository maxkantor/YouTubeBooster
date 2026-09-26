import React from 'react';
import { useParams } from 'react-router-dom';

const AuditArticleRoute = React.lazy(() =>
  import('../seo/SeoProgrammaticRoutes').then((m) => ({ default: m.AuditArticleRoute }))
);
const PersonalizedCreatorAuditPage = React.lazy(() =>
  import('./PersonalizedCreatorAuditPage').then((m) => ({ default: m.PersonalizedCreatorAuditPage }))
);

function isOpaqueAuditToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{24,64}$/.test(value);
}

/** Routes opaque outreach tokens to the personalized audit; otherwise SEO audit articles. */
export function AuditSlugOrPersonalizedRoute() {
  const { slug = '' } = useParams();
  if (isOpaqueAuditToken(slug)) {
    return (
      <React.Suspense fallback={<main className="marketing-page"><p>Loading…</p></main>}>
        <PersonalizedCreatorAuditPage />
      </React.Suspense>
    );
  }
  return (
    <React.Suspense fallback={<main className="marketing-page"><p>Loading…</p></main>}>
      <AuditArticleRoute />
    </React.Suspense>
  );
}
