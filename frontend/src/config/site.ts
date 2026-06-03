/**
 * Canonical site URL for SEO (canonical, OG, JSON-LD, sitemap).
 * Override in production with VITE_SITE_URL (e.g. https://youtubeboosterai.com).
 */
import { BRAND } from './brand';

export function getSiteUrl(): string {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const env = viteEnv?.VITE_SITE_URL;
  if (env && /^https?:\/\//i.test(env)) {
    return env.replace(/\/$/, '');
  }
  return BRAND.siteUrl;
}

/** Full URL for a path. Home `/` uses trailing slash (canonical apex). */
export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const SITE_LOCALE = 'en-US';
