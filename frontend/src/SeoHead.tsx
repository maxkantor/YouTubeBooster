import { useLayoutEffect } from 'react';

import { BRAND, BRAND_DEFAULT_TITLE } from './config/brand';
import { absoluteUrl, getSiteUrl } from './config/site';
import { ROBOTS_INDEX_FOLLOW, ROBOTS_NOINDEX_PRIVATE } from './seo/seoRobots';

const DEFAULT_TITLE = BRAND_DEFAULT_TITLE;
const DEFAULT_DESC = BRAND.seoHomeDescription;

export type SeoProps = {
  title?: string;
  description?: string;
  /** Path only, e.g. /audit/foo — canonical becomes siteUrl + path */
  canonicalPath?: string;
  ogTitle?: string;
  ogDescription?: string;
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
  ogTitle,
  ogDescription,
  ogImage = '/og-image.jpg',
  noindex,
  keywords,
  ogType = 'website',
  articlePublishedTime,
  articleModifiedTime
}: SeoProps) {
  // useLayoutEffect: update <head> before paint so canonical/OG match the current route immediately.
  useLayoutEffect(() => {
    document.title = title;
    setMeta('description', description);

    const site = getSiteUrl();
    const path =
      canonicalPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    const normalized = path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
    const canonicalHref =
      normalized === '/' ? `${site}/` : `${site}${normalized}`;

    // OG/Twitter images use canonical apex origin (matches deployed host after redirects).
    const imageUrl = ogImage.startsWith('http') ? ogImage : `${site}${ogImage.startsWith('/') ? ogImage : `/${ogImage}`}`;
    const isDefaultOgJpeg =
      ogImage === '/og-image.jpg' || ogImage.endsWith('/og-image.jpg') || imageUrl.endsWith('/og-image.jpg');

    const resolvedOgTitle = ogTitle ?? title;
    const resolvedOgDescription = ogDescription ?? description;
    setMeta('og:title', resolvedOgTitle, true);
    setMeta('og:description', resolvedOgDescription, true);
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
    setMeta('twitter:title', resolvedOgTitle);
    setMeta('twitter:description', resolvedOgDescription);

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

    document.querySelectorAll('link[rel="canonical"]').forEach((existing) => existing.remove());
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
    link.setAttribute('href', canonicalHref);

    // Public: explicit index, follow (Google). Private: noindex, nofollow only for /admin, /auth, /dashboard, /checkout, /payment, /app.
    const robots = noindex === true ? ROBOTS_NOINDEX_PRIVATE : ROBOTS_INDEX_FOLLOW;
    setMeta('robots', robots);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'en';
    }
  }, [
    title,
    description,
    canonicalPath,
    ogTitle,
    ogDescription,
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
