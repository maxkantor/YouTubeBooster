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
  /** Default page title (home) */
  defaultTitle: 'YouTubeBooster AI — AI YouTube Channel Audit to Grow Views, CTR & SEO',
  /** Home page meta description (SEO + OG) */
  seoHomeDescription:
    'Analyze any YouTube channel in seconds. Find what is killing your views, fix titles and thumbnails, and uncover growth opportunities with AI-powered channel audits.',
  /** Base URL for canonical/OG (no trailing slash) */
  siteUrl: 'https://youtubeboosterai.com',
} as const;

export const BRAND_NAME = BRAND.name;
export const BRAND_TAGLINE = BRAND.tagline;
export const BRAND_DEFAULT_TITLE = BRAND.defaultTitle;
export const SITE_URL = BRAND.siteUrl;
