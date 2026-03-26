/**
 * Generates public/sitemap.xml and public/robots.txt from the same URL registry as the app.
 * Run: npm run build:seo (or npm run build, which runs this first).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, '..', 'public');
const siteUrl = process.env.SEO_SITE_URL || 'https://youtubeboosterai.com';
const base = siteUrl.replace(/\/$/, '');

const staticPaths = [
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
  { path: '/blog', changefreq: 'weekly', priority: 0.9 },
  { path: '/why-your-youtube-has-no-views', changefreq: 'monthly', priority: 0.82 },
  { path: '/how-to-get-more-youtube-views', changefreq: 'monthly', priority: 0.82 },
  { path: '/youtube-thumbnail-mistakes', changefreq: 'monthly', priority: 0.82 },
  { path: '/site-map', changefreq: 'monthly', priority: 0.4 }
];

function readJson(name) {
  const p = path.join(__dirname, '..', 'src', 'seo', 'data', name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const audits = readJson('audits.json');
const solutions = readJson('solutions.json');
const guides = readJson('guides.json');
const blogPosts = readJson('blogPosts.json');

const dynamic = [
  ...audits.map((a) => ({ path: `/audit/${a.slug}`, changefreq: 'monthly', priority: 0.75 })),
  ...solutions.map((a) => ({ path: `/solutions/${a.slug}`, changefreq: 'monthly', priority: 0.75 })),
  ...guides.map((a) => ({ path: `/guides/${a.slug}`, changefreq: 'monthly', priority: 0.75 })),
  ...blogPosts.map((a) => ({ path: `/blog/${a.slug}`, changefreq: 'monthly', priority: 0.8 }))
];

const all = [...staticPaths, ...dynamic];

const urlset = all
  .map(
    (u) => `  <url>
    <loc>${base}${u.path === '/' ? '' : u.path}</loc>
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

# Sitemap
Sitemap: ${base}/sitemap.xml
`;

fs.writeFileSync(path.join(pub, 'robots.txt'), robots, 'utf8');
console.log('Wrote robots.txt');
