/**
 * Central place for indexability / robots policy.
 *
 * Public marketing pages default to indexable; only private app surfaces use noindex.
 *
 * ---
 * POST-DEPLOY VERIFICATION (run after each SEO-related change):
 * 1. `rg -n "noindex|nofollow" frontend/src` — only this file + SeoHead + resolveSeo (not-found) should mention them.
 * 2. `npm run build` then open `frontend/dist/index.html` — confirm `<meta name="robots" content="index, follow">`.
 * 3. On production: View Source on `/` — robots meta must be `index, follow` (until client hydrates, static HTML applies).
 * 4. DevTools → Network → document — confirm no `X-Robots-Tag: noindex` on public URLs (Amplify/Lambda rarely add this).
 * 5. Google Search Console → URL Inspection → request indexing for `/` after deploy.
 * ---
 */

/** Shipped in <meta name="robots"> for all public, indexable routes. */
export const ROBOTS_INDEX_FOLLOW = 'index, follow';

/** Private surfaces only (admin, account, checkout, payment, auth). */
export const ROBOTS_NOINDEX_PRIVATE = 'noindex, nofollow';

/**
 * Routes that must not appear in Google with session/account/checkout context.
 * Does NOT include public marketing URLs (/, /blog, /audit, …).
 */
export function isPrivateNoIndexPath(pathname: string): boolean {
  const p = pathname.replace(/\/$/, '') || '/';
  if (p.startsWith('/admin')) return true;
  if (p.startsWith('/dashboard')) return true;
  if (p.startsWith('/auth')) return true;
  if (p === '/signin') return true;
  if (p === '/signup') return true;
  if (p.startsWith('/account')) return true;
  if (p.startsWith('/app')) return true;
  if (p.startsWith('/api')) return true;
  if (p.startsWith('/checkout')) return true;
  if (p.startsWith('/payment')) return true;
  return false;
}
