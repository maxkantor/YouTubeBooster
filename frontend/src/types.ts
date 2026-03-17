export type DemoTopVideo = {
  videoId: string;
  title: string;
  viewCount: number;
};

export type DemoPreview = {
  demoId: string;
  channelTitle: string;
  channelHandle: string;
  channelInput: string;
  healthScore: number;
  findings: string[];
  previewRecommendations: string[];
  gatedModules: string[];
  paywallMessage: string;
  subscriberCount?: number;
  totalViews?: number;
  videoCount?: number;
  avgEngagement?: number;
  topVideos?: DemoTopVideo[];
};

// ---- Public demo dashboard (Python EB parity) ----
export type PublicChannelInfo = {
  channel_id: string;
  title: string;
  subscriber_count: number;
  video_count: number;
  view_count: number;
};

export type PublicTopVideoByViews = {
  title: string;
  view_count: number;
  video_id: string;
};

export type PublicVideoPerformance = {
  total_videos: number;
  total_views: number;
  total_likes: number;
  avg_views_per_video: number;
  avg_engagement_rate: number;
  top_videos_by_views: PublicTopVideoByViews[];
};

export type PublicChannelAnalyzeResponse = {
  channel_info: PublicChannelInfo;
  videos_analyzed: number;
  video_performance: PublicVideoPerformance;
  recommendations: string[];
};

export type PublicVideo = {
  video_id: string;
  title: string;
  description: string;
  published_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  duration: string;
  tags: string[];
};

export type PublicChannelSuggestionsResponse = {
  top_performers: { title: string; views: number; engagement: number; video_id: string }[];
  common_patterns: { common_words: string[]; common_tags: string[] };
  content_suggestions: string[];
};

export type PublicVideoSeoResponse = {
  video_id: string;
  video_title: string;
  title_analysis: {
    current_title: string;
    current_length: number;
    suggestions: { type: string; message: string; priority: string }[];
    optimized_examples: string[];
  };
  description_analysis: {
    current_length: number;
    word_count: number;
    suggestions: { type: string; message: string; priority: string }[];
  };
  current_tags: string[];
  suggested_tags: string[];
  seo_score: { score: number; rating: string; issues: string[] };
};

export type PublicTrafficToolsResponse = {
  promotion_candidates: Array<{
    video_id: string;
    title: string;
    description: string;
    published_at: string | null;
    age_days: number | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    engagement_rate: number;
    watch_url: string;
    share_text: string;
    reason: string;
  }>;
  top_performers: Array<{
    video_id: string;
    title: string;
    description: string;
    published_at: string | null;
    age_days: number | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    engagement_rate: number;
    watch_url: string;
    share_text: string;
    reason: string;
  }>;
  checklist: { title: string; details: string }[];
  content_suggestions: string[];
  series_ideas: { title: string; description: string; examples: string[] }[];
};

export type PublicRunnerPingResponse = { status: string; ts: string };

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
};

export type DashboardOverview = {
  userId: string;
  channelTitle: string;
  healthScore: number;
  metrics: DashboardMetric[];
  topIssues: string[];
  topOpportunities: string[];
};

export type ActivityFeedItem = {
  title: string;
  detail: string;
  timestamp: string;
};

export type AdminSummary = {
  totalUsers: number;
  totalDemos: number;
  totalPurchases: number;
  conversionRate: string;
  grossRevenue: string;
  recentActivity: ActivityFeedItem[];
};

export type CheckoutSession = {
  checkoutUrl: string;
  sessionId: string;
  amount: number;
  currency: string;
};

export type MagicLinkLoginResponse = {
  email: string;
  delivery: 'email' | 'mock' | string;
  message: string;
  magicLinkUrl: string | null;
};

export type SessionUser = {
  userId: string;
  email: string;
  purchased: boolean;
  onboardingCompleted: boolean;
  channelUrl: string | null;
  accessStatus: string;
};

export type UserSessionStatus = {
  authenticated: boolean;
  user: SessionUser | null;
};

export type AdminSessionStatus = {
  authenticated: boolean;
  email: string | null;
};

export type UserYouTubeSettings = {
  userId: string;
  hasCredentialsJson: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  channelUrl: string | null;
  updatedAt: string;
  storageModel: string;
};

export type SaveUserYouTubeSettingsRequest = {
  channelUrl?: string | null;
  credentialsJson?: string;
  clientId?: string;
  clientSecret?: string;
  projectId?: string;
  authUri?: string;
  tokenUri?: string;
  redirectUri?: string;
};

export type UserOnboardingState = {
  userId: string;
  email: string;
  purchased: boolean;
  onboardingCompleted: boolean;
  channelUrl: string | null;
  growthGoal: string | null;
  youTubeSettings: UserYouTubeSettings | null;
};
