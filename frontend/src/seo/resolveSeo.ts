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
  homeWebPageSchema,
  softwareApplicationSchema,
  webSiteSchema
} from './jsonLd';
import { getGrowthGuideByPath } from './growthGuides';
import { HOMEPAGE_FAQS } from './homepageFaq';
import { isPrivateNoIndexPath } from './seoRobots';
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

  if (isPrivateNoIndexPath(path)) {
    const title =
      path.includes('signup') || path === '/signup'
        ? `Sign up – ${BRAND.name}`
        : path.includes('signin') || path === '/signin'
          ? `Sign in – ${BRAND.name}`
          : `${BRAND.name}`;
    const description =
      path.includes('signup') || path === '/signup'
        ? `Create a ${BRAND.name} account to save your AI YouTube channel audit and access creator growth recommendations.`
        : path.includes('signin') || path === '/signin'
          ? `Sign in to ${BRAND.name} to access your saved YouTube audit, growth dashboard, and account settings.`
          : DEFAULT_DESC;
    return {
      title,
      description,
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
      ogTitle: 'YouTubeBooster AI | AI YouTube Channel Audit & Growth Analyzer',
      ogDescription:
        'YouTubeBooster AI helps you find out why your YouTube channel is not growing and unlock practical fixes for titles, thumbnails, SEO, CTR, and content strategy.',
      keywords: [
        'youtube booster ai',
        'youtube channel audit',
        'ai youtube channel audit',
        'youtube growth analyzer',
        'youtube analytics',
        'youtube seo',
        'grow youtube views',
        'youtube ctr',
        'youtube thumbnails',
        'youtube retention',
        'channel growth'
      ],
      ogType: 'website',
      jsonLd: [
        ...baseGraph(),
        homeWebPageSchema(),
        breadcrumbListSchema([{ name: BRAND.name, path: '/' }]),
        faqPageSchema(HOMEPAGE_FAQS)
      ]
    };
  }

  if (path === '/about') {
    return {
      title: `About ${BRAND.name} | Built for Small Creators`,
      description: `Learn how ${BRAND.name} helps small YouTube creators understand CTR, thumbnails, SEO, retention, and packaging with practical growth guidance.`,
      canonicalPath: '/about',
      keywords: ['about youtube booster ai', 'youtube creator growth platform', 'youtube audit company'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/contact') {
    return {
      title: `Contact ${BRAND.name} | Creator Support`,
      description: `Contact ${BRAND.name} for creator support, billing help, partnerships, product feedback, or account questions.`,
      canonicalPath: '/contact',
      keywords: ['contact youtube booster ai', 'creator support youtube booster'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/pricing') {
    return {
      title: `Pricing – ${BRAND.name} | Free Preview, One-Time Audit Unlock`,
      description: `See ${BRAND.name} pricing: run a free preview first, then unlock the full AI YouTube channel audit and growth report with a one-time payment.`,
      canonicalPath: '/pricing',
      keywords: ['youtube booster ai pricing', 'youtube channel audit pricing', 'youtube audit tool cost'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/faq') {
    const faqItems = [
      {
        question: `What does ${BRAND.name} analyze?`,
        answer:
          'It reviews public channel and video signals around titles, SEO, thumbnails, content positioning, retention risk, and practical growth opportunities.'
      },
      {
        question: 'Is the preview free?',
        answer:
          'Yes. Creators can run a free preview before deciding whether to unlock the full audit report.'
      },
      {
        question: 'Does this guarantee more views?',
        answer:
          'No. The product provides informational growth recommendations and cannot guarantee views, subscribers, rankings, revenue, or platform outcomes.'
      },
      {
        question: 'Is this affiliated with YouTube?',
        answer:
          `${BRAND.name} is an independent product and is not affiliated with, endorsed by, or sponsored by YouTube or Google.`
      }
    ];
    return {
      title: `FAQ – ${BRAND.name} | YouTube Audit Questions`,
      description: `Answers to common ${BRAND.name} questions about channel audits, YouTube SEO, pricing, privacy, and what the AI growth report can and cannot do.`,
      canonicalPath: '/faq',
      keywords: ['youtube booster ai faq', 'youtube audit questions', 'youtube seo tool faq'],
      jsonLd: [...baseGraph(), faqPageSchema(faqItems)]
    };
  }

  if (path === '/privacy' || path === '/privacy-policy') {
    return {
      title: `Privacy Policy – ${BRAND.name}`,
      description: `Privacy policy for ${BRAND.name}: how we handle creator messages, account details, analytics, and product-related information.`,
      canonicalPath: '/privacy',
      keywords: ['privacy policy', 'youtube booster ai privacy'],
      jsonLd: baseGraph()
    };
  }

  if (path === '/disclaimer') {
    return {
      title: `Disclaimer – ${BRAND.name}`,
      description: `Disclaimer for ${BRAND.name}: independent tool disclosure, no guaranteed results, and creator responsibility for channel decisions.`,
      canonicalPath: '/disclaimer',
      keywords: ['disclaimer', 'youtube booster ai disclaimer'],
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
      title: `Platform – ${BRAND.name} | AI YouTube Audit Workflow`,
      description: `Explore the ${BRAND.name} platform: AI YouTube channel audits, CTR and retention analysis, thumbnail optimization, SEO guidance, and creator workflow tools.`,
      canonicalPath: '/platform',
      keywords: ['youtube booster ai platform', 'youtube audit platform', 'ai youtube channel audit workflow'],
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
      jsonLd: [...baseGraph()]
    };
  }

  const growthGuide = getGrowthGuideByPath(path);
  if (growthGuide) {
    const crumbs: BreadcrumbItem[] = [
      { name: BRAND.name, path: '/' },
      { name: growthGuide.h1, path }
    ];
    const faq = growthGuide.faq.length ? [faqPageSchema(growthGuide.faq)] : [];
    return {
      title: growthGuide.title,
      description: `${BRAND.name}: ${growthGuide.metaDescription}`,
      canonicalPath: path,
      keywords: growthGuide.keywords,
      ogType: 'article',
      articlePublishedTime: `${growthGuide.datePublished}T08:00:00.000Z`,
      articleModifiedTime: `${growthGuide.datePublished}T08:00:00.000Z`,
      breadcrumbs: crumbs,
      jsonLd: [
        ...baseGraph(),
        breadcrumbListSchema(crumbs),
        articleSchema({
          headline: growthGuide.h1,
          description: growthGuide.metaDescription,
          path,
          datePublished: growthGuide.datePublished,
          keywords: growthGuide.keywords
        }),
        ...faq
      ]
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
    jsonLd: [...baseGraph()]
  };
}
