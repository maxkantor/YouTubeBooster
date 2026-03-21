export type BreadcrumbItem = { name: string; path: string };

export type SearchIntent = 'informational' | 'transactional' | 'navigational';

export type ResolvedSeo = {
  title: string;
  description: string;
  canonicalPath: string;
  /** Meta keywords — optional; use sparingly (Google largely ignores; some engines still read). */
  keywords?: string[];
  noindex?: boolean;
  ogType?: 'website' | 'article';
  /** ISO date for Article */
  articlePublishedTime?: string;
  articleModifiedTime?: string;
  breadcrumbs?: BreadcrumbItem[];
  /** Extra JSON-LD nodes (FAQ, HowTo, Article, …) */
  jsonLd?: Record<string, unknown>[];
};
