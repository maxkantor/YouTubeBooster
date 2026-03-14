namespace YouTubeBoosterAi.Api;

public sealed record UserAccount(
    string UserId,
    string Email,
    bool Purchased,
    bool OnboardingCompleted,
    string AccessStatus,
    string? ChannelUrl,
    string? GrowthGoal,
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
