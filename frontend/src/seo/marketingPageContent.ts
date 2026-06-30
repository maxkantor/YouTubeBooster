/** Shared copy for /pricing and /faq — used by React pages and static route HTML. */

export type MarketingSection = { h2: string; body: string };
export type MarketingFaqItem = { question: string; answer: string };

export const PRICING_PAGE_SECTIONS: MarketingSection[] = [
  {
    h2: 'Free preview first',
    body:
      'Start with the free channel preview to see how the audit reads your titles, channel positioning, SEO opportunities, retention signals, and packaging issues. The preview is designed to show whether the product can identify useful growth problems before you pay.'
  },
  {
    h2: 'One-time full report unlock',
    body:
      'The paid unlock gives you the full dashboard experience, deeper recommendations, AI growth guidance, and a clearer next-step plan for improving clicks, watch time, and discoverability. Pricing details shown in the app are the source of truth for the current offer.'
  },
  {
    h2: 'Who it is for',
    body:
      'The audit is meant for creators who want a practical read on what is holding a channel back: weak titles, unclear thumbnails, poor search fit, inconsistent positioning, or videos that do not confirm the click quickly enough.'
  }
];

export const FAQ_PAGE_ITEMS: MarketingFaqItem[] = [
  {
    question: 'What does YouTubeBooster AI analyze?',
    answer:
      'It looks at the public channel or video context you provide and organizes growth issues around titles, SEO, packaging, content positioning, retention risk, and practical recommendations for the next upload.'
  },
  {
    question: 'Is the preview free?',
    answer:
      'Yes. You can run the free preview before deciding whether the full report is worth unlocking. The preview is intentionally useful enough to show the type of diagnosis the product provides.'
  },
  {
    question: 'Does this guarantee more views?',
    answer:
      'No tool can guarantee YouTube views, subscribers, rankings, or revenue. The goal is to find likely growth blockers and give you clearer fixes so your next videos have a better chance to earn clicks and keep viewers.'
  },
  {
    question: 'Is this affiliated with YouTube?',
    answer:
      'No. YouTubeBooster AI is an independent product and is not affiliated with, endorsed by, or sponsored by YouTube or Google.'
  },
  {
    question: 'Where should I start?',
    answer:
      'Start with the free channel audit on the homepage. If you want more background first, read why your channel gets no views or YouTube SEO for small channels.'
  }
];
