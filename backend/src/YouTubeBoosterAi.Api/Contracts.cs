namespace YouTubeBoosterAi.Api;

public sealed record DemoAnalysisRequest(string ChannelInput, string? Email);

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
    string CancelUrl
);

public sealed record CheckoutSessionResponse(string CheckoutUrl, string SessionId, decimal Amount, string Currency);

public sealed record MagicLinkLoginRequest(string Email, string? RedirectPath);

public sealed record MagicLinkLoginResponse(
    string Email,
    string Delivery,
    string Message,
    string? MagicLinkUrl
);

public sealed record MagicLinkVerifyRequest(string Token);

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
    string? ChannelUrl
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
public sealed record AdminListResponse<T>(IReadOnlyList<T> Items, string? NextCursor);

public sealed record AdminUserDto(
    string UserId,
    string Email,
    string? ChannelUrl,
    bool Purchased,
    bool OnboardingCompleted,
    string AccessStatus,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public sealed record AdminUserDetailResponse(
    AdminUserDto User,
    UserOnboardingStateResponse? Onboarding,
    UserYouTubeSettingsResponse? YouTubeSettings,
    IReadOnlyList<PurchaseRecord> Purchases,
    IReadOnlyList<ActivityFeedItem> RecentEvents
);

public sealed record AdminSupportTicketDto(
    string TicketId,
    string Email,
    string Subject,
    string Status,
    string ProductArea,
    string? ChannelUrl,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
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
    DateTimeOffset SentAt
);

public sealed record AdminSupportReplyRequest(string Subject, string Body);

public sealed record AdminDemoAuditDto(
    string DemoId,
    string ChannelInput,
    string ChannelTitle,
    string ChannelHandle,
    int HealthScore,
    string? Email,
    DateTimeOffset CreatedAt
);

public sealed record OgImageRequest(string Title, string Subtitle, string Theme, string? ShareId);

public sealed record AppSettings(
    decimal OneTimePrice,
    string Currency,
    string StripePriceLookupKey,
    string StripePublishableKey,
    string SupportEmail,
    bool EnablePublicDemo,
    int DemoRateLimitPerHour
);
