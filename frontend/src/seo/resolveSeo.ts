import { BRAND, BRAND_DEFAULT_TITLE } from '../config/brand';
import audits from './data/audits.json';
import blogPosts from './data/blogPosts.json';
import guides from './data/guides.json';
import solutions from './data/solutions.json';
import {
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
  howToSchema,
  organizationSchema,
  productSchema,
  softwareApplicationSchema,
  webSiteSchema
} from './jsonLd';
import type { BreadcrumbItem, ResolvedSeo } from './types';

type AuditEntry = (typeof audits)[number];
type SolutionEntry = (typeof solutions)[number];
type GuideEntry = (typeof guides)[number];
type BlogEntry = (typeof blogPosts)[number];

const DEFAULT_DESC = BRAND.seoHomeDescription;

function baseGraph(): Record<string, unknown>[] {
  return [
    organizationSchema(),
    webSiteSchema(),
    softwareApplicationSchema(),
    productSchema()
  ];
}

function withBreadcrumb(path: string, items: BreadcrumbItem[]): Record<string, unknown>[] {
  const schemas: Record<string, unknown>[] = [breadcrumbListSchema(items)];
  return schemas;
}

export function resolveSeoForPath(pathname: string): ResolvedSeo {
  const path = pathname.replace(/\/$/, '') || '/';

  if (path.startsWith('/admin') || path.startsWith('/dashboard') || path.startsWith('/checkout')) {
    return {
      title: `${BRAND.name}`,
      description: DEFAULT_DESC,
      canonicalPath: path,
      noindex: true,
      jsonLd: []
    };
  }
  if (path.startsWith('/auth')) {
    return {
      title: `Sign in – ${BRAND.name}`,
      description: DEFAULT_DESC,
      canonicalPath: path,
      noindex: true,
      jsonLd: []
    };
  }
  if (path.startsWith('/app')) {
    return {
      title: `${BRAND.name}`,
      description: DEFAULT_DESC,
      canonicalPath: path,
      noindex: true,
      jsonLd: []
    };
  }

  if (path === '/') {
    return {
      title: BRAND_DEFAULT_TITLE,
      description: BRAND.seoHomeDescription,
      canonicalPath: '/',
      keywords: [
        'youtube channel audit',
        'youtube analytics',
        'youtube seo',
        'grow youtube views',
        'youtube ctr',
        'channel growth'
      ],
      ogType: 'website',
      jsonLd: baseGraph()
    };
  }

  if (path === '/about') {
    return {
      title: `About Us – ${BRAND.name}`,
      description: `Learn about ${BRAND.name}: AI-powered YouTube channel audits built for creators who want more views and clearer growth plans.`,
      canonicalPath: '/about',
      keywords: ['about youtube booster', 'youtube audit company'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/contact') {
    return {
      title: `Contact – ${BRAND.name}`,
      description: `Contact ${BRAND.name} for product questions, billing help, or partnership inquiries.`,
      canonicalPath: '/contact',
      keywords: ['contact youtube booster'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/privacy') {
    return {
      title: `Privacy Policy – ${BRAND.name}`,
      description: `Privacy policy for ${BRAND.name}: how we handle account data, analytics, and cookies.`,
      canonicalPath: '/privacy',
      keywords: ['privacy policy'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/disclaimer') {
    return {
      title: `Disclaimer – ${BRAND.name}`,
      description: `Disclaimer for ${BRAND.name} audits and analytics: limitations, third-party data, and no guarantees.`,
      canonicalPath: '/disclaimer',
      keywords: ['disclaimer'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/demo') {
    return {
      title: `Free YouTube channel demo – ${BRAND.name}`,
      description:
        'Try a live demo: AI-powered channel insights, title weaknesses, SEO gaps, and growth opportunities.',
      canonicalPath: '/demo',
      keywords: ['youtube demo', 'channel analyzer', 'youtube ai demo'],
      jsonLd: [...baseGraph()]
    };
  }

  if (path === '/platform') {
    return {
      title: `MK Platform – ${BRAND.name}`,
      description: 'Platform information and engineering notes for YouTube Booster.',
      canonicalPath: '/platform',
      keywords: ['youtube booster platform'],
      jsonLd: [...baseGraph()]
    };
  }

  if (path === '/audit') {
    return {
      title: `YouTube audits & keyword pages – ${BRAND.name}`,
      description: 'Browse AI-assisted YouTube SEO and growth audit topics. Indexable resources for creators.',
      canonicalPath: '/audit',
      keywords: ['youtube audit hub', 'seo audits youtube'],
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Audits', path: '/audit' }
      ],
      jsonLd: [...baseGraph(), breadcrumbListSchema([{ name: 'Home', path: '/' }, { name: 'Audits', path: '/audit' }])]
    };
  }

  if (path === '/solutions') {
    return {
      title: `YouTube growth solutions – ${BRAND.name}`,
      description: 'Problem-focused pages: CTR, retention, traffic leaks, and conversion on YouTube.',
      canonicalPath: '/solutions',
      keywords: ['youtube ctr', 'youtube growth solutions'],
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Solutions', path: '/solutions' }
      ],
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema([
          { name: 'Home', path: '/' },
          { name: 'Solutions', path: '/solutions' }
        ])
      ]
    };
  }

  if (path === '/guides') {
    return {
      title: `YouTube guides & how-tos – ${BRAND.name}`,
      description: 'Long-form guides: keyword research, calendars, retention, and topical authority.',
      canonicalPath: '/guides',
      keywords: ['youtube guides', 'youtube how to'],
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' }
      ],
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema([{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides' }])
      ]
    };
  }

  if (path === '/blog') {
    return {
      title: `Blog – ${BRAND.name} | YouTube SEO & growth`,
      description: 'Articles on YouTube SEO, AI audits, metadata, and sustainable channel growth.',
      canonicalPath: '/blog',
      keywords: ['youtube seo blog', 'channel growth blog'],
      breadcrumbs: [
        { name: 'Home', path: '/' },
        { name: 'Blog', path: '/blog' }
      ],
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }])
      ]
    };
  }

  if (path === '/site-map') {
    return {
      title: `HTML sitemap – ${BRAND.name}`,
      description: 'All indexable pages for crawlers and users: marketing, audits, solutions, guides, and blog.',
      canonicalPath: '/site-map',
      keywords: ['sitemap'],
      noindex: false,
      jsonLd: [...baseGraph()]
    };
  }

  const auditMatch = /^\/audit\/([^/]+)$/.exec(path);
  if (auditMatch) {
    const entry = (audits as AuditEntry[]).find((a) => a.slug === auditMatch[1]);
    if (!entry) {
      return {
        title: `Not found – ${BRAND.name}`,
        description: DEFAULT_DESC,
        canonicalPath: path,
        noindex: true,
        jsonLd: []
      };
    }
    const crumbs: BreadcrumbItem[] = [
      { name: 'Home', path: '/' },
      { name: 'Audits', path: '/audit' },
      { name: entry.h1, path }
    ];
    const faq = entry.faq?.length ? [faqPageSchema(entry.faq)] : [];
    return {
      title: entry.title,
      description: entry.description,
      canonicalPath: path,
      keywords: entry.keywords,
      ogType: 'article',
      breadcrumbs: crumbs,
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema(crumbs),
        articleSchema({
          headline: entry.h1,
          description: entry.description,
          path,
          datePublished: new Date().toISOString().slice(0, 10),
          keywords: entry.keywords
        }),
        ...faq
      ]
    };
  }

  const solMatch = /^\/solutions\/([^/]+)$/.exec(path);
  if (solMatch) {
    const entry = (solutions as SolutionEntry[]).find((a) => a.slug === solMatch[1]);
    if (!entry) {
      return {
        title: `Not found – ${BRAND.name}`,
        description: DEFAULT_DESC,
        canonicalPath: path,
        noindex: true,
        jsonLd: []
      };
    }
    const crumbs: BreadcrumbItem[] = [
      { name: 'Home', path: '/' },
      { name: 'Solutions', path: '/solutions' },
      { name: entry.h1, path }
    ];
    const faq = entry.faq?.length ? [faqPageSchema(entry.faq)] : [];
    return {
      title: entry.title,
      description: entry.description,
      canonicalPath: path,
      keywords: entry.keywords,
      ogType: 'article',
      breadcrumbs: crumbs,
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema(crumbs),
        articleSchema({
          headline: entry.h1,
          description: entry.description,
          path,
          datePublished: new Date().toISOString().slice(0, 10),
          keywords: entry.keywords
        }),
        ...faq
      ]
    };
  }

  const guideMatch = /^\/guides\/([^/]+)$/.exec(path);
  if (guideMatch) {
    const entry = (guides as GuideEntry[]).find((a) => a.slug === guideMatch[1]);
    if (!entry) {
      return {
        title: `Not found – ${BRAND.name}`,
        description: DEFAULT_DESC,
        canonicalPath: path,
        noindex: true,
        jsonLd: []
      };
    }
    const crumbs: BreadcrumbItem[] = [
      { name: 'Home', path: '/' },
      { name: 'Guides', path: '/guides' },
      { name: entry.h1, path }
    ];
    const faq = entry.faq?.length ? [faqPageSchema(entry.faq)] : [];
    const how =
      'howTo' in entry && entry.howTo && entry.howTo.steps?.length
        ? [howToSchema(entry.howTo)]
        : [];
    return {
      title: entry.title,
      description: entry.description,
      canonicalPath: path,
      keywords: entry.keywords,
      ogType: 'article',
      breadcrumbs: crumbs,
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema(crumbs),
        articleSchema({
          headline: entry.h1,
          description: entry.description,
          path,
          datePublished: new Date().toISOString().slice(0, 10),
          keywords: entry.keywords
        }),
        ...faq,
        ...how
      ]
    };
  }

  const blogMatch = /^\/blog\/([^/]+)$/.exec(path);
  if (blogMatch) {
    const entry = (blogPosts as BlogEntry[]).find((a) => a.slug === blogMatch[1]);
    if (!entry) {
      return {
        title: `Not found – ${BRAND.name}`,
        description: DEFAULT_DESC,
        canonicalPath: path,
        noindex: true,
        jsonLd: []
      };
    }
    const crumbs: BreadcrumbItem[] = [
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
      { name: entry.title, path }
    ];
    const faq = entry.faq?.length ? [faqPageSchema(entry.faq)] : [];
    return {
      title: `${entry.title} | ${BRAND.name}`,
      description: entry.description,
      canonicalPath: path,
      keywords: entry.keywords,
      ogType: 'article',
      articlePublishedTime: entry.datePublished,
      articleModifiedTime: entry.dateModified,
      breadcrumbs: crumbs,
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema(crumbs),
        articleSchema({
          headline: entry.title,
          description: entry.description,
          path,
          datePublished: entry.datePublished,
          dateModified: entry.dateModified,
          keywords: entry.keywords
        }),
        ...faq
      ]
    };
  }

  return {
    title: `${BRAND.name} – ${BRAND.tagline}`,
    description: DEFAULT_DESC,
    canonicalPath: path,
    noindex: false,
    jsonLd: [...baseGraph()]
  };
}
