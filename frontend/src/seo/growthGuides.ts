import { BRAND } from '../config/brand';

export type GrowthGuideFaq = { question: string; answer: string };

export type GrowthGuidePageDef = {
  path: string;
  /** Document `<title>` */
  title: string;
  metaDescription: string;
  /** Visible intro under H1 (not necessarily identical to meta description). */
  lead: string;
  h1: string;
  cardTitle: string;
  teaser: string;
  keywords: string[];
  /** ISO date YYYY-MM-DD for Article / OG */
  datePublished: string;
  faq: GrowthGuideFaq[];
};

const brand = BRAND.name;

export const GROWTH_GUIDE_PAGES: GrowthGuidePageDef[] = [
  {
    path: '/why-your-youtube-has-no-views',
    title: `Why Your YouTube Has No Views | ${brand}`,
    metaDescription:
      'Diagnose why your YouTube videos get no views: weak titles, thumbnails, CTR, retention, niche fit, and packaging. Learn what to fix and how an AI audit surfaces it.',
    lead:
      'Flat view counts usually come from a few concrete leaks—packaging, retention, or positioning—not from a secret penalty. Here is how working creators diagnose each layer and fix it in the right order.',
    h1: 'Why Your YouTube Has No Views',
    cardTitle: 'Why your channel gets no views',
    teaser:
      'Most “invisible” channels are not bad at making videos—they are weak at packaging, positioning, and retention. Here is how to read the real signals.',
    keywords: [
      'youtube no views',
      'why my youtube video has no views',
      'youtube channel not growing',
      'low ctr youtube',
      'youtube retention'
    ],
    datePublished: '2025-03-15',
    faq: [
      {
        question: 'If my content is good, why do I still have no views?',
        answer:
          'Discovery on YouTube is competitive. Strong content still needs a clear topic, compelling title and thumbnail, and early retention. If browse or search impressions do not convert to clicks, or viewers leave in the first 30 seconds, distribution will stall regardless of production quality.'
      },
      {
        question: 'How can I tell if the problem is CTR versus retention?',
        answer:
          'CTR shows whether your packaging wins the click when YouTube shows your video. Retention shows whether the video delivers on the promise after the click. Low CTR usually points to titles, thumbnails, or topic fit; sharp early drop-off points to pacing, hook, or a mismatch between packaging and the first minute of the video.'
      },
      {
        question: 'Can an AI audit help if I am not sure what is wrong?',
        answer:
          `${brand} reviews your channel like a growth analyst: titles, thumbnails, patterns across videos, and practical fixes—so you move from guessing to a prioritized checklist.`
      }
    ]
  },
  {
    path: '/how-to-get-more-youtube-views',
    title: `How to Get More YouTube Views | ${brand}`,
    metaDescription:
      'A practical framework for more YouTube views: packaging, titles, thumbnails, hooks, consistency, searchable topics, and using data to iterate—plus how AI audits accelerate improvement.',
    lead:
      'Sustainable view growth is a process: sharpen how you earn the click, keep the watch, and pick topics that match real demand—then iterate with data instead of gut feel alone.',
    h1: 'How to Get More YouTube Views',
    cardTitle: 'How to get more views',
    teaser:
      'Views follow clear levers: better packaging, stronger hooks, repeatable formats, and topics people already search for. Here is a disciplined way to work those levers.',
    keywords: [
      'how to get more youtube views',
      'grow youtube channel',
      'youtube packaging',
      'youtube seo',
      'youtube consistency'
    ],
    datePublished: '2025-03-15',
    faq: [
      {
        question: 'What is the fastest lever for more views on an existing channel?',
        answer:
          'Usually packaging: titles and thumbnails that increase CTR on the impressions you already get. The second lever is the first 30 seconds—if retention improves, YouTube can confidently show the video to more people.'
      },
      {
        question: 'Do I need to upload daily to grow?',
        answer:
          'No. Consistency matters more than frequency alone. A sustainable upload rhythm you can keep while improving quality and packaging beats a burst of daily uploads followed by long gaps.'
      },
      {
        question: 'Where does an AI channel audit fit in?',
        answer:
          `It compresses diagnosis time: ${brand} highlights weak titles, thumbnail issues, and missed opportunities across your catalog so you know what to fix next instead of rewriting at random.`
      }
    ]
  },
  {
    path: '/youtube-thumbnail-mistakes',
    title: `YouTube Thumbnail Mistakes That Hurt CTR | ${brand}`,
    metaDescription:
      'Common YouTube thumbnail mistakes: clutter, unreadable text, weak contrast, flat emotion, poor composition, and broken promise vs title. Learn fixes and how to test thumbnails systematically.',
    lead:
      'Thumbnails are tested on every impression. These are the design and strategy mistakes that cap CTR—and the fixes that help your best videos finally get the clicks they deserve.',
    h1: 'YouTube Thumbnail Mistakes That Kill CTR',
    cardTitle: 'Thumbnail mistakes that cost clicks',
    teaser:
      'Thumbnails are your billboard in a crowded feed. Small design mistakes quietly cap CTR—here is what to avoid and how to iterate with intent.',
    keywords: [
      'youtube thumbnail mistakes',
      'youtube thumbnail tips',
      'youtube ctr thumbnail',
      'thumbnail design youtube',
      'youtube click through rate'
    ],
    datePublished: '2025-03-15',
    faq: [
      {
        question: 'Should every thumbnail include text?',
        answer:
          'Only when text adds clarity at a glance. If words are illegible on mobile or repeat the title verbatim without adding curiosity, they hurt more than they help.'
      },
      {
        question: 'How many elements is “too cluttered”?',
        answer:
          'If a viewer cannot identify one focal subject in under a second, simplify. One face or hero object, one short phrase (optional), and high contrast beats a collage of stickers and arrows.'
      },
      {
        question: 'How do I know if a new thumbnail is better?',
        answer:
          'Use YouTube Studio CTR on comparable traffic windows and avoid changing titles and thumbnails at the same time. Pair quantitative checks with a simple question: does this thumbnail make the same promise as the title in a more emotional, legible way?'
      }
    ]
  }
];

export function getGrowthGuideByPath(pathname: string): GrowthGuidePageDef | undefined {
  const p = pathname.replace(/\/$/, '') || '/';
  return GROWTH_GUIDE_PAGES.find((g) => g.path === p);
}
