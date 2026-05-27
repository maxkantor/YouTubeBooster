/**
 * Single source of truth for product/site branding.
 * Change here to rename everywhere.
 */
export const BRAND = {
  /** Full product name: "YouTubeBooster AI" */
  name: 'YouTubeBooster AI',
  /** First word for styled wordmark */
  namePart1: 'YouTubeBooster',
  /** Second word for styled wordmark (often emphasized) */
  namePart2: 'AI',
  /** Default meta / SEO tagline */
  tagline: 'AI YouTube Channel Audit & Growth Analyzer',
  /** Default page title (home) — brand first for navigational / brand searches */
  defaultTitle: 'YouTubeBooster AI | AI YouTube Channel Audit & Growth Analyzer',
  /** Home page meta description (SEO + OG) */
  seoHomeDescription:
    'YouTubeBooster AI (YouTube Booster AI) is the official AI YouTube channel audit and growth analyzer. Run a free preview, analyze CTR, titles, thumbnails, SEO, retention, and find why your channel is not growing.',
  /** Base URL for canonical/OG (no trailing slash) — apex only: https://youtubeboosterai.com */
  siteUrl: 'https://youtubeboosterai.com',
} as const;

export const BRAND_NAME = BRAND.name;
export const BRAND_TAGLINE = BRAND.tagline;
export const BRAND_DEFAULT_TITLE = BRAND.defaultTitle;
export const SITE_URL = BRAND.siteUrl;
