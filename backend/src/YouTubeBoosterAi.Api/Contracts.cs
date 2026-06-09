namespace YouTubeBoosterAi.Api;

public sealed record DemoAnalysisRequest(string ChannelInput, string? Email);

public sealed record PublicAnalyticsEventRequest(
    string EventName,
    string? Scope,
    IDictionary<string, string?>? Metadata);

public sealed record DemoTopVideoDto(string VideoId, string Title, long ViewCount);

public sealed record DemoAnalysisResponse(
    string DemoId,
    string ChannelInput,
    string ChannelTitle,
    string ChannelHandle,
    int HealthScore,
    IReadOnlyList<string> Findings,
    IReadOnlyList<string> PreviewRecommendations,
    IReadOnlyList<string> GatedInsights,
    string PaywallMessage,
    long SubscriberCount = 0,
    long TotalViews = 0,
    int VideoCount = 0,
    double AvgEngagement = 0,
    IReadOnlyList<DemoTopVideoDto>? TopVideos = null
);

public sealed record CreateCheckoutSessionRequest(
    string Email,
    string ChannelInput,
    string? PriceKey,
    string SuccessUrl,
    string CancelUrl,
    string? UserId = null,
    string? CognitoSub = null,
    string? AccountEmail = null,
    string? PlanCode = null,
    string? UtmSource = null,
    string? UtmMedium = null,
    string? UtmCampaign = null,
    string? Referrer = null
);

public sealed record CheckoutSessionResponse(string CheckoutUrl, string SessionId, decimal Amount, string Currency);

public sealed record ReconcileCheckoutSessionRequest(string SessionId);

public sealed record MagicLinkLoginRequest(string Email, string? RedirectPath);

public sealed record MagicLinkLoginResponse(
    string Email,
    string Delivery,
    string Message,
    string? MagicLinkUrl
);

public sealed record MagicLinkVerifyRequest(string Token);

public sealed record CognitoEnsureRequest(string Email, string Password);

public sealed record CognitoSessionExchangeRequest(string? AnonymousId);

public sealed record AdminLoginRequest(string Email, string Password);

public sealed record SessionUserDto(
    string UserId,
    string Email,
    bool Purchased,
    bool OnboardingCompleted,
    string? ChannelUrl,
    string AccessStatus
);

public sealed record UserSessionStatusResponse(bool Authenticated, SessionUserDto? User);

public sealed record AdminSessionStatusResponse(bool Authenticated, string? Email);

public sealed record PurchaseRecord(
    string PurchaseId,
    string UserId,
    string Email,
    decimal Amount,
    string Currency,
    string Status,
    string PriceVersion,
    DateTimeOffset PurchasedAt
);

public sealed record SupportTicketRequest(
    string Email,
    string? Name,
    string Subject,
    string Message,
    string ProductArea,
    string? ChannelUrl,
    string? OrderReference = null,
    string? AccountEmail = null
);

public sealed record SupportTicketResponse(string TicketId, string Status);

public sealed record UserOnboardingStateResponse(
    string UserId,
    string Email,
    bool Purchased,
    bool OnboardingCompleted,
    string? ChannelUrl,
    string? GrowthGoal,
    UserYouTubeSettingsResponse? YouTubeSettings
);

public sealed record SaveUserOnboardingRequest(
    string ChannelUrl,
    string? GrowthGoal
);

public sealed record UserYouTubeSettingsRequest(
    string? ChannelUrl,
    string? CredentialsJson,
    string? ClientId,
    string? ClientSecret,
    string? ProjectId,
    string? AuthUri,
    string? TokenUri,
    string? RedirectUri
);

public sealed record UserYouTubeSettingsResponse(
    string UserId,
    bool HasCredentialsJson,
    bool HasClientId,
    bool HasClientSecret,
    string? ChannelUrl,
    DateTimeOffset UpdatedAt,
    string StorageModel
);

public sealed record UserDashboardOverviewResponse(
    string UserId,
    string ChannelTitle,
    int HealthScore,
    IReadOnlyList<MetricCardDto> Metrics,
    IReadOnlyList<string> TopIssues,
    IReadOnlyList<string> TopOpportunities
);

public sealed record MetricCardDto(string Label, string Value, string Detail);

public sealed record AdminDashboardSummaryResponse(
    int TotalUsers,
    int TotalDemos,
    int TotalPurchases,
    string ConversionRate,
    string GrossRevenue,
    IReadOnlyList<ActivityFeedItem> RecentActivity
);

public sealed record ActivityFeedItem(string Title, string Detail, DateTimeOffset Timestamp);

// ===== Admin CRM DTOs =====
public sealed record AdminListResponse<T>(IReadOnlyList<T> Items, string? NextCursor, int? TotalCount = null);

public sealed record AdminUserDto(
    string UserId,
    string Email,
    string? ChannelUrl,
    bool Purchased,
    bool OnboardingCompleted,
    string AccessStatus,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool EmailVerified,
    string UserStatus,
    DateTimeOffset? LastLoginAt,
    string? Tags,
    string EntitlementsSummary,
    string? AdminNotes
);

public sealed record AdminUserDetailResponse(
    AdminUserDto User,
    UserOnboardingStateResponse? Onboarding,
    UserYouTubeSettingsResponse? YouTubeSettings,
    IReadOnlyList<PurchaseRecord> Purchases,
    IReadOnlyList<PaymentRecord> StripePayments,
    IReadOnlyList<EntitlementRecord> Entitlements,
    IReadOnlyList<ActivityFeedItem> RecentEvents
);

public sealed record AdminSupportTicketDto(
    string TicketId,
    string Email,
    string? Name,
    string Subject,
    string Status,
    string ProductArea,
    string? ChannelUrl,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? Priority,
    string? LinkedUserId,
    string? AccountEmail,
    string? OrderReference,
    string? Source,
    DateTimeOffset? LastMessageAt,
    string? AssignedAdmin
);

public sealed record AdminSupportTicketDetailResponse(
    AdminSupportTicketDto Ticket,
    string? Name,
    string Message,
    IReadOnlyList<AdminSupportMessageDto> Thread
);

public sealed record AdminSupportMessageDto(
    string MessageId,
    string Direction,
    string Subject,
    string Body,
    DateTimeOffset SentAt,
    string? SesMessageId,
    string? DeliveryStatus,
    string CreatedByType,
    string? CreatedById
);

public sealed record AdminSupportReplyRequest(string Subject, string Body);

public sealed record AdminSupportNoteRequest(string Body);

public sealed record AdminSupportLinkUserRequest(string? UserId);

public sealed record AdminDemoAuditDto(
    string DemoId,
    string ChannelInput,
    string ChannelTitle,
    string ChannelHandle,
    int HealthScore,
    string? Email,
    DateTimeOffset CreatedAt,
    string AuditType,
    string Status,
    string Visibility,
    string? LinkedUserId
);

public sealed record AdminOperationalDashboardResponse(
    string Range,
    AdminOperationalKpis Kpis,
    IReadOnlyList<ActivityFeedItem> RecentActivity,
    IReadOnlyList<AdminOrderRowDto> OrdersNeedingAttention,
    IReadOnlyList<AdminSupportTicketDto> SupportQueue,
    IReadOnlyList<AdminUserDto> RecentlyEntitledUsers,
    IReadOnlyList<AdminDemoAuditDto> RecentAuditIssues,
    IReadOnlyList<AdminAttentionItemDto> AttentionRequired,
    AdminFunnelResponse Funnel,
    IReadOnlyList<AdminDiagnosticRowDto> Diagnostics,
    AdminFunnelDropOffInsightDto? BiggestDropOff
);

public sealed record AdminOperationalKpis(
    int TotalUsers,
    int ActiveEntitledUsers,
    int ActiveLiveEntitledUsers,
    int TotalDemos,
    int RawDemoEvents,
    int PaidLiveOrders,
    decimal RevenueLiveUsd,
    int PaidTestOrders,
    decimal RevenueTestUsd,
    double DemoToPaidConversionPct,
    int FailedOrUnpaidCheckouts,
    int OpenSupportTickets,
    int UnmatchedPayments
);

public sealed record AdminFunnelStepDto(
    string EventKey,
    string Label,
    int UniqueActorCount,
    int RawEventCount,
    double? ConversionFromPreviousPct,
    double? DropOffFromPreviousPct,
    string? Warning
);

public sealed record AdminFunnelDropOffInsightDto(
    string FromStepLabel,
    string ToStepLabel,
    int FromUniqueActors,
    int ToUniqueActors,
    double DropOffPct,
    string Interpretation
);

public sealed record AdminFunnelEventDiagnosticDto(
    string EventName,
    int RawCount,
    int UniqueActorCount,
    DateTimeOffset FirstSeen,
    DateTimeOffset LastSeen,
    int MissingIdentityCount,
    double PercentMissingUserId,
    double PercentMissingAnonymousId,
    string? Warning
);

public sealed record AdminFunnelResponse(
    string Range,
    IReadOnlyList<AdminFunnelStepDto> Steps,
    string Notes
);

public sealed record AdminDiagnosticRowDto(
    string Metric,
    string Value,
    string DataSource,
    string Filters,
    DateTimeOffset LastUpdated,
    string? Warning
);

public sealed record AdminDiagnosticsResponse(
    string Range,
    IReadOnlyList<AdminDiagnosticRowDto> Rows,
    AdminFunnelResponse Funnel,
    IReadOnlyList<AdminFunnelEventDiagnosticDto> EventDiagnostics
);

public sealed record AdminOrderRowDto(
    string PaymentId,
    string StripeCheckoutSessionId,
    string? UserId,
    string AccountEmail,
    string? StripeEmail,
    decimal Amount,
    string Currency,
    string Status,
    string Mode,
    string PlanCode,
    string Classification,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PaidAt,
    string Source = "stripe",
    bool EntitlementGranted = false,
    string? StatusNote = null
);

public sealed record PaymentBackfillResultDto(
    int Scanned,
    int Updated,
    int AssumedTest,
    int ConfirmedLive,
    int ConfirmedTest,
    IReadOnlyList<string> Notes
);

public sealed record AdminAttentionItemDto(string Code, string Message, string? RelatedId);

public sealed record AdminActivityEventDto(
    string EventName,
    string Scope,
    DateTimeOffset CreatedAt,
    Dictionary<string, string?> Metadata
);

public sealed record AdminUserPatchRequest(
    string? UserStatus,
    string? AdminNotes,
    string? Tags
);

public sealed record AdminGrantEntitlementRequest(
    string AccessType,
    string? Reason,
    DateTimeOffset? ExpiresAt
);

public sealed record AdminSupportTicketPatchRequest(
    string? Status,
    string? Priority
);

public sealed record RevokeEntitlementBody(string? Reason);

public sealed record LinkOrderBody(string StripeCheckoutSessionId, string UserId);

public sealed record OgImageRequest(string Title, string Subtitle, string Theme, string? ShareId);

public sealed record AiGenerateRequest(
    string Action,
    AiGenerateInput Input
);

public sealed record AiGenerateInput(
    IReadOnlyList<string>? Titles,
    string? Description,
    string? Niche,
    string? Audience
);

/// <summary>AI Growth Studio — unified shape for preview (no Bedrock) and live Bedrock results.</summary>
public sealed record AiStudioGenerateResponse(
    bool Success,
    string Action,
    bool Preview,
    bool Locked,
    IReadOnlyList<string> Items,
    string Notes,
    DateTimeOffset GeneratedAt
);

public sealed record AppSettings(
    decimal OneTimePrice,
    string Currency,
    string StripePriceLookupKey,
    string StripePublishableKey,
    string SupportEmail,
    bool EnablePublicDemo,
    int DemoRateLimitPerHour
);
