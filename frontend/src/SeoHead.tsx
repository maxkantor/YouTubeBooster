import { useEffect } from 'react';

import { BRAND_DEFAULT_TITLE } from './config/brand';
import { absoluteUrl, getSiteUrl } from './config/site';

const DEFAULT_TITLE = BRAND_DEFAULT_TITLE;
const DEFAULT_DESC = `Analyze any YouTube channel with AI and discover SEO gaps, weak titles, traffic leaks, and hidden growth opportunities.`;

function getOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export type SeoProps = {
  title?: string;
  description?: string;
  /** Path only, e.g. /audit/foo — canonical becomes siteUrl + path */
  canonicalPath?: string;
  ogImage?: string;
  noindex?: boolean;
  keywords?: string[];
  ogType?: 'website' | 'article';
  articlePublishedTime?: string;
  articleModifiedTime?: string;
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

function removeMeta(nameOrProperty: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  const el = document.querySelector(`meta[${attr}="${nameOrProperty}"]`);
  el?.remove();
}

export function SeoHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  canonicalPath,
  ogImage = '/og-image.jpg',
  noindex,
  keywords,
  ogType = 'website',
  articlePublishedTime,
  articleModifiedTime
}: SeoProps) {
  useEffect(() => {
    document.title = title;
    setMeta('description', description);

    const site = getSiteUrl();
    const origin = getOrigin() || site;
    const path = canonicalPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    const normalized = path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
    const canonicalHref = `${site}${normalized === '/' ? '' : normalized}` || `${site}/`;

    const imageUrl = ogImage.startsWith('http') ? ogImage : `${origin}${ogImage.startsWith('/') ? ogImage : `/${ogImage}`}`;
    const isDefaultOgJpeg =
      ogImage === '/og-image.jpg' || ogImage.endsWith('/og-image.jpg') || imageUrl.endsWith('/og-image.jpg');

    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', ogType, true);
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

    if (articlePublishedTime) setMeta('article:published_time', articlePublishedTime, true);
    else removeMeta('article:published_time', true);
    if (articleModifiedTime) setMeta('article:modified_time', articleModifiedTime, true);
    else removeMeta('article:modified_time', true);

    if (keywords?.length) setMeta('keywords', keywords.join(', '));
    else {
      const k = document.querySelector('meta[name="keywords"]');
      k?.remove();
    }

    const verification = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION as string | undefined;
    if (verification) setMeta('google-site-verification', verification);

    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonicalHref);

    const robots = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    setMeta('robots', robots);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'en';
    }
  }, [
    title,
    description,
    canonicalPath,
    ogImage,
    noindex,
    keywords,
    ogType,
    articlePublishedTime,
    articleModifiedTime
  ]);

  return null;
}

/** Absolute URL for OG image in static HTML (build-time). */
export function defaultOgImageAbsolute(): string {
  return absoluteUrl('/og-image.jpg');
}
