/**
 * Single source of truth for product/site branding.
 * Change here to rename everywhere.
 */
export const BRAND = {
  /** Full product name: "YouTube Booster" */
  name: 'YouTube Booster',
  /** First word for styled wordmark */
  namePart1: 'YouTube',
  /** Second word for styled wordmark (often emphasized) */
  namePart2: 'Booster',
  /** Default meta / SEO tagline */
  tagline: 'AI YouTube Channel Growth Analyzer',
  /** Default page title (home) */
  defaultTitle: 'YouTube Booster – AI YouTube Channel Growth Analyzer',
  /** Base URL for canonical/OG (no trailing slash) */
  siteUrl: 'https://youtubebooster.com',
} as const;

export const BRAND_NAME = BRAND.name;
export const BRAND_TAGLINE = BRAND.tagline;
export const BRAND_DEFAULT_TITLE = BRAND.defaultTitle;
export const SITE_URL = BRAND.siteUrl;
