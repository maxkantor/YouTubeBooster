import { useEffect } from 'react';

import { BRAND_DEFAULT_TITLE } from './config/brand';

const DEFAULT_TITLE = BRAND_DEFAULT_TITLE;
const DEFAULT_DESC = `Analyze any YouTube channel with AI and discover SEO gaps, weak titles, traffic leaks, and hidden growth opportunities.`;

function getSiteUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export type SeoProps = {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  noindex?: boolean;
};

function setMeta(nameOrProperty: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, nameOrProperty);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function SeoHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  canonical,
  ogImage = '/og-image.jpg',
  noindex
}: SeoProps) {
  useEffect(() => {
    document.title = title;
    setMeta('description', description);
    const url = getSiteUrl();
    const canonicalHref = canonical ? (canonical.startsWith('http') ? canonical : `${url}${canonical}`) : url + '/';
    const imageUrl = ogImage.startsWith('http') ? ogImage : `${url}${ogImage}`;
    const isDefaultOgJpeg =
      ogImage === '/og-image.jpg' || ogImage.endsWith('/og-image.jpg') || imageUrl.endsWith('/og-image.jpg');

    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'website', true);
    setMeta('og:url', canonicalHref, true);
    setMeta('og:image', imageUrl, true);
    if (isDefaultOgJpeg) {
      setMeta('og:image:width', '1200', true);
      setMeta('og:image:height', '630', true);
      setMeta('og:image:type', 'image/jpeg', true);
    }
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:image', imageUrl);
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);

    let link = document.querySelector('link[rel="canonical"]');
    if (canonical || !link) {
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', canonicalHref);
    }

    if (noindex) setMeta('robots', 'noindex,nofollow');
  }, [title, description, canonical, ogImage, noindex]);

  return null;
}
