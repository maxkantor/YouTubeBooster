/**
 * Single list of indexable public paths for sitemap + HTML sitemap (keep in sync with routes).
 */
import audits from './data/audits.json';
import blogPosts from './data/blogPosts.json';
import guides from './data/guides.json';
import { GROWTH_GUIDE_PAGES } from './growthGuides';
import solutions from './data/solutions.json';

const ROOT_GROWTH_GUIDE_PATHS = GROWTH_GUIDE_PAGES.map((page) => ({
  path: page.path,
  changefreq: 'monthly',
  priority: 0.82
}));

export const STATIC_INDEXABLE_PATHS: { path: string; changefreq: string; priority: number }[] = [
  { path: '/', changefreq: 'weekly', priority: 1 },
  { path: '/demo', changefreq: 'weekly', priority: 0.95 },
  { path: '/about', changefreq: 'monthly', priority: 0.55 },
  { path: '/contact', changefreq: 'monthly', priority: 0.55 },
  { path: '/privacy', changefreq: 'yearly', priority: 0.45 },
  { path: '/disclaimer', changefreq: 'yearly', priority: 0.45 },
  { path: '/platform', changefreq: 'monthly', priority: 0.6 },
  { path: '/audit', changefreq: 'weekly', priority: 0.85 },
  { path: '/solutions', changefreq: 'weekly', priority: 0.85 },
  { path: '/guides', changefreq: 'weekly', priority: 0.85 },
  { path: '/blog', changefreq: 'weekly', priority: 0.72 },
  ...ROOT_GROWTH_GUIDE_PATHS,
  { path: '/site-map', changefreq: 'monthly', priority: 0.4 }
];

export function allProgrammaticAndBlogPaths(): { path: string; changefreq: string; priority: number }[] {
  const a = (audits as { slug: string }[]).map((x) => ({
    path: `/audit/${x.slug}`,
    changefreq: 'monthly',
    priority: 0.75
  }));
  const s = (solutions as { slug: string }[]).map((x) => ({
    path: `/solutions/${x.slug}`,
    changefreq: 'monthly',
    priority: 0.75
  }));
  const g = (guides as { slug: string }[]).map((x) => ({
    path: `/guides/${x.slug}`,
    changefreq: 'monthly',
    priority: 0.75
  }));
  const b = (blogPosts as { slug: string }[]).map((x) => ({
    path: `/blog/${x.slug}`,
    changefreq: 'monthly',
    priority: 0.8
  }));
  return [...STATIC_INDEXABLE_PATHS, ...a, ...s, ...g, ...b];
}
