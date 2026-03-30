# SEO system (YouTube Booster frontend)

Production-oriented SEO for the **Vite + React SPA**. This doc describes what is automated in-repo, how to operate it, and what requires **additional infrastructure** (SSR/prerender, backend jobs, Google APIs).

## Architecture

| Layer | Location | Purpose |
|--------|----------|---------|
| Site URL + absolutes | `frontend/src/config/site.ts` | `getSiteUrl()`, `absoluteUrl()` from `VITE_SITE_URL` |
| Per-route SEO | `frontend/src/seo/resolveSeo.ts` | Title, description, canonical path, keywords, `noindex`, OG/article fields, JSON-LD graph inputs |
| Structured data | `frontend/src/seo/jsonLd.ts`, `frontend/src/components/StructuredData.tsx` | JSON-LD `@graph` (Organization, WebSite, SoftwareApplication, Product, BreadcrumbList, FAQPage, Article, HowTo, etc.) |
| Head tags | `frontend/src/SeoHead.tsx` | `<title>`, meta description, canonical, robots, OG/Twitter |
| Programmatic + blog content | `frontend/src/seo/data/*.json` | Audits, solutions, guides, blog posts (scalable data source) |
| Pages | `frontend/src/pages/seo/*`, blog pages | Semantic HTML, H1–H3, internal links, FAQ blocks for schema |
| HTML sitemap | `frontend/src/pages/seo/HtmlSitemapPage.tsx`, `frontend/src/seo/registry.ts` | Crawl + UX; shallow links to indexable routes |
| Build-time crawl files | `frontend/scripts/generate-sitemap.ts` | Writes `public/sitemap.xml` + `public/robots.txt` (URLs from `registry.ts`, base URL from `BRAND.siteUrl` or `SEO_SITE_URL`) |
| Code splitting | `frontend/vite.config.ts` | `manualChunks` for React, router, markdown |

**First load:** `index.html` ships static title/description/canonical/OG/JSON-LD for `/`. **Client navigations:** `SeoHead` + `StructuredData` update the document for each route.

## Environment variables

### Runtime (Vite — prefix `VITE_`)

| Variable | Purpose |
|----------|---------|
| `VITE_SITE_URL` | Canonical site origin (e.g. `https://youtubebooster.com`). Used for absolute URLs in meta, JSON-LD, sharing. |
| `VITE_GA4_MEASUREMENT_ID` | Google Analytics 4 (e.g. `G-XXXXXXXXXX`). |
| `VITE_GOOGLE_SITE_VERIFICATION` | Optional `<meta name="google-site-verification">` for Search Console domain verification. |

Copy from `frontend/.env.example` into `.env` / deployment env.

### Build (`generate-sitemap.ts`)

| Variable | Purpose |
|----------|---------|
| `SEO_SITE_URL` | Optional override for `sitemap.xml` / `robots.txt` absolute URLs. Default: `BRAND.siteUrl` in `frontend/src/config/brand.ts`. Set in CI if it must differ from the repo default. |

**Align** `SEO_SITE_URL` (build) with `VITE_SITE_URL` (runtime) for the same deployment.

## Adding scalable pages

1. **Data:** Add an entry to the right JSON under `frontend/src/seo/data/` (`audits.json`, `solutions.json`, `guides.json`, `blogPosts.json`).
2. **Registry:** If the URL should appear on the HTML sitemap, add the path pattern to `frontend/src/seo/registry.ts` (static paths) or ensure the dynamic slug is covered by existing hub listing logic.
3. **Resolve:** `resolveSeo.ts` already maps `/audit/:slug`, `/solutions/:slug`, `/guides/:slug`, `/blog/:slug` from JSON—extend types if you add new fields.
4. **Build:** Run `npm run build` (runs `build:seo` → regenerates `sitemap.xml` + `robots.txt`).

For **hundreds/thousands** of pages, prefer generating JSON from a CMS, spreadsheet, or pipeline; keep the same shape expected by `resolveSeo` and the page components.

## `robots.txt` and XML sitemap

- **Generated:** `frontend/public/robots.txt` and `frontend/public/sitemap.xml` on `npm run build:seo` (or full `npm run build`).
- **Submit in Google Search Console:** Property → Sitemaps → add `https://<your-domain>/sitemap.xml`.

Tune `Disallow` / crawl rules in `scripts/generate-sitemap.ts` if you add admin or non-indexable areas.

## Google Search Console & indexing

- **Verification:** Use DNS or HTML file, or set `VITE_GOOGLE_SITE_VERIFICATION`.
- **Sitemap:** Submit as above.
- **Indexing API:** Google’s Indexing API is intended for **job posting / video** use cases in practice; for normal URLs, **sitemap + quality signals** is the standard path. **Automated “ping” for every URL** at scale typically needs a **trusted backend** with service account setup and rate limits—out of scope for the static SPA alone.

## Structured data (Rich results)

- Injected as one `application/ld+json` script with a **`@graph`** where applicable.
- Validate with [Rich Results Test](https://search.google.com/test/rich-results) and schema.org linting.
- Per-page composition is driven by `resolveSeo` + page type (FAQ sections feed FAQPage, articles feed Article, etc.).

## Analytics (GA4)

Set `VITE_GA4_MEASUREMENT_ID`. The app wires measurement ID for page-level and custom events where implemented—extend `gtag` usage for scroll depth, CTA clicks, and conversion paths as product requirements grow.

## Performance & Core Web Vitals

- **Lazy routes:** App uses route-based code splitting.
- **Images:** Use `loading="lazy"` and modern formats (WebP/AVIF) in content; hero/LCP images should **not** be lazy-loaded.
- **Critical CSS / CDN:** Deploy `dist/` behind **CloudFront** (or similar): compression, HTTP/2, caching, optional edge headers.

**SPA caveat:** Google can render JS, but for **maximum** SEO parity and fastest LCP for crawlers/users, consider **SSG/prerender** (e.g. Vite plugin) or **SSR** for marketing URLs—plan as a separate milestone.

## What is not fully automated in this repo

The following need **external services or backend** work:

- Full **SSR/SSG** for all marketing pages
- **Google Indexing API** batch jobs with service account
- **AI bulk content** generation at scale (OpenAI/Batch jobs + review workflow)
- **Keyword clustering / NLP** beyond curated `keywords[]` in JSON
- **Headline A/B** testing infrastructure
- **Backlink acquisition** (organic outreach)—OG/embeds support *shareability*, not guaranteed links

## Related files

- `frontend/README.md` — OG image workflow, `SeoHead` behavior
- `frontend/src/seo/` — SEO resolution and JSON-LD builders
- `frontend/scripts/generate-sitemap.ts` — sitemap + robots generation
