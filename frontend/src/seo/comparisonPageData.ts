import { BRAND } from '../config/brand';

export type ComparisonTable = {
  caption: string;
  headers: string[];
  rows: string[][];
};

export type ComparisonPageDef = {
  path: string;
  title: string;
  metaDescription: string;
  h1: string;
  cardTitle: string;
  lead: string;
  executiveSummary: string;
  sections: { h2: string; body: string }[];
  featureTable: ComparisonTable;
  pricingTable: ComparisonTable;
  prosCons: { name: string; pros: string[]; cons: string[] }[];
  bestFor: { audience: string; pick: string; reason: string }[];
  faq: { question: string; answer: string }[];
  keywords: string[];
  datePublished: string;
};

const published = '2026-05-27';

const TUBEBUDDY_PAGE: ComparisonPageDef = {
  path: '/compare/tubebuddy-vs-youtubebooster-ai',
  title: 'TubeBuddy vs YouTubeBooster AI',
  metaDescription:
    'Compare TubeBuddy and YouTubeBooster AI to see which platform delivers better channel audits, growth recommendations, and creator-focused insights.',
  h1: 'TubeBuddy vs YouTubeBooster AI',
  cardTitle: 'TubeBuddy vs YouTubeBooster AI',
  lead:
    'TubeBuddy and YouTubeBooster AI both help YouTube creators improve performance, but they solve different problems. This comparison focuses on audits, recommendations, workflow depth, and which tool fits your stage as a creator.',
  executiveSummary: `${BRAND.name} is an AI-powered YouTube channel audit and growth platform built to diagnose why a channel is underperforming and recommend practical next steps. TubeBuddy is a long-standing creator toolkit focused on keyword research, bulk editing, A/B testing, and in-Studio workflow extensions. If you want ongoing optimization utilities inside YouTube Studio, TubeBuddy remains a capable option. If you want a clearer audit-first read on CTR, packaging, retention risk, and missed opportunities—with a one-time unlock instead of another monthly stack—${BRAND.name} is the stronger fit.`,
  sections: [
    {
      h2: 'What each platform is designed to do',
      body: `TubeBuddy built its reputation as a browser-based companion for creators who want more control inside YouTube Studio. Its strengths sit in operational efficiency: tag suggestions, rank tracking, thumbnail generators, bulk description updates, and structured experiments across a large catalog. For creators who already know what to fix and mainly need speed inside the upload workflow, that model can feel natural.

${BRAND.name} takes a different entry point. Instead of starting with a long list of utilities, it starts with channel diagnosis. The product is positioned as an AI-powered YouTube channel audit and growth platform that helps creators identify missed opportunities, improve performance, and make smarter publishing decisions. You run a preview, review how titles, thumbnails, SEO, CTR signals, and retention patterns connect, and then decide whether to unlock the full report. That makes it especially useful when you are not sure which lever matters most.`
    },
    {
      h2: 'Audit depth and recommendation quality',
      body: `A useful growth tool should reduce decision fatigue, not add more tabs. TubeBuddy provides scores, keyword metrics, and optimization prompts tied to individual videos or channel settings. Those inputs are valuable when you already understand the context. The tradeoff is that creators still have to translate metrics into a priority order across the whole channel.

${BRAND.name} is intentionally diagnosis-first. The audit experience is built around practical questions creators actually ask: Why are impressions not converting? Which packaging patterns look weak? Where is retention likely leaking? What topics or keywords appear underused? The output is meant to read like consultant-style guidance rather than a dashboard dump. That difference matters most for small and mid-size channels that do not have time to inspect every upload manually.`
    },
    {
      h2: 'Workflow and day-to-day usage',
      body: `TubeBuddy fits creators who live inside YouTube Studio and want incremental improvements on every upload. If your process already includes keyword checks, tag edits, description templates, and periodic thumbnail tests, TubeBuddy can slot into that routine with minimal behavior change.

${BRAND.name} fits a different moment in the workflow: before you commit to the next strategy shift. It is useful when you are planning a refresh, evaluating why recent uploads underperformed, or deciding whether the bigger problem is topic selection, packaging, or audience fit. Many creators use audit-first tools to choose what to fix, then return to their existing production stack to implement changes.`
    },
    {
      h2: 'Pricing philosophy and total cost',
      body: `TubeBuddy is subscription-based. Public plans typically range from a limited free tier to paid monthly plans that increase with feature access. For creators who use the tool every week across many uploads, a subscription can be justified. For creators who only need a sharp diagnosis a few times per quarter, recurring cost can feel heavier than the value delivered.

${BRAND.name} uses a one-time unlock model for the full growth report after a free preview. That aligns with creators who want a focused answer without adding another permanent line item to their software stack. Pricing should always be evaluated against usage frequency, but the audit-first model is especially attractive when your immediate need is clarity, not another always-on utility.`
    },
    {
      h2: 'Which option is better for your channel stage',
      body: `Neither tool replaces the other in every scenario. TubeBuddy is often the better fit for high-volume operators who want keyword and Studio workflow support on every upload. ${BRAND.name} is often the better fit for creators who feel stuck, publish consistently, and still cannot explain why growth stalled.

If your channel needs operational tooling, keep TubeBuddy in the conversation. If your channel needs a structured audit that tells you what to fix first, start with ${BRAND.name}. The most efficient path for many creators is simple: run the free audit preview, compare the recommendations against your current workflow, and only then decide whether you need a broader monthly toolkit.`
    },
    {
      h2: 'How to make a confident decision in one week',
      body: `The most expensive mistake is paying for tools you never use. A practical evaluation workflow looks like this: list your top three growth questions, run the ${BRAND.name} preview on your channel, and write down the three recommendations that feel most actionable. Then compare whether TubeBuddy would have helped you reach the same conclusions faster.

If the audit reveals a packaging or positioning problem, fix those first before buying more utilities. If the audit confirms your strategy is sound and you mainly need faster metadata operations, TubeBuddy may be the better ongoing investment. This sequence keeps spending aligned with actual bottlenecks instead of tool enthusiasm.`
    }
  ],
  featureTable: {
    caption: 'TubeBuddy vs YouTubeBooster AI feature comparison',
    headers: ['Capability', 'TubeBuddy', 'YouTubeBooster AI'],
    rows: [
      ['Primary focus', 'In-Studio optimization utilities', 'AI channel audit and growth diagnosis'],
      ['Channel audit report', 'Limited / score-based prompts', 'Structured audit with prioritized recommendations'],
      ['CTR and packaging analysis', 'Per-video suggestions', 'Channel-level packaging and CTR pattern review'],
      ['Retention guidance', 'Metrics via Studio context', 'Retention risk patterns and practical fixes'],
      ['Keyword / SEO support', 'Strong keyword tooling', 'SEO opportunity and metadata alignment guidance'],
      ['Bulk editing tools', 'Yes', 'No — audit-first product'],
      ['A/B testing workflow', 'Available on paid tiers', 'Not the core product focus'],
      ['Free entry point', 'Free tier with limits', 'Free audit preview'],
      ['Pricing model', 'Monthly subscription tiers', 'One-time full report unlock'],
      ['Best for', 'High-volume Studio workflows', 'Creators who need diagnosis before more tools']
    ]
  },
  pricingTable: {
    caption: 'Pricing comparison (public list pricing; tiers may change)',
    headers: ['', 'TubeBuddy', 'YouTubeBooster AI'],
    rows: [
      ['Free option', 'Yes — limited features', 'Yes — audit preview'],
      ['Paid access', 'Monthly plans (tiered)', 'One-time full report unlock'],
      ['Typical paid entry', 'Low-cost monthly plans for core features', '$9.99 one-time unlock'],
      ['Billing style', 'Recurring subscription', 'Pay once when ready for full report'],
      ['Best value when', 'You use Studio tools weekly', 'You want a focused audit without a new subscription']
    ]
  },
  prosCons: [
    {
      name: 'TubeBuddy',
      pros: [
        'Mature keyword and tag workflow inside YouTube Studio',
        'Useful for bulk updates across many videos',
        'Familiar option for creators who optimize every upload',
        'Supports structured testing on higher tiers'
      ],
      cons: [
        'Can feel utility-heavy when the real problem is unclear strategy',
        'Subscription cost adds up if you only need periodic diagnosis',
        'Less emphasis on a single prioritized channel audit narrative'
      ]
    },
    {
      name: BRAND.name,
      pros: [
        'Audit-first experience with actionable recommendations',
        'Connects CTR, SEO, retention, and packaging in one view',
        'Free preview before paying for the full report',
        'One-time unlock instead of another monthly tool'
      ],
      cons: [
        'Not built for bulk Studio editing workflows',
        'Does not replace every optimization utility in one suite',
        'Best when you want diagnosis and direction, not just more tabs'
      ]
    }
  ],
  bestFor: [
    {
      audience: 'Small creators unsure why growth stalled',
      pick: BRAND.name,
      reason: 'The audit explains what to fix first without requiring a full optimization stack.'
    },
    {
      audience: 'High-volume uploaders optimizing every video in Studio',
      pick: 'TubeBuddy',
      reason: 'Operational tooling and keyword support fit a repetitive upload workflow.'
    },
    {
      audience: 'Creators comparing multiple tools before spending',
      pick: BRAND.name,
      reason: 'Start with the free preview, then decide if you need broader monthly utilities.'
    },
    {
      audience: 'Channels running frequent A/B tests on metadata',
      pick: 'TubeBuddy',
      reason: 'Testing workflows are a core part of the TubeBuddy value proposition.'
    }
  ],
  faq: [
    {
      question: 'Is YouTubeBooster AI a TubeBuddy replacement?',
      answer: `${BRAND.name} is not trying to replicate every TubeBuddy utility. It is an audit-first platform for creators who want clearer growth recommendations before adding more workflow tools.`
    },
    {
      question: 'Can I use both tools together?',
      answer: 'Yes. Many creators use an audit to choose priorities, then use Studio utilities to implement title, description, and packaging changes.'
    },
    {
      question: 'Which tool is better for keyword research?',
      answer: 'TubeBuddy is stronger as a dedicated keyword workflow tool. YouTubeBooster AI focuses more on how keywords, packaging, and channel positioning work together.'
    },
    {
      question: 'Does YouTubeBooster AI require a subscription?',
      answer: 'No. You can preview the audit for free and unlock the full report with a one-time payment when you are ready.'
    },
    {
      question: 'Which option is better for a brand-new channel?',
      answer: 'New channels usually need clearer positioning and packaging discipline more than bulk utilities. An audit-first tool often creates faster early clarity.'
    }
  ],
  keywords: [
    'tubebuddy vs youtube booster ai',
    'tubebuddy alternative',
    'youtube channel audit tool',
    'youtube growth platform comparison'
  ],
  datePublished: published
};

const VIDIQ_PAGE: ComparisonPageDef = {
  path: '/compare/vidiq-vs-youtubebooster-ai',
  title: 'vidIQ vs YouTubeBooster AI',
  metaDescription:
    'Compare vidIQ and YouTubeBooster AI to discover which solution delivers better growth insights, channel audits, and actionable recommendations.',
  h1: 'vidIQ vs YouTubeBooster AI',
  cardTitle: 'vidIQ vs YouTubeBooster AI',
  lead:
    'vidIQ and YouTubeBooster AI both aim to help creators grow on YouTube, but they emphasize different workflows. This page compares audit depth, recommendation style, pricing, and which creators each platform serves best.',
  executiveSummary: `vidIQ is widely known for keyword research, competitor tracking, scorecards, and daily optimization signals inside the YouTube workflow. ${BRAND.name} is an AI-powered YouTube channel audit and growth platform focused on explaining why a channel is underperforming and what to change next. vidIQ is strong when you want ongoing optimization telemetry and research tools. ${BRAND.name} is strong when you want a structured audit with prioritized, creator-friendly recommendations and a one-time unlock instead of adding another subscription.`,
  sections: [
    {
      h2: 'Two different starting points for growth',
      body: `vidIQ became popular by giving creators more visibility into keywords, trends, and competitive context. It helps answer questions like: What terms are worth targeting? How does this video compare with others in the niche? What optimization score does this upload receive? That makes vidIQ appealing for creators who want frequent guidance as they research and publish.

${BRAND.name} starts from a different question: Why is this channel not growing the way it should, and what is the highest-leverage fix right now? Instead of scattering attention across dozens of scores and alerts, the product organizes the channel into a clearer narrative—packaging, CTR pressure, SEO alignment, retention risk, and missed opportunities. For creators overwhelmed by data, that difference can save weeks of guesswork.`
    },
    {
      h2: 'Growth insights vs growth diagnosis',
      body: `vidIQ provides a broad optimization layer across the creator workflow. You get keyword suggestions, competitive views, and performance prompts that encourage continuous tuning. That can be powerful when you already have publishing discipline and mainly need better inputs.

${BRAND.name} is built for diagnosis first. The value is not simply seeing more metrics. It is understanding how the metrics relate to each other and which changes are worth doing before the next upload. If you have ever stared at analytics and still felt unsure what to fix, that is the gap ${BRAND.name} is designed to close.`
    },
    {
      h2: 'How recommendations feel in practice',
      body: `vidIQ recommendations often appear as scores, alerts, and keyword opportunities tied to specific videos or channel settings. They are useful when you are already in an optimization mindset and can evaluate each suggestion quickly.

${BRAND.name} recommendations are framed more like a channel review: what packaging patterns look weak, where CTR may be leaking impressions, which SEO opportunities seem underused, and what retention issues could be limiting distribution. The tone is practical and creator-focused rather than dashboard-heavy. That makes it easier to act even if you are not a full-time YouTube strategist.`
    },
    {
      h2: 'Pricing and commitment',
      body: `vidIQ offers a free tier and paid plans with expanded research and optimization features. For creators who log in frequently and use keyword and competitor tools as part of every upload, the subscription model can make sense.

${BRAND.name} offers a free audit preview and a one-time unlock for the full report. That model fits creators who want a decisive growth snapshot without committing to another monthly SaaS bill. If you are deciding between tools, the lower-friction first step is often to run the preview and judge the quality of the recommendations directly.`
    },
    {
      h2: 'Choosing based on creator stage and workload',
      body: `vidIQ is often the better fit for creators who publish often, research keywords deeply, and want a steady stream of optimization prompts. ${BRAND.name} is often the better fit for creators who feel stuck despite effort and need a prioritized plan.

You do not need to frame this as a permanent either-or decision. A practical approach is to use ${BRAND.name} when you need strategic clarity, then keep or skip broader optimization suites depending on how much ongoing telemetry you actually use.`
    },
    {
      h2: 'A simple decision framework for creators',
      body: `Before adding another subscription, ask one question: do I need more data, or do I need a clearer decision? If you need more data and use it weekly, vidIQ can be a strong fit. If you need a clearer decision about what to fix next, start with the ${BRAND.name} audit preview.

After seven days, review whether your publishing behavior changed. Did you rewrite titles, adjust thumbnails, tighten topics, or improve intros because the audit made the priority obvious? If yes, you have your answer. If not, the issue may be execution rather than information, and no tool alone will solve that.`
    }
  ],
  featureTable: {
    caption: 'vidIQ vs YouTubeBooster AI feature comparison',
    headers: ['Capability', 'vidIQ', 'YouTubeBooster AI'],
    rows: [
      ['Primary focus', 'Keyword research and optimization signals', 'AI channel audit and growth diagnosis'],
      ['Channel audit narrative', 'Scores and alerts across features', 'Prioritized audit with actionable recommendations'],
      ['Competitor research', 'Strong', 'Not the primary product focus'],
      ['CTR / packaging guidance', 'Video-level prompts', 'Channel-level CTR and packaging pattern review'],
      ['Retention analysis', 'Available via analytics context', 'Retention risk patterns with practical fixes'],
      ['Keyword opportunities', 'Core strength', 'SEO opportunity alignment inside audit'],
      ['Daily optimization workflow', 'Designed for frequent use', 'Designed for decisive audit moments'],
      ['Free entry point', 'Free tier with limits', 'Free audit preview'],
      ['Pricing model', 'Monthly subscription tiers', 'One-time full report unlock'],
      ['Best for', 'Research-heavy optimization routines', 'Creators who need clarity on what to fix first']
    ]
  },
  pricingTable: {
    caption: 'Pricing comparison (public list pricing; tiers may change)',
    headers: ['', 'vidIQ', 'YouTubeBooster AI'],
    rows: [
      ['Free option', 'Yes — limited features', 'Yes — audit preview'],
      ['Paid access', 'Monthly plans (tiered)', 'One-time full report unlock'],
      ['Typical paid entry', 'Monthly plans for advanced research', '$9.99 one-time unlock'],
      ['Billing style', 'Recurring subscription', 'Pay once when ready for full report'],
      ['Best value when', 'You use keyword/competitor tools often', 'You want a focused audit without another subscription']
    ]
  },
  prosCons: [
    {
      name: 'vidIQ',
      pros: [
        'Strong keyword and competitor research workflow',
        'Familiar optimization signals for daily publishing',
        'Useful for creators who want ongoing telemetry',
        'Established feature set across many creator stages'
      ],
      cons: [
        'Can feel noisy when you need a single prioritized plan',
        'Subscription value depends on frequent usage',
        'Less focused on one structured channel audit storyline'
      ]
    },
    {
      name: BRAND.name,
      pros: [
        'Clear audit-first recommendations for growth blockers',
        'Connects CTR, SEO, retention, and packaging together',
        'Free preview before unlocking the full report',
        'One-time payment model for focused needs'
      ],
      cons: [
        'Not a full keyword research suite',
        'Less emphasis on daily competitor tracking',
        'Built for diagnosis and direction, not endless alerts'
      ]
    }
  ],
  bestFor: [
    {
      audience: 'Creators overwhelmed by metrics but unsure what to fix',
      pick: BRAND.name,
      reason: 'The audit turns scattered signals into a prioritized action list.'
    },
    {
      audience: 'Keyword-driven creators publishing research-heavy content',
      pick: 'vidIQ',
      reason: 'Research and optimization prompts are central to the vidIQ workflow.'
    },
    {
      audience: 'Channels evaluating tools before subscribing to another SaaS',
      pick: BRAND.name,
      reason: 'The free preview shows recommendation quality before you pay.'
    },
    {
      audience: 'Creators who want competitor tracking every week',
      pick: 'vidIQ',
      reason: 'Competitive context is a core part of the vidIQ feature set.'
    }
  ],
  faq: [
    {
      question: 'Is YouTubeBooster AI a vidIQ replacement?',
      answer: `${BRAND.name} is best viewed as an audit-first growth platform, not a full replacement for every vidIQ research feature.`
    },
    {
      question: 'Which tool is better for beginners?',
      answer: 'Beginners often benefit more from a clear audit that explains what to fix first. Advanced research tools can help later once publishing habits are stable.'
    },
    {
      question: 'Can YouTubeBooster AI help with SEO?',
      answer: 'Yes. The audit reviews SEO alignment, metadata quality, and missed keyword opportunities as part of the overall growth diagnosis.'
    },
    {
      question: 'Does vidIQ or YouTubeBooster AI guarantee more views?',
      answer: 'Neither tool can guarantee views or rankings. Both provide informational guidance; results depend on your content, audience fit, and execution.'
    },
    {
      question: 'How should I test which one fits me?',
      answer: `Run the free ${BRAND.name} audit preview, review the recommendations, and compare them with the workflow you would actually use in a broader optimization suite.`
    }
  ],
  keywords: [
    'vidiq vs youtube booster ai',
    'vidiq alternative',
    'youtube channel audit comparison',
    'youtube growth analyzer comparison'
  ],
  datePublished: published
};

export const COMPARISON_PAGES: ComparisonPageDef[] = [TUBEBUDDY_PAGE, VIDIQ_PAGE];

export function getComparisonByPath(path: string): ComparisonPageDef | undefined {
  return COMPARISON_PAGES.find((page) => page.path === path);
}

export const HOMEPAGE_COMPARISON_LINKS = COMPARISON_PAGES.map((page) => ({
  path: page.path,
  title: page.cardTitle
}));
