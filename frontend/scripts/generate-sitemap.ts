/**
 * Writes public/sitemap.xml and public/robots.txt from the same URL registry as the HTML sitemap (src/seo/registry.ts).
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

const all = allProgrammaticAndBlogPaths();
const lastmod = new Date().toISOString().slice(0, 10);

const urlset = all
  .map(
    (u) => `  <url>
    <loc>${base}${u.path === '/' ? '' : u.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlset}
</urlset>
`;

fs.writeFileSync(path.join(pub, 'sitemap.xml'), sitemap, 'utf8');
console.log('Wrote sitemap.xml with', all.length, 'URLs');

const robots = `User-agent: *
Allow: /

# App surfaces — not for organic search
Disallow: /admin
Disallow: /dashboard
Disallow: /app
Disallow: /auth/
Disallow: /checkout/

# Sitemap
Sitemap: ${base}/sitemap.xml
`;

fs.writeFileSync(path.join(pub, 'robots.txt'), robots, 'utf8');
console.log('Wrote robots.txt');
