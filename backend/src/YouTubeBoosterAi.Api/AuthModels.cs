namespace YouTubeBoosterAi.Api;

public sealed record UserAccount(
    string UserId,
    string? CognitoSub,
    string Email,
    bool EmailVerified,
    bool Purchased,
    bool OnboardingCompleted,
    string AccessStatus,
    string? ChannelUrl,
    string? GrowthGoal,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public sealed record EntitlementRecord(
    string EntitlementId,
    string UserId,
    string AccessType,
    string Status,
    string Source,
    DateTimeOffset GrantedAt,
    DateTimeOffset? ExpiresAt,
    string? PaymentId,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public sealed record PaymentRecord(
    string PaymentId,
    string UserId,
    string AccountEmail,
    string? StripeCustomerId,
    string StripeCheckoutSessionId,
    string? StripePaymentIntentId,
    string? StripeSubscriptionId,
    string? StripeEmail,
    decimal Amount,
    string Currency,
    string Status,
    string PlanCode,
    string? PaymentMethodBrand,
    string? PaymentMethodLast4,
    string? BillingCountry,
    string? BillingName,
    string? ReceiptUrl,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);

public sealed record MagicLinkTokenRecord(
    string Token,
    string UserId,
    string Email,
    string RedirectPath,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt
);

public sealed record UserSessionRecord(
    string SessionId,
    string UserId,
    string Email,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt
);

public sealed record AdminSessionRecord(
    string SessionId,
    string Email,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt
);
