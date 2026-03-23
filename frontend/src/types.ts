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

/** Paginated CRM list (API camelCase). */
export type AdminListResponse<T> = {
  items: T[];
  nextCursor: string | null;
};

export type AdminUserRow = {
  userId: string;
  email: string;
  channelUrl: string | null;
  purchased: boolean;
  onboardingCompleted: boolean;
  accessStatus: string;
  createdAt: string;
  updatedAt: string;
  emailVerified: boolean;
  userStatus: string;
  lastLoginAt: string | null;
  tags: string | null;
  entitlementsSummary: string;
  adminNotes: string | null;
};

export type AdminOnboardingDetail = {
  userId: string;
  email: string;
  purchased: boolean;
  onboardingCompleted: boolean;
  channelUrl: string | null;
  growthGoal: string | null;
  youTubeSettings: {
    userId: string;
    hasCredentialsJson: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    channelUrl: string | null;
    updatedAt: string;
    storageModel: string;
  } | null;
};

export type AdminPurchaseRow = {
  purchaseId: string;
  userId: string;
  email: string;
  amount: number;
  currency: string;
  status: string;
  priceVersion: string;
  purchasedAt: string;
};

export type AdminPaymentRecord = {
  paymentId: string;
  userId: string;
  accountEmail: string;
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  stripeEmail: string | null;
  amount: number;
  currency: string;
  status: string;
  planCode: string;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  billingCountry: string | null;
  billingName: string | null;
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
  mode: string;
  paidAt: string | null;
};

export type AdminEntitlementRecord = {
  entitlementId: string;
  userId: string;
  accessType: string;
  status: string;
  source: string;
  grantedAt: string;
  expiresAt: string | null;
  paymentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  grantedBy: string | null;
  grantedReason: string | null;
  revokedAt: string | null;
};

export type AdminUserDetailResponse = {
  user: AdminUserRow;
  onboarding: AdminOnboardingDetail | null;
  youTubeSettings: AdminOnboardingDetail['youTubeSettings'];
  purchases: AdminPurchaseRow[];
  stripePayments: AdminPaymentRecord[];
  entitlements: AdminEntitlementRecord[];
  recentEvents: ActivityFeedItem[];
};

export type AdminSupportTicketRow = {
  ticketId: string;
  email: string;
  subject: string;
  status: string;
  productArea: string;
  channelUrl: string | null;
  createdAt: string;
  updatedAt: string;
  priority: string | null;
  linkedUserId: string | null;
};

export type AdminSupportMessage = {
  messageId: string;
  direction: string;
  subject: string;
  body: string;
  sentAt: string;
  sesMessageId: string | null;
  deliveryStatus: string | null;
};

export type AdminSupportTicketDetail = {
  ticket: AdminSupportTicketRow;
  name: string | null;
  message: string;
  thread: AdminSupportMessage[];
};

export type AdminDemoAuditRow = {
  demoId: string;
  channelInput: string;
  channelTitle: string;
  channelHandle: string;
  healthScore: number;
  email: string | null;
  createdAt: string;
  auditType: string;
  status: string;
  visibility: string;
  linkedUserId: string | null;
};

export type AdminOperationalKpis = {
  totalUsers: number;
  activeEntitledUsers: number;
  totalDemos: number;
  paidLiveOrders: number;
  revenueLiveUsd: number;
  demoToPaidConversionPct: number;
  failedOrUnpaidCheckouts: number;
  openSupportTickets: number;
  unmatchedPayments: number;
};

export type AdminOrderRow = {
  paymentId: string;
  stripeCheckoutSessionId: string;
  userId: string | null;
  accountEmail: string;
  stripeEmail: string | null;
  amount: number;
  currency: string;
  status: string;
  mode: string;
  planCode: string;
  classification: string;
  createdAt: string;
  paidAt: string | null;
};

export type AdminAttentionItem = {
  code: string;
  message: string;
  relatedId: string | null;
};

export type AdminOperationalDashboard = {
  range: string;
  kpis: AdminOperationalKpis;
  recentActivity: ActivityFeedItem[];
  ordersNeedingAttention: AdminOrderRow[];
  supportQueue: AdminSupportTicketRow[];
  recentlyEntitledUsers: AdminUserRow[];
  recentAuditIssues: AdminDemoAuditRow[];
  attentionRequired: AdminAttentionItem[];
};

export type AdminActivityEventRow = {
  eventName: string;
  scope: string;
  createdAt: string;
  metadata: Record<string, string | null | undefined>;
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

export type ContactSubmitResponse = {
  ticketId: string;
  status: string;
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
