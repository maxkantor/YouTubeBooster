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
  tagline: 'AI-Powered YouTube Channel Audit & Growth Platform',
  /** Default page title (home) — brand first for navigational / brand searches */
  defaultTitle: 'YouTubeBooster AI | AI-Powered YouTube Channel Audit & Growth Platform',
  /** Home page meta description (SEO + OG) */
  seoHomeDescription:
    'Get an AI-powered YouTube channel audit in minutes. Discover growth opportunities, improve CTR, optimize thumbnails, and increase views with actionable recommendations from YouTubeBooster AI.',
  /** Core positioning — use in footer and trust copy */
  corePositioning:
    'YouTubeBooster AI helps creators understand why their channels are not growing and provides actionable recommendations to improve views, subscribers, click-through rate, retention, and overall channel performance.',
  /** Homepage hero subtitle (below H1/H2) */
  heroSubtitle:
    'AI-powered channel audits that help creators improve views, increase subscribers, optimize CTR, and grow with confidence.',
  /** Base URL for canonical/OG (no trailing slash) — apex only: https://youtubeboosterai.com */
  siteUrl: 'https://youtubeboosterai.com',
} as const;

export const BRAND_NAME = BRAND.name;
export const BRAND_TAGLINE = BRAND.tagline;
export const BRAND_DEFAULT_TITLE = BRAND.defaultTitle;
export const SITE_URL = BRAND.siteUrl;
