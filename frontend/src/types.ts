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
