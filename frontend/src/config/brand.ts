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
  tagline: 'AI YouTube Channel Growth Analyzer',
  /** Default page title (home) — "Official Site" signals primary URL for brand/site: queries */
  defaultTitle: 'YouTubeBooster AI — Official Site | YouTube Channel Growth & Audits',
  /** Home page meta description (SEO + OG) */
  seoHomeDescription:
    'Official YouTube Booster AI — analyze your channel, grow views, and fix CTR with AI. The primary home for YouTube growth and channel audits.',
  /** Base URL for canonical/OG (no trailing slash) */
  siteUrl: 'https://youtubeboosterai.com',
} as const;

export const BRAND_NAME = BRAND.name;
export const BRAND_TAGLINE = BRAND.tagline;
export const BRAND_DEFAULT_TITLE = BRAND.defaultTitle;
export const SITE_URL = BRAND.siteUrl;
