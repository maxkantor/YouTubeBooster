import type { ComparisonPageDef, ComparisonTable } from './comparisonPageData';
import { FAQ_PAGE_ITEMS, PRICING_PAGE_SECTIONS } from './marketingPageContent';

export type StaticSeoSection = { h2: string; body: string };
export type StaticSeoFaq = { question: string; answer: string };

export function formatComparisonTable(table: ComparisonTable): string {
  const header = table.headers.join(' | ');
  const rows = table.rows.map((row) => row.join(' | ')).join('\n');
  return `${table.caption}\n${header}\n${rows}`;
}

export function comparisonToSections(page: ComparisonPageDef): StaticSeoSection[] {
  const prosCons = page.prosCons
    .map(
      (block) =>
        `${block.name} — Pros: ${block.pros.join('; ')}. Cons: ${block.cons.join('; ')}.`
    )
    .join('\n\n');
  const bestFor = page.bestFor
    .map((item) => `${item.audience}: ${item.pick}. ${item.reason}`)
    .join('\n\n');

  return [
    { h2: 'Executive summary', body: page.executiveSummary },
    ...page.sections,
    { h2: 'Feature comparison', body: formatComparisonTable(page.featureTable) },
    { h2: 'Pricing comparison', body: formatComparisonTable(page.pricingTable) },
    { h2: 'Pros and cons', body: prosCons },
    { h2: 'Best for different creator types', body: bestFor }
  ];
}

export function hubArticleSections(
  items: { title: string; description: string }[]
): StaticSeoSection[] {
  return items.map((item) => ({
    h2: item.title.split(' | ')[0] ?? item.title,
    body: item.description
  }));
}

export function pricingRouteContent() {
  return {
    h1: 'Pricing',
    lead:
      'Preview your channel audit for free, then unlock the complete growth report when you want the full set of recommendations.',
    sections: [
      {
        h2: 'How pricing works',
        body:
          'YouTubeBooster AI is built around a simple pricing promise: preview the channel audit first, then unlock the full report only when the findings look useful. No subscription is required for the core audit experience.'
      },
      ...PRICING_PAGE_SECTIONS,
      {
        h2: 'Conversion path',
        body:
          'Enter your channel URL on the homepage audit form, review the free preview, then upgrade from the pricing section when you want the full report. Checkout is handled securely via Stripe.'
      }
    ]
  };
}

export function faqRouteContent() {
  return {
    h1: 'FAQ',
    lead:
      'Answers to common questions about YouTubeBooster AI, channel audits, YouTube SEO, privacy, pricing, and growth recommendations.',
    sections: [
      {
        h2: 'Product limits',
        body:
          'The audit focuses on public channel signals and practical recommendations. It does not guarantee views, subscribers, revenue, or rankings.'
      }
    ],
    faq: FAQ_PAGE_ITEMS
  };
}
