/**
 * Demo dataset for YouTube Booster dashboard when user has not purchased.
 * Sample audit data only — not real channel stats.
 */

export const demoChannelData = {
  channelTitle: 'Max Kantor Cooking Recipes',
  channelHandle: '@maxkantorUSA',
  subscribers: 5770,
  totalViews: 515218,
  videos: 188,
  avgEngagement: 3.42,
  growthScore: 71,
  growthScoreLabel: 'GOOD' as const,
  scoreExplanation: 'Your channel has momentum, but packaging issues are slowing growth.',
  scoreFactors: [
    { label: 'Titles', score: 68 },
    { label: 'SEO', score: 72 },
    { label: 'Engagement', score: 74 },
    { label: 'Consistency', score: 63 }
  ]
} as const;

/** Top performing videos — use key for list only, do not show ID in UI */
export const demoTopVideos = [
  { key: '1', title: 'How to Make Pickled Eggplants with Mushrooms', viewCount: 9600, tag: 'High performer' as const },
  { key: '2', title: 'Chicken Breast Pâté / Spread', viewCount: 9600, tag: 'Evergreen' as const },
  { key: '3', title: 'How to Make Georgian-style Pickled Cabbage', viewCount: 7900, tag: 'Strong engagement' as const },
  { key: '4', title: 'How to Make Belyashi (Fried Meat Buns)', viewCount: 6200, tag: 'Evergreen' as const }
] as const;

export const demoVideos = [
  { id: 'v1', title: 'Creamy Smoked Bacon Pea Soup', views: 25, likes: 5, comments: 0, publishDate: '3/13/2026' },
  { id: 'v2', title: 'This Looks Crazy… But Chicken Paws Are Delicious', views: 92, likes: 4, comments: 1, publishDate: '3/6/2026' },
  { id: 'v3', title: 'This Soup Is Dangerously Good — Kharcho Recipe', views: 321, likes: 8, comments: 1, publishDate: '2/27/2026' }
] as const;

export const demoSuggestions = [
  'Homemade Basturma',
  'Creamy Tom Yum Mushroom Soup Chaos',
  'Juicy Chicken Quarters Secret',
  'Pickled Eggplants with Mushrooms',
  'Chicken Breast Pâté Quick & Fancy'
] as const;

export const demoSeoAnalysis = {
  title: 'Creamy Smoked Bacon Pea Soup',
  score: 75,
  maxScore: 100,
  issues: [
    'Title length needs optimization',
    'Too many tags',
    'Missing power words'
  ],
  recommendations: [
    'Add numbers to title',
    'Add strong keywords',
    'Add timestamps to description'
  ]
} as const;

export const demoTrafficTools = {
  bestVideoToPromote: 'Creamy Smoked Bacon Pea Soup',
  engagement: 20,
  provenVideoToReshare: {
    title: 'Homemade Basturma',
    views: 14621
  }
} as const;

export const demoRecommendations = [
  'Your titles are longer than the niche average — shorten for better CTR.',
  'Your top videos follow a strong repeatable format; double down on that style.'
] as const;

export const demoDetectedProblems = [
  'Titles exceed optimal length',
  'Missing search keywords',
  'Weak video packaging',
  'Irregular posting cadence'
] as const;

export const demoOpportunities = [
  'Rewrite high-potential titles',
  'Optimize descriptions for search',
  'Focus on winning content patterns',
  'Improve CTR keywords'
] as const;

/** Blurred teaser rows under Why this score — overlay "Unlock deeper analysis" */
export const demoLockedInsightTeasers = [
  'Thumbnail packaging opportunities',
  'Search ranking gaps',
  'Next best content themes'
] as const;
