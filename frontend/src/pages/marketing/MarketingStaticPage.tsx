import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BRAND } from '../../config/brand';
import { SeoFunnelCta } from '../../components/SeoFunnelCta';

export function MarketingStaticPage({
  title,
  description,
  children,
  showFunnelCta = false
}: {
  title: string;
  description: string;
  children: ReactNode;
  showFunnelCta?: boolean;
}) {
  return (
    <div className="page narrow-page marketing-static">
      <article className="surface marketing-static-surface">
        <p className="marketing-static-eyebrow">
          <Link to="/" className="marketing-static-back">
            ← {BRAND.name}
          </Link>
        </p>
        <h1>{title}</h1>
        <p className="marketing-static-lead">{description}</p>
        <div className="marketing-static-body">{children}</div>
        {showFunnelCta ? <SeoFunnelCta /> : null}
      </article>
    </div>
  );
}
