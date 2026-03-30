/**
 * Canonical site URL for SEO (canonical, OG, JSON-LD, sitemap).
 * Override in production with VITE_SITE_URL (e.g. https://www.youtubeboosterai.com).
 */
import { BRAND } from './brand';

export function getSiteUrl(): string {
  const env = import.meta.env.VITE_SITE_URL as string | undefined;
  if (env && /^https?:\/\//i.test(env)) {
    return env.replace(/\/$/, '');
  }
  return BRAND.siteUrl;
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path || path === '/') return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const SITE_LOCALE = 'en-US';
