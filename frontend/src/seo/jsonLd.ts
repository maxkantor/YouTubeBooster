import { BRAND } from '../config/brand';
import { absoluteUrl, getSiteUrl } from '../config/site';
import type { BreadcrumbItem } from './types';

export type { BreadcrumbItem };

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.name,
    url: getSiteUrl(),
    logo: absoluteUrl('/og-image.jpg'),
    description: BRAND.seoHomeDescription,
    sameAs: [] as string[]
  };
}

export function webSiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND.name,
    url: getSiteUrl(),
    description: BRAND.seoHomeDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${getSiteUrl()}/demo?channel={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

export function softwareApplicationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: BRAND.name,
    applicationCategory: 'AnalyticsApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '19.99',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    },
    description: BRAND.seoHomeDescription,
    image: absoluteUrl('/og-image.jpg'),
    url: getSiteUrl()
  };
}

export function productSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${BRAND.name} — Channel Growth Audit`,
    description:
      'One-time AI audit of your YouTube channel: titles, SEO, traffic patterns, and actionable recommendations.',
    brand: { '@type': 'Brand', name: BRAND.name },
    image: absoluteUrl('/og-image.jpg'),
    offers: {
      '@type': 'Offer',
      url: `${getSiteUrl()}/#pricing`,
      priceCurrency: 'USD',
      price: '19.99',
      availability: 'https://schema.org/InStock',
      priceValidUntil: '2027-12-31'
    }
  };
}

export function breadcrumbListSchema(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path)
    }))
  };
}

export function faqPageSchema(
  faqs: { question: string; answer: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer }
    }))
  };
}

export function articleSchema(params: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  keywords?: string[];
}): Record<string, unknown> {
  const mod = params.dateModified || params.datePublished;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: params.headline,
    description: params.description,
    author: { '@type': 'Organization', name: BRAND.name },
    publisher: {
      '@type': 'Organization',
      name: BRAND.name,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/og-image.jpg') }
    },
    datePublished: params.datePublished,
    dateModified: mod,
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(params.path) },
    image: absoluteUrl('/og-image.jpg'),
    keywords: params.keywords?.join(', ')
  };
}

export function howToSchema(params: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: params.name,
    description: params.description,
    step: params.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text
    }))
  };
}
