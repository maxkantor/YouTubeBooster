/**
 * Writes public/sitemap.xml and public/robots.txt (canonical apex: https://youtubeboosterai.com).
 * Run: npm run build:seo (or npm run build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRAND } from '../src/config/brand';
import { allProgrammaticAndBlogPaths } from '../src/seo/registry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, '..', 'public');
const base = (process.env.SEO_SITE_URL || BRAND.siteUrl).replace(/\/$/, '');

const raw = allProgrammaticAndBlogPaths();
const seen = new Set<string>();
const all = raw.filter((u) => {
  const p = u.path === '' ? '/' : u.path.startsWith('/') ? u.path : `/${u.path}`;
  if (seen.has(p)) return false;
  seen.add(p);
  return true;
});

function locForPath(path: string): string {
  if (path === '/') return `${base}/`;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function priorityFor(u: { path: string; priority: number }): string {
  if (u.path === '/') return '1.0';
  return String(u.priority);
}

const urlBlocks = all
  .map((u) => {
    const loc = locForPath(u.path);
    const pr = priorityFor(u);
    return `  <url>
    <loc>${loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${pr}</priority>
  </url>`;
  })
  .join('\n\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <!-- Core & indexable pages -->
${urlBlocks}

</urlset>
`;

fs.writeFileSync(path.join(pub, 'sitemap.xml'), sitemap, 'utf8');
console.log('Wrote sitemap.xml with', all.length, 'URLs');

const robots = `User-agent: *
Allow: /

# Block admin/private areas
Disallow: /admin
Disallow: /api
Disallow: /payment-success
Disallow: /payment-cancel

# Sitemap
Sitemap: https://youtubeboosterai.com/sitemap.xml
`;

fs.writeFileSync(path.join(pub, 'robots.txt'), robots, 'utf8');
console.log('Wrote robots.txt');
