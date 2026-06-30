/**
 * Creates route-specific HTML documents in dist/ after Vite builds the SPA.
 *
 * The React UI still hydrates normally from #root. This only gives crawlers,
 * SEO tools, and social preview bots route-specific head tags and no-JS
 * fallback content instead of the generic SPA shell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRAND } from '../src/config/brand';
import { getSiteUrl } from '../src/config/site';
import audits from '../src/seo/data/audits.json';
import blogPosts from '../src/seo/data/blogPosts.json';
import guides from '../src/seo/data/guides.json';
import solutions from '../src/seo/data/solutions.json';
import { getComparisonByPath } from '../src/seo/comparisonPageData';
import { getGrowthGuideByPath, HOMEPAGE_GUIDE_GROUPS } from '../src/seo/growthGuides';
import { HOMEPAGE_FAQS } from '../src/seo/homepageFaq';
import { allProgrammaticAndBlogPaths } from '../src/seo/registry';
import { resolveSeoForPath } from '../src/seo/resolveSeo';

type SeoSection = { h2: string; body: string };
type SeoFaq = { question: string; answer: string };
type ProgrammaticEntry = {
  slug: string;
  title: string;
  description: string;
  h1?: string;
  intro?: string;
  sections?: SeoSection[];
  faq?: SeoFaq[];
  related?: string[];
};
type BlogEntry = {
  slug: string;
  title: string;
  description: string;
  sections?: SeoSection[];
  faq?: SeoFaq[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const site = getSiteUrl();
const ogImage = `${site}/og-image.jpg`;

const HOME_COMPARISON_LINKS = [
  { href: '/compare/tubebuddy-vs-youtubebooster-ai', label: 'TubeBuddy vs YouTubeBooster AI' },
  { href: '/compare/vidiq-vs-youtubebooster-ai', label: 'vidIQ vs YouTubeBooster AI' }
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_`>]/g, '')
    .trim();
}

function canonicalFor(pathname: string): string {
  return pathname === '/' ? `${site}/` : `${site}${pathname}`;
}

function urlFor(pathname: string): string {
  return pathname === '/' ? `${site}/` : `${site}${pathname}`;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, '') || '/';
}

function findProgrammatic(
  pathname: string,
  prefix: '/audit/' | '/solutions/' | '/guides/',
  entries: ProgrammaticEntry[]
): ProgrammaticEntry | undefined {
  if (!pathname.startsWith(prefix)) return undefined;
  const slug = pathname.slice(prefix.length);
  return entries.find((entry) => entry.slug === slug);
}

function findBlog(pathname: string): BlogEntry | undefined {
  if (!pathname.startsWith('/blog/')) return undefined;
  const slug = pathname.slice('/blog/'.length);
  return (blogPosts as BlogEntry[]).find((entry) => entry.slug === slug);
}

function coreContent(pathname: string): {
  h1: string;
  lead: string;
  sections: SeoSection[];
  links: { href: string; label: string }[];
  faq?: SeoFaq[];
} {
  const commonLinks = [
    { href: '/', label: 'Home' },
    { href: '/demo', label: 'Analyze your channel' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/guides', label: 'Guides' },
    { href: '/blog', label: 'Blog' }
  ];

  switch (pathname) {
    case '/':
      return {
        h1: BRAND.name,
        lead: BRAND.heroSubtitle,
        sections: [
          {
            h2: BRAND.tagline,
            body:
              "See what's limiting CTR, retention, and search visibility — from public YouTube data. Analyze Your Channel. See Instant Demo. Primary path: audit your channel. Instant demo shows the full product on MaxKantorCooking. Free preview before you unlock the full report. Public YouTube data — no Studio login. Secure checkout via Stripe. One-time payment — no subscription."
          },
          {
            h2: 'Run your free channel audit now',
            body:
              'Paste your channel URL or @handle to get an AI growth breakdown with your highest-impact next steps. New here? Try the live demo on MaxKantorCooking first. Examples: https://youtube.com/@channelname or @channelname. Want a quick sample first? Open the instant demo.'
          },
          {
            h2: 'Product dashboard preview',
            body:
              'Add your channel URL in the audit section above to load your live dashboard preview. The dashboard preview includes a Channel Health Score, CTR, retention and SEO signal composite, subscribers, total views, videos, engagement rate, and top performing videos when channel data is available.'
          },
          {
            h2: 'Real Creator Growth Problems We Analyze',
            body:
              'Examples of the actual issues preventing small YouTube channels from growing. Low CTR: your videos appear in search and browse, but thumbnails and titles are not earning clicks. Weak Retention: people click but leave early because intros, pacing, or packaging lose attention. Search Visibility: your content may be targeting topics with low discoverability or poor keyword alignment.'
          },
          {
            h2: 'AI Growth Studio on AWS Bedrock',
            body:
              'AI Growth Studio helps turn your audit into creator-ready recommendations. It supports title ideas, keyword direction, thumbnail strategy, packaging review, and a practical growth plan after the free audit preview.'
          },
          {
            h2: 'Your personalized growth plan',
            body:
              'Preview what unlocks after your free audit — titles, keywords, and thumbnail strategy tailored to your channel. The full report can include title rewrites, keyword opportunities, thumbnail strategy, AI Growth Studio guidance, and saved report access.'
          },
          {
            h2: 'Built by a Real Creator, for Real YouTube Growth',
            body:
              'YouTubeBooster AI is designed for creators who are tired of guessing. It reviews your channel like a growth consultant and gives you practical fixes for titles, thumbnails, SEO, packaging, and content strategy. Real Channel Audit uses your channel data to identify growth blockers. Creator-Friendly Fixes are simple recommendations you can apply without being a YouTube expert. One-time unlock means no monthly subscription. Pay once and get your full report.'
          },
          {
            h2: 'Professional Channel Growth Audit',
            body:
              'Unlock personalized recommendations, growth opportunities, and channel insights. See why your growth is stalled before you waste more uploads on guesswork. Free preview first. Upgrade only if you want the full fix. One-time payment. No subscription. Instant access. Public YouTube data only. Secure checkout via Stripe. Unlock the full report after the free preview when you are ready.'
          },
          {
            h2: 'FAQ',
            body:
              "Most creators don't grow because they're guessing. Here's how this tool fixes that."
          },
          {
            h2: 'Explore Growth Guides, Audit Topics, and Comparisons',
            body:
              'Indexable, useful resources for creators who want practical answers on CTR, titles, thumbnails, SEO, retention, and better publishing decisions.'
          },
          {
            h2: 'Footer',
            body:
              'YouTubeBooster AI helps creators improve CTR, SEO, thumbnails, retention, and discover growth opportunities using AI-powered channel analysis. Footer navigation includes growth pages, audit topics, comparison pages, platform information, about, contact, pricing, FAQ, privacy, and disclaimer.'
          }
        ],
        faq: HOMEPAGE_FAQS,
        links: [
          ...commonLinks,
          { href: '/audit', label: 'Audit topics' },
          { href: '/platform', label: 'Platform' },
          { href: '/about', label: 'About' },
          { href: '/contact', label: 'Contact' },
          { href: '/privacy', label: 'Privacy Policy' },
          { href: '/disclaimer', label: 'Disclaimer' },
          ...HOME_COMPARISON_LINKS,
          ...HOMEPAGE_GUIDE_GROUPS.flatMap((group) =>
            group.pages.map((page) => ({ href: page.path, label: page.cardTitle }))
          )
        ]
      };
    case '/pricing':
      return {
        h1: 'Pricing',
        lead:
          'Preview your channel audit for free, then unlock the complete growth report when you want the full set of recommendations.',
        sections: [
          {
            h2: 'Free preview before unlock',
            body:
              'YouTubeBooster AI lets creators review a preview before deciding whether the full audit report is useful for their channel.'
          }
        ],
        links: commonLinks
      };
    case '/demo':
      return {
        h1: 'Analyze Your YouTube Channel',
        lead:
          'Run a free YouTube channel audit preview for title, thumbnail, SEO, CTR, retention, and growth opportunity signals.',
        sections: [
          {
            h2: 'Default demo channel',
            body:
              'The default product demo uses MaxKantorCooking, while creator-entered channels can be analyzed separately in the app experience.'
          }
        ],
        links: commonLinks
      };
    case '/faq':
      return {
        h1: 'FAQ',
        lead:
          'Answers to common questions about YouTubeBooster AI, channel audits, YouTube SEO, privacy, pricing, and growth recommendations.',
        sections: [
          {
            h2: 'Common product questions',
            body:
              'The audit focuses on public channel signals and practical recommendations. It does not guarantee views, subscribers, revenue, or rankings.'
          }
        ],
        faq: [
          {
            question: 'Is YouTubeBooster AI affiliated with YouTube?',
            answer: 'No. YouTubeBooster AI is independent and is not affiliated with YouTube or Google.'
          }
        ],
        links: commonLinks
      };
    case '/guides':
      return {
        h1: 'YouTube Guides',
        lead:
          'Long-form YouTube growth guides covering SEO, topic planning, retention, content calendars, and practical publishing workflows.',
        sections: [{ h2: 'Creator education', body: 'Browse practical guides for improving YouTube discoverability and channel growth decisions.' }],
        links: commonLinks
      };
    case '/blog':
      return {
        h1: 'YouTube SEO & Growth Blog',
        lead:
          'Articles on YouTube SEO, AI channel audits, metadata, measurement, and sustainable creator growth.',
        sections: [{ h2: 'Latest resources', body: 'Read practical articles about improving YouTube channel performance without fake shortcuts.' }],
        links: commonLinks
      };
    case '/platform':
      return {
        h1: 'Platform',
        lead:
          'Explore the YouTubeBooster AI workflow for AI-powered channel audits, packaging analysis, CTR review, SEO guidance, and creator recommendations.',
        sections: [{ h2: 'Audit-first workflow', body: 'The platform helps creators understand which growth bottleneck to fix first.' }],
        links: commonLinks
      };
    case '/about':
      return {
        h1: `About ${BRAND.name}`,
        lead:
          'YouTubeBooster AI helps creators identify growth opportunities, improve channel performance, and make better publishing decisions.',
        sections: [{ h2: 'Built for creator clarity', body: 'The product focuses on practical channel diagnosis rather than fake guarantees or vanity claims.' }],
        links: commonLinks
      };
    case '/contact':
      return {
        h1: 'Contact',
        lead:
          'Contact YouTubeBooster AI for creator support, billing help, partnerships, product feedback, or account questions.',
        sections: [{ h2: 'Support', body: 'Use the contact page for product questions, support requests, feedback, billing issues, or partnership inquiries.' }],
        links: commonLinks
      };
    case '/privacy':
      return {
        h1: 'Privacy Policy',
        lead:
          'Privacy information for YouTubeBooster AI, including how account details, contact messages, analytics, and creator-submitted information are handled.',
        sections: [{ h2: 'Privacy requests', body: 'Contact support for privacy-related questions tied to your account, audit, or purchase.' }],
        links: commonLinks
      };
    case '/disclaimer':
      return {
        h1: 'Disclaimer',
        lead:
          'YouTubeBooster AI provides informational growth insights and does not guarantee views, subscribers, rankings, revenue, or business outcomes.',
        sections: [{ h2: 'Independent tool disclosure', body: 'YouTubeBooster AI is independent and is not affiliated with, endorsed by, or sponsored by YouTube or Google.' }],
        links: commonLinks
      };
    case '/audit':
      return {
        h1: 'YouTube Audit Topics',
        lead:
          'Browse AI-assisted YouTube audit topics for SEO, channel growth, CTR, metadata, thumbnails, and retention improvement.',
        sections: [{ h2: 'Audit resources', body: 'Use these pages to understand common channel growth problems and how an audit can prioritize fixes.' }],
        links: commonLinks
      };
    case '/solutions':
      return {
        h1: 'YouTube Growth Solutions',
        lead:
          'Problem-focused resources for YouTube CTR, retention, traffic leaks, content positioning, and conversion issues.',
        sections: [{ h2: 'Growth bottlenecks', body: 'Find practical explanations for common problems that stop YouTube channels from growing.' }],
        links: commonLinks
      };
    case '/site-map':
      return {
        h1: 'HTML Sitemap',
        lead:
          'A crawlable directory of public YouTubeBooster AI pages, guides, comparisons, blog posts, and audit resources.',
        sections: [{ h2: 'Indexable pages', body: 'Use this page to discover public resources available on YouTubeBoosterAI.com.' }],
        links: allProgrammaticAndBlogPaths().map((entry) => ({ href: entry.path, label: entry.path }))
      };
    default:
      return {
        h1: BRAND.name,
        lead: BRAND.seoHomeDescription,
        sections: [],
        links: commonLinks
      };
  }
}

function routeContent(pathname: string): {
  h1: string;
  lead: string;
  sections: SeoSection[];
  links: { href: string; label: string }[];
  faq?: SeoFaq[];
} {
  const pathOnly = normalizePath(pathname);
  const growth = getGrowthGuideByPath(pathOnly);
  if (growth) {
    return {
      h1: growth.h1,
      lead: growth.lead,
      sections: growth.sections,
      faq: growth.faq,
      links: [
        { href: '/', label: 'Home' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/demo', label: 'Run free channel audit' },
        { href: '/audit', label: 'Audit topics' },
        ...growth.relatedPaths.map((href) => ({ href, label: href.replace(/^\//, '').replace(/-/g, ' ') }))
      ]
    };
  }

  const comparison = getComparisonByPath(pathOnly);
  if (comparison) {
    return {
      h1: comparison.h1,
      lead: comparison.lead,
      sections: [
        { h2: 'Executive summary', body: comparison.executiveSummary },
        ...comparison.sections
      ],
      faq: comparison.faq,
      links: [
        { href: '/', label: 'Home' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/demo', label: 'Run free channel audit' },
        { href: '/guides', label: 'Guides' }
      ]
    };
  }

  const audit = findProgrammatic(pathOnly, '/audit/', audits as ProgrammaticEntry[]);
  const solution = findProgrammatic(pathOnly, '/solutions/', solutions as ProgrammaticEntry[]);
  const guide = findProgrammatic(pathOnly, '/guides/', guides as ProgrammaticEntry[]);
  const programmatic = audit ?? solution ?? guide;
  if (programmatic) {
    return {
      h1: programmatic.h1 ?? programmatic.title,
      lead: programmatic.intro ?? programmatic.description,
      sections: programmatic.sections ?? [],
      faq: programmatic.faq,
      links: [
        { href: '/', label: 'Home' },
        { href: '/demo', label: 'Run free channel audit' },
        { href: '/audit', label: 'Audit topics' },
        ...(programmatic.related ?? []).map((href) => ({ href, label: href.replace(/^\//, '').replace(/-/g, ' ') }))
      ]
    };
  }

  const blog = findBlog(pathOnly);
  if (blog) {
    return {
      h1: blog.title,
      lead: blog.description,
      sections: blog.sections ?? [],
      faq: blog.faq,
      links: [
        { href: '/', label: 'Home' },
        { href: '/blog', label: 'Blog' },
        { href: '/guides', label: 'Guides' },
        { href: '/demo', label: 'Run free channel audit' }
      ]
    };
  }

  return coreContent(pathOnly);
}

function seoHeadTags(pathname: string): string {
  const seo = resolveSeoForPath(pathname);
  const canonical = canonicalFor(seo.canonicalPath);
  const title = seo.title;
  const description = seo.description;
  const ogTitle = seo.ogTitle ?? title;
  const ogDescription = seo.ogDescription ?? description;
  const robots = seo.noindex ? 'noindex, nofollow' : 'index, follow';
  const keywords = seo.keywords?.length
    ? `    <meta name="keywords" content="${escapeAttr(seo.keywords.join(', '))}" />\n`
    : '';
  const article = [
    seo.articlePublishedTime
      ? `    <meta property="article:published_time" content="${escapeAttr(seo.articlePublishedTime)}" />`
      : '',
    seo.articleModifiedTime
      ? `    <meta property="article:modified_time" content="${escapeAttr(seo.articleModifiedTime)}" />`
      : ''
  ].filter(Boolean).join('\n');
  const jsonLd = seo.jsonLd?.length
    ? `    <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': seo.jsonLd })}</script>`
    : '';

  return [
    `    <title>${escapeHtml(title)}</title>`,
    `    <meta name="description" content="${escapeAttr(description)}" />`,
    `    <meta name="robots" content="${robots}" />`,
    keywords.trimEnd(),
    `    <link rel="canonical" href="${escapeAttr(canonical)}" />`,
    `    <meta property="og:title" content="${escapeAttr(ogTitle)}" />`,
    `    <meta property="og:description" content="${escapeAttr(ogDescription)}" />`,
    `    <meta property="og:type" content="${seo.ogType ?? 'website'}" />`,
    `    <meta property="og:image" content="${escapeAttr(ogImage)}" />`,
    '    <meta property="og:image:width" content="1200" />',
    '    <meta property="og:image:height" content="630" />',
    '    <meta property="og:image:type" content="image/jpeg" />',
    `    <meta property="og:url" content="${escapeAttr(canonical)}" />`,
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:image" content="${escapeAttr(ogImage)}" />`,
    `    <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />`,
    `    <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />`,
    article,
    jsonLd
  ].filter(Boolean).join('\n');
}

function fallbackMarkup(pathname: string): string {
  const content = routeContent(pathname);
  const sections = content.sections
    .map(
      (section) => `        <section>
          <h2>${escapeHtml(section.h2)}</h2>
          <p>${escapeHtml(stripMarkdown(section.body))}</p>
        </section>`
    )
    .join('\n');
  const faq = content.faq?.length
    ? `        <section>
          <h2>FAQ</h2>
          <dl>
${content.faq
  .map(
    (item) => `            <dt>${escapeHtml(item.question)}</dt>
            <dd>${escapeHtml(item.answer)}</dd>`
  )
  .join('\n')}
          </dl>
        </section>`
    : '';
  const seenLinks = new Set<string>();
  const links = content.links
    .filter((link) => {
      const key = `${link.href}::${link.label}`;
      if (seenLinks.has(key)) return false;
      seenLinks.add(key);
      return true;
    })
    .map((link) => `            <li><a href="${escapeAttr(urlFor(link.href))}">${escapeHtml(link.label)}</a></li>`)
    .join('\n');

  return `    <noscript>
      <main>
        <h1>${escapeHtml(content.h1)}</h1>
        <p>${escapeHtml(content.lead)}</p>
${sections}
${faq}
        <nav aria-label="Related pages">
          <h2>Related pages</h2>
          <ul>
${links}
          </ul>
        </nav>
      </main>
    </noscript>`;
}

function replaceHeadSeo(html: string, pathname: string): string {
  const cleaned = html
    .replace(/    <title>[\s\S]*?<\/title>\n?/g, '')
    .replace(/    <meta name="description"[\s\S]*?\/>\n?/g, '')
    .replace(/    <meta name="robots"[\s\S]*?\/>\n?/g, '')
    .replace(/    <meta name="keywords"[\s\S]*?\/>\n?/g, '')
    .replace(/    <link rel="canonical"[\s\S]*?\/>\n?/g, '')
    .replace(/    <meta property="og:[^"]+"[\s\S]*?\/>\n?/g, '')
    .replace(/    <meta name="twitter:[^"]+"[\s\S]*?\/>\n?/g, '')
    .replace(/    <meta property="article:[^"]+"[\s\S]*?\/>\n?/g, '')
    .replace(/    <script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');

  return cleaned.replace(
    /(\s*<meta name="viewport"[^>]*\/>\n)/,
    `$1${seoHeadTags(pathname)}\n`
  );
}

function replaceFallback(html: string, pathname: string): string {
  if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
    return html.replace(/    <noscript>[\s\S]*?<\/noscript>/, fallbackMarkup(pathname));
  }
  return html.replace(/(\s*<div id="root"><\/div>)/, `${fallbackMarkup(pathname)}\n$1`);
}

function routeOutputPath(pathname: string): string {
  if (pathname === '/') return distIndexPath;
  return path.join(distDir, pathname.replace(/^\//, ''), 'index.html');
}

function writeRoute(baseHtml: string, pathname: string): void {
  const normalized = normalizePath(pathname);
  const html = replaceFallback(replaceHeadSeo(baseHtml, normalized), normalized);
  const out = routeOutputPath(normalized);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
}

const baseHtml = fs.readFileSync(distIndexPath, 'utf8');
const routes = allProgrammaticAndBlogPaths().map((entry) => normalizePath(entry.path));
const uniqueRoutes = Array.from(new Set(routes));

for (const route of uniqueRoutes) {
  writeRoute(baseHtml, route);
}

console.log(`Wrote static route HTML for ${uniqueRoutes.length} routes`);
