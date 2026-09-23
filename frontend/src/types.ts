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

export type AiGenerateAction =
  | 'rewrite_titles'
  | 'improve_description'
  | 'keywords'
  | 'ideas'
  | 'pattern';

export type AiGenerateRequest = {
  action: AiGenerateAction;
  input: {
    titles?: string[];
    description?: string;
    niche?: string;
    audience?: string;
  };
};

/** AI Growth Studio — server returns this for both preview (no Bedrock) and live Bedrock runs. */
export type AiStudioGenerateResponse = {
  success: boolean;
  action: AiGenerateAction;
  preview: boolean;
  locked: boolean;
  items: string[];
  notes: string;
  generatedAt: string;
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

/** Paginated CRM list (API camelCase). */
export type AdminListResponse<T> = {
  items: T[];
  nextCursor: string | null;
  totalCount?: number | null;
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
  name: string | null;
  email: string;
  subject: string;
  status: string;
  productArea: string;
  channelUrl: string | null;
  createdAt: string;
  updatedAt: string;
  priority: string | null;
  linkedUserId: string | null;
  accountEmail: string | null;
  orderReference: string | null;
  source: string | null;
  lastMessageAt: string | null;
  assignedAdmin: string | null;
};

export type AdminSupportMessage = {
  messageId: string;
  direction: string;
  subject: string;
  body: string;
  sentAt: string;
  sesMessageId: string | null;
  deliveryStatus: string | null;
  createdByType: string;
  createdById: string | null;
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
  activeLiveEntitledUsers: number;
  /** Unique demo actors in selected range */
  totalDemos: number;
  /** Raw demo_completed events in selected range */
  rawDemoEvents: number;
  paidLiveOrders: number;
  revenueLiveUsd: number;
  paidTestOrders: number;
  revenueTestUsd: number;
  demoToPaidConversionPct: number;
  failedOrUnpaidCheckouts: number;
  openSupportTickets: number;
  unmatchedPayments: number;
};

export type AdminFunnelStep = {
  eventKey: string;
  label: string;
  uniqueActorCount: number;
  rawEventCount: number;
  conversionFromPreviousPct: number | null;
  dropOffFromPreviousPct: number | null;
  warning: string | null;
};

export type AdminFunnelDropOffInsight = {
  fromStepLabel: string;
  toStepLabel: string;
  fromUniqueActors: number;
  toUniqueActors: number;
  dropOffPct: number;
  interpretation: string;
};

export type AdminFunnelEventDiagnostic = {
  eventName: string;
  rawCount: number;
  uniqueActorCount: number;
  firstSeen: string;
  lastSeen: string;
  missingIdentityCount: number;
  percentMissingUserId: number;
  percentMissingAnonymousId: number;
  warning: string | null;
};

export type AdminDiagnosticsResponse = {
  range: string;
  rows: AdminDiagnosticRow[];
  funnel: AdminFunnel;
  eventDiagnostics: AdminFunnelEventDiagnostic[];
};

export type AdminFunnel = {
  range: string;
  steps: AdminFunnelStep[];
  notes: string;
};

export type AdminDiagnosticRow = {
  metric: string;
  value: string;
  dataSource: string;
  filters: string;
  lastUpdated: string;
  warning: string | null;
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
  source?: string;
  entitlementGranted?: boolean;
  statusNote?: string | null;
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
  funnel: AdminFunnel;
  diagnostics: AdminDiagnosticRow[];
  biggestDropOff: AdminFunnelDropOffInsight | null;
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

export type AcqSanitizedProspect = {
  prospectId: string;
  channelName: string;
  handle: string;
  channelUrl: string;
  channelId: string | null;
  primaryNiche: string;
  language: string;
  country: string | null;
  subscriberRange: string;
  videoCount: number;
  recentUploadAt: string | null;
  cadenceDays: number | null;
  officialWebsite: string | null;
  contactSourceUrl: string | null;
  contactType: string;
  contactStatus: string;
  priorityScore: number;
  opportunityCategory: string;
  inspectionStatus: string;
  outreachStatus: string;
  approvalStatus: string;
  campaign: string;
  trackedPath: string;
  observation: string | null;
  suggestedImprovement: string | null;
  subject: string | null;
  evidenceAt: string | null;
  previewPlaceholder: boolean;
  acquisitionScore?: number;
  scoreBreakdownJson?: string | null;
  contactResearchStatus?: string | null;
  followUpStep?: number;
  nextFollowUpAt?: string | null;
  lastContactedAtPublic?: string | null;
  templateVersion?: string | null;
  subjectVariant?: string | null;
  messageVariant?: string | null;
  findingType?: string | null;
  exampleVideoTitle?: string | null;
  contactConfidence?: string | null;
  contactDiscoveryResult?: string | null;
  contactResearchLastAt?: string | null;
  contactResearchNextAt?: string | null;
  ticketId?: string | null;
  market?: string | null;
  creatorTier?: string | null;
  contentFormat?: string | null;
  strategic?: boolean;
  strategicGoal?: string | null;
};

export type AcqAdminProspect = {
  public: AcqSanitizedProspect;
  publicBusinessEmail: string | null;
  body?: string | null;
  lastContactedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  cooldownOverrideUntil?: string | null;
  adminAttestedContact?: boolean;
  fromDisplay?: string | null;
  htmlPreview?: string | null;
  textPreview?: string | null;
  ctaDestination?: string | null;
  findingSource?: string | null;
};

export type AcqEmailDiscoveryItemResult = {
  prospectId: string;
  handle: string;
  outcome: string;
  email?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  confidence?: string | null;
  detail?: string | null;
  draftPrepared?: boolean;
};

export type AcqCreatorDiscoveryItem = {
  channelId?: string | null;
  handle?: string | null;
  title?: string | null;
  outcome: string;
  reason?: string | null;
  prospectId?: string | null;
};

export type AcqCreatorDiscoveryJob = {
  jobId: string;
  category: string;
  language: string;
  market: string;
  tier?: string | null;
  campaign: string;
  adminEmail: string;
  target: number;
  startedAt: string;
  updatedAt: string;
  status: string;
  queries: string[];
  queryIndex: number;
  sourcesEvaluated: number;
  qualified: number;
  duplicatesSkipped: number;
  added: number;
  failed: number;
  results: AcqCreatorDiscoveryItem[];
  lastError?: string | null;
  lastErrorStatus?: string | null;
};

export type AcqCampaignConfig = {
  campaignId: string;
  name: string;
  category: string;
  language: string;
  market: string;
  tier?: string | null;
  dailyLimit: number;
  sendingEnabled: boolean;
  createdAt?: string;
};

export type AcqEmailDiscoveryJob = {
  jobId: string;
  campaign: string;
  adminEmail: string;
  dryRun: boolean;
  forceRetry: boolean;
  startedAt: string;
  updatedAt: string;
  status: string;
  prospectIds: string[];
  cursor: number;
  processed: number;
  found: number;
  review: number;
  notFound: number;
  failed: number;
  skipped: number;
  results: AcqEmailDiscoveryItemResult[];
  httpFetches?: number;
};

export type AcqSkipReasonPrimary = {
  code: string;
  count: number;
} | null;

export type AcqSummary = {
  verifiedCustomers: number;
  marketingSendingEnabled: boolean;
  complaintPause: boolean;
  fromEmailConfigured: boolean;
  postalAddressConfigured: boolean;
  campaign?: string;
  dailyLimit?: number;
  cooldownDays?: number;
  rampStage?: number;
  standingCampaignApproval?: boolean;
  allowWeekends?: boolean;
  discovered: number;
  inspected: number;
  contactVerified: number;
  drafts: number;
  draftsGenerated?: number;
  draftsAllCampaigns?: number;
  approved: number;
  currentlyApprovedWaitingToSend?: number;
  everApproved?: number;
  sent: number;
  sentToday?: number;
  sentLast7Days?: number;
  recentlySentWindowDays?: number;
  sentLifetime?: number;
  delivered?: number;
  deliveryTelemetryAvailable?: boolean;
  clicked?: number;
  auditStarted?: number;
  auditCompleted?: number;
  pricingViewed?: number;
  checkoutStarted?: number;
  converted?: number;
  bounced?: number;
  complained?: number;
  unsubscribed?: number;
  views: Record<string, number>;
  prospectsEvaluated?: number;
  sendEligible?: number;
  emailsAttemptedToday?: number;
  sesConfigured?: boolean;
  outreachBlocked?: boolean;
  primaryBlocker?: AcqSkipReasonPrimary;
  skipReasonCounts?: Record<string, number>;
  lastRun?: Record<string, unknown> | null;
  cohortRunId?: string;
  cohortFunnel?: {
    discovered?: number;
    contactable?: number;
    approved?: number;
    emailsSent: number;
    delivered: number;
    clicked: number;
    auditStarts: number;
    auditCompletions: number;
    accountsCreated?: number;
    pricingViewed?: number;
    checkoutStarts: number;
    paid?: number;
    verifiedCustomers: number;
    tracking?: string;
  };
  northStar?: {
    paidCustomers: number;
    revenue: number;
    auditsStarted: number;
    accountsCreated: number;
  };
  pipeline?: {
    drafted?: number;
    draftedNotApproved?: number;
    approved?: number;
    needsApproval?: number;
    readyToSend?: number;
    recentlySent?: number;
    eligibleNow?: number;
    approvedEligibleNow?: number;
    approvedManualEligibleNow?: number;
    blockedByCooldown?: number;
    blockedByEmailValidation?: number;
    blockedByQualification?: number;
    blockedBySuppression?: number;
    blockedByOther?: number;
    dailyLimit?: number;
    dailyRemaining?: number;
    expectedToAttempt?: number;
    notReviewable?: {
      invalidEmail?: number;
      noUsableEmail?: number;
      qualificationFailed?: number;
      cooldown?: number;
      suppressed?: number;
      alreadyContacted?: number;
      rejected?: number;
      other?: number;
    };
    notReviewableTotal?: number;
  };
  crmBoard?: {
    totalProspects?: number;
    draftsGenerated?: number;
    needsApproval?: number;
    readyToSend?: number;
    recentlySent?: number;
    recentlySentWindowDays?: number;
    sentToday?: number;
    sentLifetime?: number;
    usableEmails?: number;
    needsEmail?: number;
    notReviewable?: {
      invalidEmail?: number;
      noUsableEmail?: number;
      qualificationFailed?: number;
      cooldown?: number;
      suppressed?: number;
      alreadyContacted?: number;
      rejected?: number;
      other?: number;
    };
    notReviewableTotal?: number;
    approvalsUrl?: string;
  };
  /** READY_FOR_APPROVAL count (verified + draft, not approved). */
  needsApproval?: number;
  /** Approved and currently send-eligible. */
  approvedReadyToSend?: number;
  /** Approved waiting (includes cooldown / blocked). */
  approvedWaiting?: number;
  blockedCooldown?: number;
  followUpsDue?: number;
  repliesNeedingAction?: number;
  dailyRemaining?: number;
  nextScheduledSendEt?: string | null;
  taxonomy?: Record<string, unknown>;
  segments?: {
    byCategory?: Record<string, number>;
    byLanguage?: Record<string, number>;
    byMarket?: Record<string, number>;
    byTier?: Record<string, number>;
    byFormat?: Record<string, number>;
    sentByCategory?: Record<string, number>;
    clickedByLanguage?: Record<string, number>;
    strategic?: number;
  };
};

