using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Microsoft.AspNetCore.DataProtection;

namespace YouTubeBoosterAi.Api;

public interface IAppDataStore
{
    Task SaveDemoAsync(DemoAnalysisRequest request, DemoAnalysisResponse response, CancellationToken cancellationToken);
    Task<string> SaveSupportTicketAsync(SupportTicketRequest request, string? linkedUserId, CancellationToken cancellationToken);
    Task SavePurchaseAsync(PurchaseRecord purchase, CancellationToken cancellationToken);
    Task<UserAccount> UpsertPurchasedUserAsync(string email, string? channelInput, CancellationToken cancellationToken);
    Task<UserAccount?> GetUserByEmailAsync(string email, CancellationToken cancellationToken);
    Task<UserAccount?> GetUserByIdAsync(string userId, CancellationToken cancellationToken);
    Task<UserAccount> UpsertCognitoUserAsync(string cognitoSub, string email, bool emailVerified, string? signupSource, CancellationToken cancellationToken);
    Task<UserAccount?> GetUserByCognitoSubAsync(string cognitoSub, CancellationToken cancellationToken);
    Task RecordUserLoginAsync(string userId, DateTimeOffset when, CancellationToken cancellationToken);
    Task SavePaymentAsync(PaymentRecord payment, CancellationToken cancellationToken);
    Task<PaymentRecord?> GetPaymentByCheckoutSessionIdAsync(string stripeCheckoutSessionId, CancellationToken cancellationToken);
    Task<IReadOnlyList<PaymentRecord>> ListPaymentsByUserAsync(string userId, CancellationToken cancellationToken);
    Task SaveEntitlementAsync(EntitlementRecord entitlement, CancellationToken cancellationToken);
    Task<IReadOnlyList<EntitlementRecord>> ListEntitlementsByUserAsync(string userId, CancellationToken cancellationToken);
    Task<bool> UserHasActiveEntitlementAsync(string userId, string accessType, CancellationToken cancellationToken);
    Task SaveMagicLinkTokenAsync(MagicLinkTokenRecord tokenRecord, CancellationToken cancellationToken);
    Task<MagicLinkTokenRecord?> ConsumeMagicLinkTokenAsync(string token, CancellationToken cancellationToken);
    Task SaveUserSessionAsync(UserSessionRecord sessionRecord, CancellationToken cancellationToken);
    Task<UserSessionRecord?> GetUserSessionAsync(string sessionId, CancellationToken cancellationToken);
    Task DeleteUserSessionAsync(string sessionId, CancellationToken cancellationToken);

    // Aggressive server-side logout invalidation.
    // When user logs out we bump an auth epoch; any session created with an old epoch becomes invalid.
    Task<long> GetUserAuthEpochAsync(string userId, CancellationToken cancellationToken);
    Task<long> BumpUserAuthEpochAsync(string userId, CancellationToken cancellationToken);

    Task SaveAdminSessionAsync(AdminSessionRecord sessionRecord, CancellationToken cancellationToken);
    Task<AdminSessionRecord?> GetAdminSessionAsync(string sessionId, CancellationToken cancellationToken);
    Task DeleteAdminSessionAsync(string sessionId, CancellationToken cancellationToken);

    Task<long> GetAdminAuthEpochAsync(string email, CancellationToken cancellationToken);
    Task<long> BumpAdminAuthEpochAsync(string email, CancellationToken cancellationToken);

    Task SaveUserOnboardingAsync(string userId, SaveUserOnboardingRequest request, CancellationToken cancellationToken);
    Task<UserOnboardingStateResponse?> GetUserOnboardingStateAsync(string userId, CancellationToken cancellationToken);
    Task CompleteUserOnboardingAsync(string userId, CancellationToken cancellationToken);
    Task SaveUserYouTubeSettingsAsync(string userId, UserYouTubeSettingsRequest request, CancellationToken cancellationToken);
    Task<UserYouTubeSettingsResponse?> GetUserYouTubeSettingsAsync(string userId, CancellationToken cancellationToken);
    Task TrackEventAsync(string eventName, string scope, IDictionary<string, string?> metadata, CancellationToken cancellationToken);
    Task<AdminDataSnapshot> GetAdminSnapshotAsync(CancellationToken cancellationToken);

    // Admin CRM queries
    Task<AdminListResponse<AdminUserDto>> ListUsersAsync(int limit, string? cursor, CancellationToken cancellationToken);
    Task<AdminUserDetailResponse?> GetUserDetailAsync(string userId, CancellationToken cancellationToken);
    Task<AdminListResponse<PurchaseRecord>> ListPurchasesAsync(int limit, string? cursor, CancellationToken cancellationToken);
    Task<AdminListResponse<AdminSupportTicketDto>> ListSupportTicketsAsync(int limit, string? cursor, CancellationToken cancellationToken);
    Task<AdminSupportTicketDetailResponse?> GetSupportTicketAsync(string ticketId, CancellationToken cancellationToken);
    Task SaveSupportReplyAsync(string ticketId, string subject, string body, string? sesMessageId, string? deliveryStatus, CancellationToken cancellationToken);
    Task<AdminListResponse<AdminDemoAuditDto>> ListDemoAuditsAsync(int limit, string? cursor, CancellationToken cancellationToken);

    Task<AdminOperationalDashboardResponse> GetOperationalDashboardAsync(string range, CancellationToken cancellationToken);

    Task<AdminListResponse<AdminOrderRowDto>> ListPaymentOrdersAsync(int limit, string? cursor, CancellationToken cancellationToken);

    Task<AdminListResponse<AdminActivityEventDto>> ListActivityEventsAsync(int limit, string? cursor, CancellationToken cancellationToken);

    Task<IReadOnlyList<ActivityFeedItem>> ListActivityForScopeAsync(string scope, int limit, CancellationToken cancellationToken);

    Task UpdateUserAdminAsync(string userId, AdminUserPatchRequest request, string adminEmail, CancellationToken cancellationToken);

    Task GrantEntitlementAdminAsync(string userId, AdminGrantEntitlementRequest request, string adminEmail, CancellationToken cancellationToken);

    Task RevokeEntitlementAdminAsync(string userId, string entitlementId, string reason, string adminEmail, CancellationToken cancellationToken);

    Task LinkPaymentToUserAsync(string stripeCheckoutSessionId, string userId, string adminEmail, CancellationToken cancellationToken);

    Task UpdateSupportTicketStatusAsync(string ticketId, AdminSupportTicketPatchRequest request, string adminEmail, CancellationToken cancellationToken);
}

public sealed record AdminDataSnapshot(
    int TotalUsers,
    int TotalDemos,
    int TotalPurchases,
    IReadOnlyList<ActivityFeedItem> RecentActivity
);

internal sealed record StoredProtectedYouTubeSettings(
    string? ChannelUrl,
    string? ProtectedCredentialsJson,
    string? ProtectedClientId,
    string? ProtectedClientSecret,
    string? ProtectedProjectId,
    string? ProtectedAuthUri,
    string? ProtectedTokenUri,
    string? ProtectedRedirectUri,
    DateTimeOffset UpdatedAt,
    string StorageModel
);

public sealed partial class InMemoryAppDataStore : IAppDataStore
{
    private readonly List<DemoAnalysisResponse> _demos = [];
    private readonly List<PurchaseRecord> _purchases = [];
    private readonly List<PaymentRecord> _payments = [];
    private readonly Dictionary<string, PaymentRecord> _paymentsByCheckoutSessionId = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<EntitlementRecord>> _entitlementsByUserId = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<ActivityFeedItem> _activity = [];
    private readonly List<string> _supportTickets = [];
    private readonly Dictionary<string, SupportTicketRequest> _supportTicketsById = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string?> _supportLinkedUserId = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<AdminSupportMessageDto>> _supportThreads = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, UserAccount> _usersById = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _userIdsByEmail = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _userIdsByCognitoSub = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, MagicLinkTokenRecord> _magicLinkTokens = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, UserSessionRecord> _userSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, AdminSessionRecord> _adminSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, long> _userAuthEpoch = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, long> _adminAuthEpochByEmail = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, StoredProtectedYouTubeSettings> _userYouTubeSettings = new(StringComparer.OrdinalIgnoreCase);
    private readonly IDataProtector _protector;

    public InMemoryAppDataStore(IDataProtectionProvider dataProtectionProvider)
    {
        _protector = dataProtectionProvider.CreateProtector("YouTubeBoosterAi.UserGoogleSettings.v1");
    }

    public Task SaveDemoAsync(DemoAnalysisRequest request, DemoAnalysisResponse response, CancellationToken cancellationToken)
    {
        _demos.Add(response);
        _activity.Insert(0, new ActivityFeedItem("Demo completed", request.ChannelInput, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    public Task<string> SaveSupportTicketAsync(SupportTicketRequest request, string? linkedUserId, CancellationToken cancellationToken)
    {
        var ticketId = $"ticket_{Guid.NewGuid():N}";
        _supportTickets.Add(ticketId);
        _supportTicketsById[ticketId] = request;
        if (!string.IsNullOrWhiteSpace(linkedUserId))
        {
            _supportLinkedUserId[ticketId] = linkedUserId;
        }
        _supportThreads[ticketId] = new List<AdminSupportMessageDto>
        {
            new(
                MessageId: $"msg_{Guid.NewGuid():N}",
                Direction: "inbound",
                Subject: request.Subject,
                Body: request.Message,
                SentAt: DateTimeOffset.UtcNow,
                SesMessageId: null,
                DeliveryStatus: "received"
            )
        };
        _activity.Insert(0, new ActivityFeedItem("Support ticket", request.Subject, DateTimeOffset.UtcNow));
        return Task.FromResult(ticketId);
    }

    public Task SavePurchaseAsync(PurchaseRecord purchase, CancellationToken cancellationToken)
    {
        _purchases.Add(purchase);
        _activity.Insert(0, new ActivityFeedItem("Purchase completed", purchase.Email, purchase.PurchasedAt));
        return Task.CompletedTask;
    }

    public Task<UserAccount> UpsertPurchasedUserAsync(string email, string? channelInput, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (!_userIdsByEmail.TryGetValue(normalizedEmail, out var userId))
        {
            userId = $"user_{Guid.NewGuid():N}";
            _userIdsByEmail[normalizedEmail] = userId;
        }

        var now = DateTimeOffset.UtcNow;
        var existing = _usersById.GetValueOrDefault(userId);
        var user = new UserAccount(
            UserId: userId,
            CognitoSub: existing?.CognitoSub,
            Email: normalizedEmail,
            EmailVerified: existing?.EmailVerified ?? false,
            Purchased: true,
            OnboardingCompleted: existing?.OnboardingCompleted ?? false,
            AccessStatus: "purchased",
            ChannelUrl: existing?.ChannelUrl ?? channelInput,
            GrowthGoal: existing?.GrowthGoal,
            LastLoginAt: existing?.LastLoginAt,
            CreatedAt: existing?.CreatedAt ?? now,
            UpdatedAt: now
        );

        _usersById[userId] = user;
        return Task.FromResult(user);
    }

    public Task<UserAccount?> GetUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (_userIdsByEmail.TryGetValue(normalizedEmail, out var userId) && _usersById.TryGetValue(userId, out var user))
        {
            return Task.FromResult<UserAccount?>(user);
        }

        return Task.FromResult<UserAccount?>(null);
    }

    public Task<UserAccount?> GetUserByIdAsync(string userId, CancellationToken cancellationToken)
    {
        _usersById.TryGetValue(userId, out var user);
        return Task.FromResult<UserAccount?>(user);
    }

    public Task<UserAccount> UpsertCognitoUserAsync(string cognitoSub, string email, bool emailVerified, string? signupSource, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (!_userIdsByCognitoSub.TryGetValue(cognitoSub, out var userId))
        {
            // Prefer reusing an existing email user if present (migration path from email-based purchase).
            if (_userIdsByEmail.TryGetValue(normalizedEmail, out var existingUserId))
            {
                userId = existingUserId;
            }
            else
            {
                userId = $"user_{Guid.NewGuid():N}";
                _userIdsByEmail[normalizedEmail] = userId;
            }
            _userIdsByCognitoSub[cognitoSub] = userId;
        }

        var now = DateTimeOffset.UtcNow;
        var existing = _usersById.GetValueOrDefault(userId);
        var purchased = existing?.Purchased ?? false;
        var user = new UserAccount(
            UserId: userId,
            CognitoSub: cognitoSub,
            Email: normalizedEmail,
            EmailVerified: emailVerified,
            Purchased: purchased,
            OnboardingCompleted: existing?.OnboardingCompleted ?? false,
            AccessStatus: purchased ? "entitled" : (existing?.AccessStatus ?? "free"),
            ChannelUrl: existing?.ChannelUrl,
            GrowthGoal: existing?.GrowthGoal,
            LastLoginAt: now,
            CreatedAt: existing?.CreatedAt ?? now,
            UpdatedAt: now
        );
        _usersById[userId] = user;
        return Task.FromResult(user);
    }

    public Task<UserAccount?> GetUserByCognitoSubAsync(string cognitoSub, CancellationToken cancellationToken)
    {
        if (_userIdsByCognitoSub.TryGetValue(cognitoSub, out var userId) && _usersById.TryGetValue(userId, out var user))
        {
            return Task.FromResult<UserAccount?>(user);
        }

        return Task.FromResult<UserAccount?>(null);
    }

    public Task RecordUserLoginAsync(string userId, DateTimeOffset when, CancellationToken cancellationToken)
    {
        if (_usersById.TryGetValue(userId, out var user))
        {
            _usersById[userId] = user with { LastLoginAt = when, UpdatedAt = DateTimeOffset.UtcNow };
        }
        return Task.CompletedTask;
    }

    public Task SavePaymentAsync(PaymentRecord payment, CancellationToken cancellationToken)
    {
        _payments.Add(payment);
        _paymentsByCheckoutSessionId[payment.StripeCheckoutSessionId] = payment;
        _activity.Insert(0, new ActivityFeedItem("Payment recorded", payment.AccountEmail, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    public Task<PaymentRecord?> GetPaymentByCheckoutSessionIdAsync(string stripeCheckoutSessionId, CancellationToken cancellationToken)
    {
        _paymentsByCheckoutSessionId.TryGetValue(stripeCheckoutSessionId, out var payment);
        return Task.FromResult<PaymentRecord?>(payment);
    }

    public Task<IReadOnlyList<PaymentRecord>> ListPaymentsByUserAsync(string userId, CancellationToken cancellationToken)
    {
        var items = _payments.Where(p => string.Equals(p.UserId, userId, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(p => p.CreatedAt)
            .Take(50)
            .ToArray();
        return Task.FromResult<IReadOnlyList<PaymentRecord>>(items);
    }

    public Task SaveEntitlementAsync(EntitlementRecord entitlement, CancellationToken cancellationToken)
    {
        if (!_entitlementsByUserId.TryGetValue(entitlement.UserId, out var list))
        {
            list = new List<EntitlementRecord>();
            _entitlementsByUserId[entitlement.UserId] = list;
        }

        var idx = list.FindIndex(e => string.Equals(e.EntitlementId, entitlement.EntitlementId, StringComparison.OrdinalIgnoreCase));
        if (idx >= 0) list[idx] = entitlement; else list.Add(entitlement);

        if (_usersById.TryGetValue(entitlement.UserId, out var user) && string.Equals(entitlement.Status, "active", StringComparison.OrdinalIgnoreCase))
        {
            _usersById[entitlement.UserId] = user with { Purchased = true, AccessStatus = "entitled", UpdatedAt = DateTimeOffset.UtcNow };
        }

        _activity.Insert(0, new ActivityFeedItem("Entitlement updated", entitlement.UserId, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<EntitlementRecord>> ListEntitlementsByUserAsync(string userId, CancellationToken cancellationToken)
    {
        if (_entitlementsByUserId.TryGetValue(userId, out var list))
        {
            return Task.FromResult<IReadOnlyList<EntitlementRecord>>(list.OrderByDescending(e => e.GrantedAt).ToArray());
        }

        return Task.FromResult<IReadOnlyList<EntitlementRecord>>(Array.Empty<EntitlementRecord>());
    }

    public async Task<bool> UserHasActiveEntitlementAsync(string userId, string accessType, CancellationToken cancellationToken)
    {
        var list = await ListEntitlementsByUserAsync(userId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        return list.Any(e =>
            string.Equals(e.AccessType, accessType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(e.Status, "active", StringComparison.OrdinalIgnoreCase) &&
            (e.ExpiresAt is null || e.ExpiresAt > now));
    }

    public Task SaveMagicLinkTokenAsync(MagicLinkTokenRecord tokenRecord, CancellationToken cancellationToken)
    {
        _magicLinkTokens[tokenRecord.Token] = tokenRecord;
        return Task.CompletedTask;
    }

    public Task<MagicLinkTokenRecord?> ConsumeMagicLinkTokenAsync(string token, CancellationToken cancellationToken)
    {
        if (!_magicLinkTokens.Remove(token, out var record))
        {
            return Task.FromResult<MagicLinkTokenRecord?>(null);
        }

        return Task.FromResult(record.ExpiresAt < DateTimeOffset.UtcNow ? null : record);
    }

    public Task SaveUserSessionAsync(UserSessionRecord sessionRecord, CancellationToken cancellationToken)
    {
        _userSessions[sessionRecord.SessionId] = sessionRecord;
        return Task.CompletedTask;
    }

    public Task<UserSessionRecord?> GetUserSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        if (_userSessions.TryGetValue(sessionId, out var session) && session.ExpiresAt >= DateTimeOffset.UtcNow)
        {
            return Task.FromResult<UserSessionRecord?>(session);
        }

        _userSessions.Remove(sessionId);
        return Task.FromResult<UserSessionRecord?>(null);
    }

    public Task DeleteUserSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        _userSessions.Remove(sessionId);
        return Task.CompletedTask;
    }

    public Task<long> GetUserAuthEpochAsync(string userId, CancellationToken cancellationToken)
    {
        _userAuthEpoch.TryGetValue(userId, out var epoch);
        return Task.FromResult(epoch);
    }

    public Task<long> BumpUserAuthEpochAsync(string userId, CancellationToken cancellationToken)
    {
        // Use unix seconds so we can store as a simple number.
        var nowEpoch = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        _userAuthEpoch[userId] = nowEpoch;
        return Task.FromResult(nowEpoch);
    }

    public Task SaveAdminSessionAsync(AdminSessionRecord sessionRecord, CancellationToken cancellationToken)
    {
        _adminSessions[sessionRecord.SessionId] = sessionRecord;
        return Task.CompletedTask;
    }

    public Task<AdminSessionRecord?> GetAdminSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        if (_adminSessions.TryGetValue(sessionId, out var session) && session.ExpiresAt >= DateTimeOffset.UtcNow)
        {
            return Task.FromResult<AdminSessionRecord?>(session);
        }

        _adminSessions.Remove(sessionId);
        return Task.FromResult<AdminSessionRecord?>(null);
    }

    public Task DeleteAdminSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        _adminSessions.Remove(sessionId);
        return Task.CompletedTask;
    }

    public Task<long> GetAdminAuthEpochAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = NormalizeEmail(email);
        _adminAuthEpochByEmail.TryGetValue(normalized, out var epoch);
        return Task.FromResult(epoch);
    }

    public Task<long> BumpAdminAuthEpochAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = NormalizeEmail(email);
        var nowEpoch = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        _adminAuthEpochByEmail[normalized] = nowEpoch;
        return Task.FromResult(nowEpoch);
    }

    public async Task SaveUserOnboardingAsync(string userId, SaveUserOnboardingRequest request, CancellationToken cancellationToken)
    {
        var existing = await GetUserByIdAsync(userId, cancellationToken);
        if (existing is null)
        {
            return;
        }

        _usersById[userId] = existing with
        {
            ChannelUrl = request.ChannelUrl,
            GrowthGoal = request.GrowthGoal,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public async Task<UserOnboardingStateResponse?> GetUserOnboardingStateAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        var settings = await GetUserYouTubeSettingsAsync(userId, cancellationToken);
        return new UserOnboardingStateResponse(
            user.UserId,
            user.Email,
            user.Purchased,
            user.OnboardingCompleted,
            user.ChannelUrl,
            user.GrowthGoal,
            settings
        );
    }

    public async Task CompleteUserOnboardingAsync(string userId, CancellationToken cancellationToken)
    {
        var existing = await GetUserByIdAsync(userId, cancellationToken);
        if (existing is null)
        {
            return;
        }

        _usersById[userId] = existing with
        {
            OnboardingCompleted = true,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }

    public Task SaveUserYouTubeSettingsAsync(string userId, UserYouTubeSettingsRequest request, CancellationToken cancellationToken)
    {
        var settings = new StoredProtectedYouTubeSettings(
            ChannelUrl: request.ChannelUrl,
            ProtectedCredentialsJson: Protect(request.CredentialsJson),
            ProtectedClientId: Protect(request.ClientId),
            ProtectedClientSecret: Protect(request.ClientSecret),
            ProtectedProjectId: Protect(request.ProjectId),
            ProtectedAuthUri: Protect(request.AuthUri),
            ProtectedTokenUri: Protect(request.TokenUri),
            ProtectedRedirectUri: Protect(request.RedirectUri),
            UpdatedAt: DateTimeOffset.UtcNow,
            StorageModel: "per-user-encrypted"
        );

        _userYouTubeSettings[userId] = settings;
        _activity.Insert(0, new ActivityFeedItem("User YouTube settings saved", userId, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    public Task<UserYouTubeSettingsResponse?> GetUserYouTubeSettingsAsync(string userId, CancellationToken cancellationToken)
    {
        if (!_userYouTubeSettings.TryGetValue(userId, out var settings))
        {
            return Task.FromResult<UserYouTubeSettingsResponse?>(null);
        }

        return Task.FromResult<UserYouTubeSettingsResponse?>(new UserYouTubeSettingsResponse(
            UserId: userId,
            HasCredentialsJson: !string.IsNullOrWhiteSpace(settings.ProtectedCredentialsJson),
            HasClientId: !string.IsNullOrWhiteSpace(settings.ProtectedClientId),
            HasClientSecret: !string.IsNullOrWhiteSpace(settings.ProtectedClientSecret),
            ChannelUrl: settings.ChannelUrl,
            UpdatedAt: settings.UpdatedAt,
            StorageModel: settings.StorageModel
        ));
    }

    public Task TrackEventAsync(string eventName, string scope, IDictionary<string, string?> metadata, CancellationToken cancellationToken)
    {
        _activity.Insert(0, new ActivityFeedItem(eventName, scope, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    public Task<AdminDataSnapshot> GetAdminSnapshotAsync(CancellationToken cancellationToken)
    {
        return Task.FromResult(new AdminDataSnapshot(
            TotalUsers: _usersById.Count,
            TotalDemos: _demos.Count,
            TotalPurchases: _purchases.Count,
            RecentActivity: _activity.Take(10).ToArray()
        ));
    }

    public Task<AdminListResponse<AdminUserDto>> ListUsersAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var items = _usersById.Values
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new AdminUserDto(
                u.UserId,
                u.Email,
                u.ChannelUrl,
                u.Purchased,
                u.OnboardingCompleted,
                u.AccessStatus,
                u.CreatedAt,
                u.UpdatedAt,
                u.EmailVerified,
                string.IsNullOrWhiteSpace(u.UserStatus) ? "active" : u.UserStatus,
                u.LastLoginAt,
                u.Tags,
                u.Purchased ? "premium" : "none",
                u.AdminNotes))
            .Take(Math.Max(1, limit))
            .ToArray();
        return Task.FromResult(new AdminListResponse<AdminUserDto>(items, null));
    }

    public async Task<AdminUserDetailResponse?> GetUserDetailAsync(string userId, CancellationToken cancellationToken)
    {
        if (!_usersById.TryGetValue(userId, out var user))
            return null;

        var dto = new AdminUserDto(
            user.UserId,
            user.Email,
            user.ChannelUrl,
            user.Purchased,
            user.OnboardingCompleted,
            user.AccessStatus,
            user.CreatedAt,
            user.UpdatedAt,
            user.EmailVerified,
            string.IsNullOrWhiteSpace(user.UserStatus) ? "active" : user.UserStatus,
            user.LastLoginAt,
            user.Tags,
            user.Purchased ? "premium" : "none",
            user.AdminNotes);
        var onboarding = await GetUserOnboardingStateAsync(userId, cancellationToken);
        var yt = await GetUserYouTubeSettingsAsync(userId, cancellationToken);
        var purchases = _purchases.Where(p => string.Equals(p.UserId, userId, StringComparison.OrdinalIgnoreCase)).OrderByDescending(p => p.PurchasedAt).Take(25).ToArray();
        var stripePayments = _payments.Where(p => string.Equals(p.UserId, userId, StringComparison.OrdinalIgnoreCase)).OrderByDescending(p => p.CreatedAt).Take(50).ToArray();
        var entitlements = await ListEntitlementsByUserAsync(userId, cancellationToken);
        var events = _activity.Where(a => a.Detail == userId || a.Title.Contains(userId, StringComparison.OrdinalIgnoreCase)).Take(80).ToArray();
        return new AdminUserDetailResponse(dto, onboarding, yt, purchases, stripePayments, entitlements, events);
    }

    public Task<AdminListResponse<PurchaseRecord>> ListPurchasesAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var items = _purchases.OrderByDescending(p => p.PurchasedAt).Take(Math.Max(1, limit)).ToArray();
        return Task.FromResult(new AdminListResponse<PurchaseRecord>(items, null));
    }

    public Task<AdminListResponse<AdminSupportTicketDto>> ListSupportTicketsAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var items = _supportTicketsById
            .Select(pair => new { TicketId = pair.Key, Req = pair.Value })
            .Select(x => new AdminSupportTicketDto(
                TicketId: x.TicketId,
                Email: x.Req.Email,
                Name: x.Req.Name,
                Subject: x.Req.Subject,
                Status: "open",
                ProductArea: x.Req.ProductArea,
                ChannelUrl: x.Req.ChannelUrl,
                CreatedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow,
                Priority: "normal",
                LinkedUserId: _supportLinkedUserId.GetValueOrDefault(x.TicketId)
            ))
            .Take(Math.Max(1, limit))
            .ToArray();
        return Task.FromResult(new AdminListResponse<AdminSupportTicketDto>(items, null));
    }

    public Task<AdminSupportTicketDetailResponse?> GetSupportTicketAsync(string ticketId, CancellationToken cancellationToken)
    {
        if (!_supportTicketsById.TryGetValue(ticketId, out var req))
            return Task.FromResult<AdminSupportTicketDetailResponse?>(null);
        var ticket = new AdminSupportTicketDto(
            ticketId,
            req.Email,
            req.Name,
            req.Subject,
            "open",
            req.ProductArea,
            req.ChannelUrl,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            "normal",
            _supportLinkedUserId.GetValueOrDefault(ticketId));
        var thread = _supportThreads.TryGetValue(ticketId, out var list) ? list.ToArray() : Array.Empty<AdminSupportMessageDto>();
        return Task.FromResult<AdminSupportTicketDetailResponse?>(new AdminSupportTicketDetailResponse(ticket, req.Name, req.Message, thread));
    }

    public Task SaveSupportReplyAsync(string ticketId, string subject, string body, string? sesMessageId, string? deliveryStatus, CancellationToken cancellationToken)
    {
        if (!_supportThreads.TryGetValue(ticketId, out var list))
        {
            list = new List<AdminSupportMessageDto>();
            _supportThreads[ticketId] = list;
        }
        list.Add(new AdminSupportMessageDto($"msg_{Guid.NewGuid():N}", "outbound", subject, body, DateTimeOffset.UtcNow, sesMessageId, deliveryStatus));
        _activity.Insert(0, new ActivityFeedItem("support_reply_sent", ticketId, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }

    public Task<AdminListResponse<AdminDemoAuditDto>> ListDemoAuditsAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var items = _demos
            .OrderByDescending(d => d.DemoId)
            .Take(Math.Max(1, limit))
            .Select(d => new AdminDemoAuditDto(d.DemoId, d.ChannelInput, d.ChannelTitle, d.ChannelHandle, d.HealthScore, null, DateTimeOffset.UtcNow, "demo", "completed", "preview", null))
            .ToArray();
        return Task.FromResult(new AdminListResponse<AdminDemoAuditDto>(items, null));
    }

    private string? Protect(string? value) => string.IsNullOrWhiteSpace(value) ? null : _protector.Protect(value);

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}

public sealed partial class DynamoDbAppDataStore : IAppDataStore
{
    private readonly IAmazonDynamoDB _dynamoDb;
    private readonly IConfiguration _configuration;
    private readonly IDataProtector _protector;

    public DynamoDbAppDataStore(IAmazonDynamoDB dynamoDb, IConfiguration configuration, IDataProtectionProvider dataProtectionProvider)
    {
        _dynamoDb = dynamoDb;
        _configuration = configuration;
        _protector = dataProtectionProvider.CreateProtector("YouTubeBoosterAi.UserGoogleSettings.v1");
    }

    public async Task SaveDemoAsync(DemoAnalysisRequest request, DemoAnalysisResponse response, CancellationToken cancellationToken)
    {
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"DEMO#{response.DemoId}"),
            ["sk"] = StringValue("DETAILS"),
            ["channelInput"] = StringValue(request.ChannelInput),
            ["channelTitle"] = StringValue(response.ChannelTitle),
            ["channelHandle"] = StringValue(response.ChannelHandle),
            ["email"] = StringValue(request.Email ?? string.Empty),
            ["healthScore"] = StringValue(response.HealthScore.ToString()),
            ["createdAt"] = StringValue(DateTimeOffset.UtcNow.ToString("O"))
        };

        await PutItemAsync(GetTableName("Storage:DemoTable", "ybai-demo-analyses"), item, cancellationToken);
        await TrackEventAsync("demo_completed", request.ChannelInput, new Dictionary<string, string?>
        {
            ["demoId"] = response.DemoId,
            ["channelTitle"] = response.ChannelTitle
        }, cancellationToken);
    }

    public async Task<string> SaveSupportTicketAsync(SupportTicketRequest request, string? linkedUserId, CancellationToken cancellationToken)
    {
        var ticketId = $"ticket_{Guid.NewGuid():N}";
        var now = DateTimeOffset.UtcNow;
        var nowIso = now.ToString("O");
        var tableName = GetTableName("Storage:SupportTable", "ybai-support");
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"TICKET#{ticketId}"),
            ["sk"] = StringValue("DETAILS"),
            ["email"] = StringValue(request.Email.Trim()),
            ["name"] = StringValue(request.Name ?? string.Empty),
            ["subject"] = StringValue(request.Subject),
            ["message"] = StringValue(request.Message),
            ["productArea"] = StringValue(request.ProductArea),
            ["channelUrl"] = StringValue(request.ChannelUrl ?? string.Empty),
            ["status"] = StringValue("open"),
            ["priority"] = StringValue("normal"),
            ["source"] = StringValue("contact_form"),
            ["orderReference"] = StringValue(request.OrderReference ?? string.Empty),
            ["accountEmail"] = StringValue(request.AccountEmail ?? string.Empty),
            ["createdAt"] = StringValue(nowIso),
            ["updatedAt"] = StringValue(nowIso),
            ["lastMessageAt"] = StringValue(nowIso)
        };
        if (!string.IsNullOrWhiteSpace(linkedUserId))
        {
            item["linkedUserId"] = StringValue(linkedUserId);
        }

        await PutItemAsync(tableName, item, cancellationToken);

        var inboundId = $"msg_{Guid.NewGuid():N}";
        await PutItemAsync(tableName, new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"TICKET#{ticketId}"),
            ["sk"] = StringValue($"MSG#{now:O}#{inboundId}"),
            ["direction"] = StringValue("inbound"),
            ["subject"] = StringValue(request.Subject),
            ["body"] = StringValue(request.Message),
            ["sentAt"] = StringValue(nowIso),
            ["createdByType"] = StringValue("user"),
            ["deliveryStatus"] = StringValue("received")
        }, cancellationToken);

        await TrackEventAsync("contact_submitted", ticketId, new Dictionary<string, string?>
        {
            ["ticketId"] = ticketId,
            ["email"] = request.Email,
            ["productArea"] = request.ProductArea,
            ["linkedUserId"] = linkedUserId
        }, cancellationToken);

        return ticketId;
    }

    public async Task SavePurchaseAsync(PurchaseRecord purchase, CancellationToken cancellationToken)
    {
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"PURCHASE#{purchase.PurchaseId}"),
            ["sk"] = StringValue("DETAILS"),
            ["userId"] = StringValue(purchase.UserId),
            ["email"] = StringValue(purchase.Email),
            ["amount"] = StringValue(purchase.Amount.ToString("F2")),
            ["currency"] = StringValue(purchase.Currency),
            ["status"] = StringValue(purchase.Status),
            ["priceVersion"] = StringValue(purchase.PriceVersion),
            ["purchasedAt"] = StringValue(purchase.PurchasedAt.ToString("O"))
        };

        await PutItemAsync(GetTableName("Storage:PurchasesTable", "ybai-purchases"), item, cancellationToken);
        await TrackEventAsync("purchase_completed", purchase.Email, new Dictionary<string, string?>
        {
            ["purchaseId"] = purchase.PurchaseId,
            ["amount"] = purchase.Amount.ToString("F2"),
            ["userId"] = purchase.UserId
        }, cancellationToken);
    }

    public async Task<UserAccount> UpsertPurchasedUserAsync(string email, string? channelInput, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        var existing = await GetUserByEmailAsync(normalizedEmail, cancellationToken);
        var user = new UserAccount(
            UserId: existing?.UserId ?? $"user_{Guid.NewGuid():N}",
            CognitoSub: existing?.CognitoSub,
            Email: normalizedEmail,
            EmailVerified: existing?.EmailVerified ?? false,
            Purchased: true,
            OnboardingCompleted: existing?.OnboardingCompleted ?? false,
            AccessStatus: "purchased",
            ChannelUrl: existing?.ChannelUrl ?? channelInput,
            GrowthGoal: existing?.GrowthGoal,
            LastLoginAt: existing?.LastLoginAt,
            CreatedAt: existing?.CreatedAt ?? DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow
        );

        await SaveUserProfileAsync(user, cancellationToken);
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"EMAIL#{normalizedEmail}"),
            ["sk"] = StringValue("USER"),
            ["userId"] = StringValue(user.UserId),
            ["email"] = StringValue(normalizedEmail),
            ["updatedAt"] = StringValue(user.UpdatedAt.ToString("O"))
        }, cancellationToken);

        return user;
    }

    public async Task<UserAccount?> GetUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"EMAIL#{normalizedEmail}"),
                ["sk"] = StringValue("USER")
            }
        }, cancellationToken);

        var userId = response.Item?.GetValueOrDefault("userId")?.S;
        return string.IsNullOrWhiteSpace(userId) ? null : await GetUserByIdAsync(userId, cancellationToken);
    }

    public async Task<UserAccount?> GetUserByIdAsync(string userId, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"USER#{userId}"),
                ["sk"] = StringValue("PROFILE")
            }
        }, cancellationToken);

        return response.Item is { Count: > 0 } ? ReadUserAccount(response.Item) : null;
    }

    public async Task<UserAccount> UpsertCognitoUserAsync(string cognitoSub, string email, bool emailVerified, string? signupSource, CancellationToken cancellationToken)
    {
        var normalizedEmail = NormalizeEmail(email);
        var existing = await GetUserByCognitoSubAsync(cognitoSub, cancellationToken)
            ?? await GetUserByEmailAsync(normalizedEmail, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var user = new UserAccount(
            UserId: existing?.UserId ?? $"user_{Guid.NewGuid():N}",
            CognitoSub: cognitoSub,
            Email: normalizedEmail,
            EmailVerified: emailVerified,
            Purchased: existing?.Purchased ?? false,
            OnboardingCompleted: existing?.OnboardingCompleted ?? false,
            AccessStatus: existing?.AccessStatus ?? "free",
            ChannelUrl: existing?.ChannelUrl,
            GrowthGoal: existing?.GrowthGoal,
            LastLoginAt: now,
            CreatedAt: existing?.CreatedAt ?? now,
            UpdatedAt: now
        );

        await SaveUserProfileAsync(user, cancellationToken);

        // Email -> user mapping
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"EMAIL#{normalizedEmail}"),
            ["sk"] = StringValue("USER"),
            ["userId"] = StringValue(user.UserId),
            ["email"] = StringValue(normalizedEmail),
            ["updatedAt"] = StringValue(user.UpdatedAt.ToString("O"))
        }, cancellationToken);

        // Cognito sub -> user mapping (source of truth for auth)
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"COGNITO#{cognitoSub}"),
            ["sk"] = StringValue("USER"),
            ["userId"] = StringValue(user.UserId),
            ["email"] = StringValue(normalizedEmail),
            ["emailVerified"] = BoolValue(emailVerified),
            ["signupSource"] = StringValue(signupSource ?? string.Empty),
            ["updatedAt"] = StringValue(user.UpdatedAt.ToString("O"))
        }, cancellationToken);

        return user;
    }

    public async Task<UserAccount?> GetUserByCognitoSubAsync(string cognitoSub, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"COGNITO#{cognitoSub}"),
                ["sk"] = StringValue("USER")
            }
        }, cancellationToken);

        var userId = response.Item?.GetValueOrDefault("userId")?.S;
        return string.IsNullOrWhiteSpace(userId) ? null : await GetUserByIdAsync(userId, cancellationToken);
    }

    public async Task RecordUserLoginAsync(string userId, DateTimeOffset when, CancellationToken cancellationToken)
    {
        var existing = await GetUserByIdAsync(userId, cancellationToken);
        if (existing is null) return;
        await SaveUserProfileAsync(existing with { LastLoginAt = when, UpdatedAt = DateTimeOffset.UtcNow }, cancellationToken);
        await TrackEventAsync("user_login", userId, new Dictionary<string, string?>
        {
            ["when"] = when.ToString("O")
        }, cancellationToken);
    }

    public async Task SavePaymentAsync(PaymentRecord payment, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:PaymentsTable", GetTableName("Storage:PurchasesTable", "ybai-purchases"));
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"PAYMENT#{payment.StripeCheckoutSessionId}"),
            ["sk"] = StringValue("DETAILS"),
            ["paymentId"] = StringValue(payment.PaymentId),
            ["userId"] = StringValue(payment.UserId),
            ["accountEmail"] = StringValue(payment.AccountEmail),
            ["stripeCustomerId"] = StringValue(payment.StripeCustomerId ?? string.Empty),
            ["stripeCheckoutSessionId"] = StringValue(payment.StripeCheckoutSessionId),
            ["stripePaymentIntentId"] = StringValue(payment.StripePaymentIntentId ?? string.Empty),
            ["stripeSubscriptionId"] = StringValue(payment.StripeSubscriptionId ?? string.Empty),
            ["stripeEmail"] = StringValue(payment.StripeEmail ?? string.Empty),
            ["amount"] = StringValue(payment.Amount.ToString("F2")),
            ["currency"] = StringValue(payment.Currency),
            ["status"] = StringValue(payment.Status),
            ["planCode"] = StringValue(payment.PlanCode),
            ["paymentMethodBrand"] = StringValue(payment.PaymentMethodBrand ?? string.Empty),
            ["paymentMethodLast4"] = StringValue(payment.PaymentMethodLast4 ?? string.Empty),
            ["billingCountry"] = StringValue(payment.BillingCountry ?? string.Empty),
            ["billingName"] = StringValue(payment.BillingName ?? string.Empty),
            ["receiptUrl"] = StringValue(payment.ReceiptUrl ?? string.Empty),
            ["createdAt"] = StringValue(payment.CreatedAt.ToString("O")),
            ["updatedAt"] = StringValue(payment.UpdatedAt.ToString("O")),
            ["mode"] = StringValue(string.IsNullOrWhiteSpace(payment.Mode) ? "live" : payment.Mode),
            ["paidAt"] = StringValue(payment.PaidAt?.ToString("O") ?? string.Empty)
        };

        await PutItemAsync(tableName, item, cancellationToken);
        await TrackEventAsync("payment_recorded", payment.UserId, new Dictionary<string, string?>
        {
            ["checkoutSessionId"] = payment.StripeCheckoutSessionId,
            ["planCode"] = payment.PlanCode,
            ["stripeEmail"] = payment.StripeEmail,
            ["accountEmail"] = payment.AccountEmail
        }, cancellationToken);
    }

    public async Task<PaymentRecord?> GetPaymentByCheckoutSessionIdAsync(string stripeCheckoutSessionId, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:PaymentsTable", GetTableName("Storage:PurchasesTable", "ybai-purchases"));
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"PAYMENT#{stripeCheckoutSessionId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);

        return response.Item is { Count: > 0 } ? ReadPayment(response.Item) : null;
    }

    public async Task<IReadOnlyList<PaymentRecord>> ListPaymentsByUserAsync(string userId, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:PaymentsTable", GetTableName("Storage:PurchasesTable", "ybai-purchases"));
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            FilterExpression = "begins_with(pk, :pk) AND userId = :uid",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = StringValue("PAYMENT#"),
                [":uid"] = StringValue(userId)
            },
            Limit = 200
        }, cancellationToken);

        return response.Items.Select(ReadPayment).OrderByDescending(p => p.CreatedAt).ToArray();
    }

    public async Task SaveEntitlementAsync(EntitlementRecord entitlement, CancellationToken cancellationToken)
    {
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"USER#{entitlement.UserId}"),
            ["sk"] = StringValue($"ENTITLEMENT#{entitlement.EntitlementId}"),
            ["entitlementId"] = StringValue(entitlement.EntitlementId),
            ["accessType"] = StringValue(entitlement.AccessType),
            ["status"] = StringValue(entitlement.Status),
            ["source"] = StringValue(entitlement.Source),
            ["grantedAt"] = StringValue(entitlement.GrantedAt.ToString("O")),
            ["expiresAt"] = StringValue(entitlement.ExpiresAt?.ToString("O") ?? string.Empty),
            ["paymentId"] = StringValue(entitlement.PaymentId ?? string.Empty),
            ["notes"] = StringValue(entitlement.Notes ?? string.Empty),
            ["createdAt"] = StringValue(entitlement.CreatedAt.ToString("O")),
            ["updatedAt"] = StringValue(entitlement.UpdatedAt.ToString("O")),
            ["grantedBy"] = StringValue(entitlement.GrantedBy ?? string.Empty),
            ["grantedReason"] = StringValue(entitlement.GrantedReason ?? string.Empty),
            ["revokedAt"] = StringValue(entitlement.RevokedAt?.ToString("O") ?? string.Empty)
        };

        await PutItemAsync(GetUsersTableName(), item, cancellationToken);
        await RecomputeUserAccessFromEntitlementsAsync(entitlement.UserId, cancellationToken);

        await TrackEventAsync("entitlement_saved", entitlement.UserId, new Dictionary<string, string?>
        {
            ["accessType"] = entitlement.AccessType,
            ["status"] = entitlement.Status,
            ["source"] = entitlement.Source
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<EntitlementRecord>> ListEntitlementsByUserAsync(string userId, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.QueryAsync(new QueryRequest
        {
            TableName = GetUsersTableName(),
            KeyConditionExpression = "pk = :pk AND begins_with(sk, :sk)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = StringValue($"USER#{userId}"),
                [":sk"] = StringValue("ENTITLEMENT#")
            },
            Limit = 200
        }, cancellationToken);

        return response.Items.Select(ReadEntitlement).OrderByDescending(e => e.GrantedAt).ToArray();
    }

    public async Task<bool> UserHasActiveEntitlementAsync(string userId, string accessType, CancellationToken cancellationToken)
    {
        var entitlements = await ListEntitlementsByUserAsync(userId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        return entitlements.Any(e =>
            string.Equals(e.AccessType, accessType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(e.Status, "active", StringComparison.OrdinalIgnoreCase) &&
            (e.ExpiresAt is null || e.ExpiresAt > now));
    }

    public async Task SaveMagicLinkTokenAsync(MagicLinkTokenRecord tokenRecord, CancellationToken cancellationToken)
    {
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"MAGIC#{tokenRecord.Token}"),
            ["sk"] = StringValue("DETAILS"),
            ["userId"] = StringValue(tokenRecord.UserId),
            ["email"] = StringValue(tokenRecord.Email),
            ["redirectPath"] = StringValue(tokenRecord.RedirectPath),
            ["expiresAt"] = StringValue(tokenRecord.ExpiresAt.ToString("O")),
            ["createdAt"] = StringValue(tokenRecord.CreatedAt.ToString("O"))
        }, cancellationToken);
    }

    public async Task<MagicLinkTokenRecord?> ConsumeMagicLinkTokenAsync(string token, CancellationToken cancellationToken)
    {
        var key = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"MAGIC#{token}"),
            ["sk"] = StringValue("DETAILS")
        };

        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = key
        }, cancellationToken);

        await _dynamoDb.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = GetUsersTableName(),
            Key = key
        }, cancellationToken);

        if (response.Item == null || response.Item.Count == 0)
        {
            return null;
        }

        var record = new MagicLinkTokenRecord(
            Token: token,
            UserId: response.Item.GetValueOrDefault("userId")?.S ?? string.Empty,
            Email: response.Item.GetValueOrDefault("email")?.S ?? string.Empty,
            RedirectPath: response.Item.GetValueOrDefault("redirectPath")?.S ?? "/dashboard",
            ExpiresAt: ParseDate(response.Item.GetValueOrDefault("expiresAt")?.S),
            CreatedAt: ParseDate(response.Item.GetValueOrDefault("createdAt")?.S)
        );

        return record.ExpiresAt < DateTimeOffset.UtcNow ? null : record;
    }

    public async Task SaveUserSessionAsync(UserSessionRecord sessionRecord, CancellationToken cancellationToken)
    {
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"USERSESSION#{sessionRecord.SessionId}"),
            ["sk"] = StringValue("DETAILS"),
            ["userId"] = StringValue(sessionRecord.UserId),
            ["email"] = StringValue(sessionRecord.Email),
            ["authEpoch"] = NumberValue(sessionRecord.AuthEpoch),
            ["expiresAt"] = StringValue(sessionRecord.ExpiresAt.ToString("O")),
            ["createdAt"] = StringValue(sessionRecord.CreatedAt.ToString("O"))
        }, cancellationToken);
    }

    public async Task<UserSessionRecord?> GetUserSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"USERSESSION#{sessionId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);

        if (response.Item == null || response.Item.Count == 0)
        {
            return null;
        }

        var record = new UserSessionRecord(
            SessionId: sessionId,
            UserId: response.Item.GetValueOrDefault("userId")?.S ?? string.Empty,
            Email: response.Item.GetValueOrDefault("email")?.S ?? string.Empty,
            AuthEpoch: response.Item.TryGetValue("authEpoch", out var epochAttr) ? ParseLong(epochAttr) : 0L,
            ExpiresAt: ParseDate(response.Item.GetValueOrDefault("expiresAt")?.S),
            CreatedAt: ParseDate(response.Item.GetValueOrDefault("createdAt")?.S)
        );

        if (record.ExpiresAt < DateTimeOffset.UtcNow)
        {
            await DeleteUserSessionAsync(sessionId, cancellationToken);
            return null;
        }

        return record;
    }

    public async Task DeleteUserSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        await _dynamoDb.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"USERSESSION#{sessionId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);
    }

    public async Task<long> GetUserAuthEpochAsync(string userId, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"USERAUTH#{userId}"),
                ["sk"] = StringValue("EPOCH")
            }
        }, cancellationToken);

        return response.Item is { Count: > 0 }
            && response.Item.TryGetValue("authEpoch", out var epochAttr)
                ? ParseLong(epochAttr)
                : 0L;
    }

    public async Task<long> BumpUserAuthEpochAsync(string userId, CancellationToken cancellationToken)
    {
        var nowEpoch = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"USERAUTH#{userId}"),
            ["sk"] = StringValue("EPOCH"),
            ["authEpoch"] = NumberValue(nowEpoch),
            ["updatedAt"] = StringValue(DateTimeOffset.UtcNow.ToString("O"))
        }, cancellationToken);

        return nowEpoch;
    }

    public async Task SaveAdminSessionAsync(AdminSessionRecord sessionRecord, CancellationToken cancellationToken)
    {
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"ADMINSESSION#{sessionRecord.SessionId}"),
            ["sk"] = StringValue("DETAILS"),
            ["email"] = StringValue(sessionRecord.Email),
            ["authEpoch"] = NumberValue(sessionRecord.AuthEpoch),
            ["expiresAt"] = StringValue(sessionRecord.ExpiresAt.ToString("O")),
            ["createdAt"] = StringValue(sessionRecord.CreatedAt.ToString("O"))
        }, cancellationToken);
    }

    public async Task<AdminSessionRecord?> GetAdminSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"ADMINSESSION#{sessionId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);

        if (response.Item == null || response.Item.Count == 0)
        {
            return null;
        }

        var record = new AdminSessionRecord(
            SessionId: sessionId,
            Email: response.Item.GetValueOrDefault("email")?.S ?? string.Empty,
            AuthEpoch: response.Item.TryGetValue("authEpoch", out var epochAttr) ? ParseLong(epochAttr) : 0L,
            ExpiresAt: ParseDate(response.Item.GetValueOrDefault("expiresAt")?.S),
            CreatedAt: ParseDate(response.Item.GetValueOrDefault("createdAt")?.S)
        );

        if (record.ExpiresAt < DateTimeOffset.UtcNow)
        {
            await DeleteAdminSessionAsync(sessionId, cancellationToken);
            return null;
        }

        return record;
    }

    public async Task DeleteAdminSessionAsync(string sessionId, CancellationToken cancellationToken)
    {
        await _dynamoDb.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"ADMINSESSION#{sessionId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);
    }

    public async Task<long> GetAdminAuthEpochAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = NormalizeEmail(email);
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"ADMINEPOCH#{normalized}"),
                ["sk"] = StringValue("EPOCH")
            }
        }, cancellationToken);

        return response.Item is { Count: > 0 }
            && response.Item.TryGetValue("authEpoch", out var epochAttr)
                ? ParseLong(epochAttr)
                : 0L;
    }

    public async Task<long> BumpAdminAuthEpochAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = NormalizeEmail(email);
        var nowEpoch = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"ADMINEPOCH#{normalized}"),
            ["sk"] = StringValue("EPOCH"),
            ["authEpoch"] = NumberValue(nowEpoch),
            ["updatedAt"] = StringValue(DateTimeOffset.UtcNow.ToString("O"))
        }, cancellationToken);

        return nowEpoch;
    }

    public async Task SaveUserOnboardingAsync(string userId, SaveUserOnboardingRequest request, CancellationToken cancellationToken)
    {
        var existing = await GetUserByIdAsync(userId, cancellationToken);
        if (existing is null)
        {
            return;
        }

        await SaveUserProfileAsync(existing with
        {
            ChannelUrl = request.ChannelUrl,
            GrowthGoal = request.GrowthGoal,
            UpdatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    public async Task<UserOnboardingStateResponse?> GetUserOnboardingStateAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        var settings = await GetUserYouTubeSettingsAsync(userId, cancellationToken);
        return new UserOnboardingStateResponse(
            user.UserId,
            user.Email,
            user.Purchased,
            user.OnboardingCompleted,
            user.ChannelUrl,
            user.GrowthGoal,
            settings
        );
    }

    public async Task CompleteUserOnboardingAsync(string userId, CancellationToken cancellationToken)
    {
        var existing = await GetUserByIdAsync(userId, cancellationToken);
        if (existing is null)
        {
            return;
        }

        await SaveUserProfileAsync(existing with
        {
            OnboardingCompleted = true,
            UpdatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    public async Task SaveUserYouTubeSettingsAsync(string userId, UserYouTubeSettingsRequest request, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow.ToString("O");
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"USER#{userId}"),
            ["sk"] = StringValue("INTEGRATION#YOUTUBE"),
            ["channelUrl"] = StringValue(request.ChannelUrl ?? string.Empty),
            ["credentialsJson"] = StringValue(Protect(request.CredentialsJson) ?? string.Empty),
            ["clientId"] = StringValue(Protect(request.ClientId) ?? string.Empty),
            ["clientSecret"] = StringValue(Protect(request.ClientSecret) ?? string.Empty),
            ["projectId"] = StringValue(Protect(request.ProjectId) ?? string.Empty),
            ["authUri"] = StringValue(Protect(request.AuthUri) ?? string.Empty),
            ["tokenUri"] = StringValue(Protect(request.TokenUri) ?? string.Empty),
            ["redirectUri"] = StringValue(Protect(request.RedirectUri) ?? string.Empty),
            ["updatedAt"] = StringValue(now),
            ["storageModel"] = StringValue("per-user-encrypted")
        };

        await PutItemAsync(GetUsersTableName(), item, cancellationToken);
        await TrackEventAsync("user_youtube_settings_saved", userId, new Dictionary<string, string?>
        {
            ["hasCredentialsJson"] = (!string.IsNullOrWhiteSpace(request.CredentialsJson)).ToString(),
            ["hasClientId"] = (!string.IsNullOrWhiteSpace(request.ClientId)).ToString()
        }, cancellationToken);
    }

    public async Task<UserYouTubeSettingsResponse?> GetUserYouTubeSettingsAsync(string userId, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetUsersTableName(),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"USER#{userId}"),
                ["sk"] = StringValue("INTEGRATION#YOUTUBE")
            }
        }, cancellationToken);

        if (response.Item == null || response.Item.Count == 0)
        {
            return null;
        }

        return new UserYouTubeSettingsResponse(
            UserId: userId,
            HasCredentialsJson: !string.IsNullOrWhiteSpace(response.Item.GetValueOrDefault("credentialsJson")?.S),
            HasClientId: !string.IsNullOrWhiteSpace(response.Item.GetValueOrDefault("clientId")?.S),
            HasClientSecret: !string.IsNullOrWhiteSpace(response.Item.GetValueOrDefault("clientSecret")?.S),
            ChannelUrl: EmptyToNull(response.Item.GetValueOrDefault("channelUrl")?.S),
            UpdatedAt: ParseDate(response.Item.GetValueOrDefault("updatedAt")?.S),
            StorageModel: response.Item.GetValueOrDefault("storageModel")?.S ?? "per-user-encrypted"
        );
    }

    public async Task TrackEventAsync(string eventName, string scope, IDictionary<string, string?> metadata, CancellationToken cancellationToken)
    {
        var eventId = Guid.NewGuid().ToString("N");
        var createdAt = DateTimeOffset.UtcNow;
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"ACTIVITY#{createdAt:yyyy-MM-dd}"),
            ["sk"] = StringValue($"EVENT#{createdAt:O}#{eventId}"),
            ["eventName"] = StringValue(eventName),
            ["scope"] = StringValue(scope),
            ["createdAt"] = StringValue(createdAt.ToString("O"))
        };

        foreach (var pair in metadata)
        {
            if (!string.IsNullOrWhiteSpace(pair.Value))
            {
                item[$"meta_{pair.Key}"] = StringValue(pair.Value);
            }
        }

        await PutItemAsync(GetTableName("Storage:ActivityTable", "ybai-activity"), item, cancellationToken);
    }

    public async Task<AdminDataSnapshot> GetAdminSnapshotAsync(CancellationToken cancellationToken)
    {
        var totalUsers = await CountItemsBySortKeyAsync(GetUsersTableName(), "PROFILE", cancellationToken);
        var totalDemos = await CountItemsAsync(GetTableName("Storage:DemoTable", "ybai-demo-analyses"), cancellationToken);
        var totalPurchases = await CountItemsAsync(GetTableName("Storage:PurchasesTable", "ybai-purchases"), cancellationToken);
        var recentActivity = await GetRecentActivityAsync(cancellationToken);

        return new AdminDataSnapshot(totalUsers, totalDemos, totalPurchases, recentActivity);
    }

    public async Task<AdminListResponse<AdminUserDto>> ListUsersAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var tableName = GetUsersTableName();
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            FilterExpression = "sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":sk"] = StringValue("PROFILE")
            },
            Limit = Math.Max(1, Math.Min(limit, 200)),
            ExclusiveStartKey = DecodeCursor(cursor)
        }, cancellationToken);

        var items = response.Items
            .Select(ReadUserAccount)
            .Select(u => new AdminUserDto(
                u.UserId,
                u.Email,
                u.ChannelUrl,
                u.Purchased,
                u.OnboardingCompleted,
                u.AccessStatus,
                u.CreatedAt,
                u.UpdatedAt,
                u.EmailVerified,
                string.IsNullOrWhiteSpace(u.UserStatus) ? "active" : u.UserStatus,
                u.LastLoginAt,
                u.Tags,
                u.Purchased ? "premium" : "none",
                u.AdminNotes))
            .OrderByDescending(u => u.CreatedAt)
            .ToArray();

        return new AdminListResponse<AdminUserDto>(items, EncodeCursor(response.LastEvaluatedKey));
    }

    public async Task<AdminUserDetailResponse?> GetUserDetailAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null) return null;

        var dto = new AdminUserDto(
            user.UserId,
            user.Email,
            user.ChannelUrl,
            user.Purchased,
            user.OnboardingCompleted,
            user.AccessStatus,
            user.CreatedAt,
            user.UpdatedAt,
            user.EmailVerified,
            string.IsNullOrWhiteSpace(user.UserStatus) ? "active" : user.UserStatus,
            user.LastLoginAt,
            user.Tags,
            user.Purchased ? "premium" : "none",
            user.AdminNotes);
        var onboarding = await GetUserOnboardingStateAsync(userId, cancellationToken);
        var yt = await GetUserYouTubeSettingsAsync(userId, cancellationToken);
        var purchases = await ListPurchasesByUserAsync(userId, cancellationToken);
        var stripePayments = await ListPaymentsByUserAsync(userId, cancellationToken);
        var entitlements = await ListEntitlementsByUserAsync(userId, cancellationToken);
        var events = await ListActivityForScopeAsync(userId, 80, cancellationToken);
        return new AdminUserDetailResponse(dto, onboarding, yt, purchases, stripePayments, entitlements, events);
    }

    public async Task<AdminListResponse<PurchaseRecord>> ListPurchasesAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:PurchasesTable", "ybai-purchases");
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            Limit = Math.Max(1, Math.Min(limit, 200)),
            ExclusiveStartKey = DecodeCursor(cursor)
        }, cancellationToken);

        var items = response.Items
            .Select(ReadPurchase)
            .OrderByDescending(p => p.PurchasedAt)
            .ToArray();

        return new AdminListResponse<PurchaseRecord>(items, EncodeCursor(response.LastEvaluatedKey));
    }

    public async Task<AdminListResponse<AdminSupportTicketDto>> ListSupportTicketsAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:SupportTable", "ybai-support");
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            FilterExpression = "sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":sk"] = StringValue("DETAILS")
            },
            Limit = Math.Max(1, Math.Min(limit, 200)),
            ExclusiveStartKey = DecodeCursor(cursor)
        }, cancellationToken);

        var items = response.Items
            .Select(ReadSupportTicket)
            .OrderByDescending(t => t.CreatedAt)
            .ToArray();

        return new AdminListResponse<AdminSupportTicketDto>(items, EncodeCursor(response.LastEvaluatedKey));
    }

    public async Task<AdminSupportTicketDetailResponse?> GetSupportTicketAsync(string ticketId, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:SupportTable", "ybai-support");
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"TICKET#{ticketId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);

        if (response.Item is null || response.Item.Count == 0) return null;
        var ticket = ReadSupportTicket(response.Item);
        var thread = await ListSupportThreadAsync(ticketId, cancellationToken);
        var message = response.Item.GetValueOrDefault("message")?.S ?? string.Empty;
        var name = EmptyToNull(response.Item.GetValueOrDefault("name")?.S);
        return new AdminSupportTicketDetailResponse(ticket, name, message, thread);
    }

    public async Task SaveSupportReplyAsync(string ticketId, string subject, string body, string? sesMessageId, string? deliveryStatus, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:SupportTable", "ybai-support");
        var sentAt = DateTimeOffset.UtcNow;
        var messageId = $"msg_{Guid.NewGuid():N}";
        var msg = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"TICKET#{ticketId}"),
            ["sk"] = StringValue($"MSG#{sentAt:O}#{messageId}"),
            ["direction"] = StringValue("outbound"),
            ["subject"] = StringValue(subject),
            ["body"] = StringValue(body),
            ["sentAt"] = StringValue(sentAt.ToString("O")),
            ["createdByType"] = StringValue("admin"),
            ["deliveryStatus"] = StringValue(deliveryStatus ?? "sent")
        };
        if (!string.IsNullOrWhiteSpace(sesMessageId))
        {
            msg["sesMessageId"] = StringValue(sesMessageId);
        }

        await PutItemAsync(tableName, msg, cancellationToken);

        await _dynamoDb.UpdateItemAsync(new UpdateItemRequest
        {
            TableName = tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"TICKET#{ticketId}"),
                ["sk"] = StringValue("DETAILS")
            },
            UpdateExpression = "SET updatedAt = :u, lastMessageAt = :u",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":u"] = StringValue(sentAt.ToString("O"))
            }
        }, cancellationToken);

        await TrackEventAsync("support_reply_sent", ticketId, new Dictionary<string, string?>
        {
            ["messageId"] = messageId,
            ["sesMessageId"] = sesMessageId
        }, cancellationToken);
    }

    public async Task<AdminListResponse<AdminDemoAuditDto>> ListDemoAuditsAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:DemoTable", "ybai-demo-analyses");
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            FilterExpression = "sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":sk"] = StringValue("DETAILS")
            },
            Limit = Math.Max(1, Math.Min(limit, 200)),
            ExclusiveStartKey = DecodeCursor(cursor)
        }, cancellationToken);

        var items = response.Items.Select(ReadDemoAudit).OrderByDescending(d => d.CreatedAt).ToArray();
        return new AdminListResponse<AdminDemoAuditDto>(items, EncodeCursor(response.LastEvaluatedKey));
    }

    private PurchaseRecord ReadPurchase(Dictionary<string, AttributeValue> item)
    {
        return new PurchaseRecord(
            PurchaseId: item.GetValueOrDefault("purchaseId")?.S ?? item.GetValueOrDefault("pk")?.S?.Replace("PURCHASE#", string.Empty, StringComparison.OrdinalIgnoreCase) ?? string.Empty,
            UserId: item.GetValueOrDefault("userId")?.S ?? string.Empty,
            Email: item.GetValueOrDefault("email")?.S ?? string.Empty,
            Amount: decimal.TryParse(item.GetValueOrDefault("amount")?.N, out var amount) ? amount : 0m,
            Currency: item.GetValueOrDefault("currency")?.S ?? "USD",
            Status: item.GetValueOrDefault("status")?.S ?? "unknown",
            PriceVersion: item.GetValueOrDefault("priceVersion")?.S ?? string.Empty,
            PurchasedAt: ParseDate(item.GetValueOrDefault("purchasedAt")?.S)
        );
    }

    private AdminSupportTicketDto ReadSupportTicket(Dictionary<string, AttributeValue> item)
    {
        var pk = item.GetValueOrDefault("pk")?.S ?? string.Empty;
        var ticketId = pk.Replace("TICKET#", string.Empty, StringComparison.OrdinalIgnoreCase);
        var rawStatus = item.GetValueOrDefault("status")?.S ?? "open";
        var statusNorm = string.Equals(rawStatus, "new", StringComparison.OrdinalIgnoreCase) ? "open" : rawStatus;
        var name = EmptyToNull(item.GetValueOrDefault("name")?.S);

        return new AdminSupportTicketDto(
            TicketId: ticketId,
            Email: item.GetValueOrDefault("email")?.S ?? string.Empty,
            Name: name,
            Subject: item.GetValueOrDefault("subject")?.S ?? string.Empty,
            Status: statusNorm,
            ProductArea: item.GetValueOrDefault("productArea")?.S ?? "general",
            ChannelUrl: EmptyToNull(item.GetValueOrDefault("channelUrl")?.S),
            CreatedAt: ParseDate(item.GetValueOrDefault("createdAt")?.S),
            UpdatedAt: ParseDate(item.GetValueOrDefault("updatedAt")?.S),
            Priority: EmptyToNull(item.GetValueOrDefault("priority")?.S),
            LinkedUserId: EmptyToNull(item.GetValueOrDefault("linkedUserId")?.S)
        );
    }

    private AdminDemoAuditDto ReadDemoAudit(Dictionary<string, AttributeValue> item)
    {
        var pk = item.GetValueOrDefault("pk")?.S ?? string.Empty;
        var demoId = pk.Replace("DEMO#", string.Empty, StringComparison.OrdinalIgnoreCase);
        return new AdminDemoAuditDto(
            DemoId: demoId,
            ChannelInput: item.GetValueOrDefault("channelInput")?.S ?? string.Empty,
            ChannelTitle: item.GetValueOrDefault("channelTitle")?.S ?? string.Empty,
            ChannelHandle: item.GetValueOrDefault("channelHandle")?.S ?? string.Empty,
            HealthScore: int.TryParse(item.GetValueOrDefault("healthScore")?.S, out var score) ? score : 0,
            Email: EmptyToNull(item.GetValueOrDefault("email")?.S),
            CreatedAt: ParseDate(item.GetValueOrDefault("createdAt")?.S),
            AuditType: item.GetValueOrDefault("auditType")?.S ?? "demo",
            Status: item.GetValueOrDefault("auditStatus")?.S ?? "completed",
            Visibility: item.GetValueOrDefault("visibility")?.S ?? "preview",
            LinkedUserId: EmptyToNull(item.GetValueOrDefault("linkedUserId")?.S)
        );
    }

    private async Task<IReadOnlyList<AdminSupportMessageDto>> ListSupportThreadAsync(string ticketId, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:SupportTable", "ybai-support");
        var response = await _dynamoDb.QueryAsync(new QueryRequest
        {
            TableName = tableName,
            KeyConditionExpression = "pk = :pk and begins_with(sk, :skPrefix)",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = StringValue($"TICKET#{ticketId}"),
                [":skPrefix"] = StringValue("MSG#")
            },
            ScanIndexForward = true
        }, cancellationToken);

        return response.Items.Select(item => new AdminSupportMessageDto(
            MessageId: item.GetValueOrDefault("sk")?.S?.Split('#').LastOrDefault() ?? string.Empty,
            Direction: item.GetValueOrDefault("direction")?.S ?? "outbound",
            Subject: item.GetValueOrDefault("subject")?.S ?? string.Empty,
            Body: item.GetValueOrDefault("body")?.S ?? string.Empty,
            SentAt: ParseDate(item.GetValueOrDefault("sentAt")?.S),
            SesMessageId: EmptyToNull(item.GetValueOrDefault("sesMessageId")?.S),
            DeliveryStatus: EmptyToNull(item.GetValueOrDefault("deliveryStatus")?.S)
        )).ToArray();
    }

    private async Task<IReadOnlyList<PurchaseRecord>> ListPurchasesByUserAsync(string userId, CancellationToken cancellationToken)
    {
        var purchases = await ListPurchasesAsync(50, null, cancellationToken);
        return purchases.Items.Where(p => string.Equals(p.UserId, userId, StringComparison.OrdinalIgnoreCase)).ToArray();
    }

    private static Dictionary<string, AttributeValue>? DecodeCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor)) return null;
        try
        {
            var json = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
            return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, AttributeValue>>(json);
        }
        catch
        {
            return null;
        }
    }

    private static string? EncodeCursor(Dictionary<string, AttributeValue>? key)
    {
        if (key is null || key.Count == 0) return null;
        var json = System.Text.Json.JsonSerializer.Serialize(key);
        return Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(json));
    }

    private async Task SaveUserProfileAsync(UserAccount user, CancellationToken cancellationToken)
    {
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"USER#{user.UserId}"),
            ["sk"] = StringValue("PROFILE"),
            ["cognitoSub"] = StringValue(user.CognitoSub ?? string.Empty),
            ["email"] = StringValue(user.Email),
            ["emailVerified"] = BoolValue(user.EmailVerified),
            ["purchased"] = BoolValue(user.Purchased),
            ["onboardingCompleted"] = BoolValue(user.OnboardingCompleted),
            ["accessStatus"] = StringValue(user.AccessStatus),
            ["channelUrl"] = StringValue(user.ChannelUrl ?? string.Empty),
            ["growthGoal"] = StringValue(user.GrowthGoal ?? string.Empty),
            ["lastLoginAt"] = StringValue(user.LastLoginAt?.ToString("O") ?? string.Empty),
            ["createdAt"] = StringValue(user.CreatedAt.ToString("O")),
            ["updatedAt"] = StringValue(user.UpdatedAt.ToString("O")),
            ["userStatus"] = StringValue(string.IsNullOrWhiteSpace(user.UserStatus) ? "active" : user.UserStatus),
            ["adminNotes"] = StringValue(user.AdminNotes ?? string.Empty),
            ["tags"] = StringValue(user.Tags ?? string.Empty),
            ["lastSeenAt"] = StringValue(user.LastSeenAt?.ToString("O") ?? string.Empty)
        }, cancellationToken);
    }

    private UserAccount ReadUserAccount(Dictionary<string, AttributeValue> item)
    {
        var userId = item.GetValueOrDefault("pk")?.S?.Replace("USER#", string.Empty, StringComparison.OrdinalIgnoreCase) ?? string.Empty;
        return new UserAccount(
            UserId: userId,
            CognitoSub: EmptyToNull(item.GetValueOrDefault("cognitoSub")?.S),
            Email: item.GetValueOrDefault("email")?.S ?? string.Empty,
            EmailVerified: item.GetValueOrDefault("emailVerified")?.BOOL ?? false,
            Purchased: item.GetValueOrDefault("purchased")?.BOOL ?? false,
            OnboardingCompleted: item.GetValueOrDefault("onboardingCompleted")?.BOOL ?? false,
            AccessStatus: item.GetValueOrDefault("accessStatus")?.S ?? "demo",
            ChannelUrl: EmptyToNull(item.GetValueOrDefault("channelUrl")?.S),
            GrowthGoal: EmptyToNull(item.GetValueOrDefault("growthGoal")?.S),
            LastLoginAt: ParseNullableDate(item.GetValueOrDefault("lastLoginAt")?.S),
            CreatedAt: ParseDate(item.GetValueOrDefault("createdAt")?.S),
            UpdatedAt: ParseDate(item.GetValueOrDefault("updatedAt")?.S),
            UserStatus: string.IsNullOrWhiteSpace(item.GetValueOrDefault("userStatus")?.S) ? "active" : item.GetValueOrDefault("userStatus")!.S,
            AdminNotes: EmptyToNull(item.GetValueOrDefault("adminNotes")?.S),
            Tags: EmptyToNull(item.GetValueOrDefault("tags")?.S),
            LastSeenAt: ParseNullableDate(item.GetValueOrDefault("lastSeenAt")?.S)
        );
    }

    private static DateTimeOffset? ParseNullableDate(string? value)
        => DateTimeOffset.TryParse(value, out var parsed) ? parsed : null;

    private static PaymentRecord ReadPayment(Dictionary<string, AttributeValue> item)
    {
        var paymentId = item.GetValueOrDefault("paymentId")?.S ?? string.Empty;
        var userId = item.GetValueOrDefault("userId")?.S ?? string.Empty;
        var accountEmail = item.GetValueOrDefault("accountEmail")?.S ?? string.Empty;
        return new PaymentRecord(
            PaymentId: paymentId,
            UserId: userId,
            AccountEmail: accountEmail,
            StripeCustomerId: EmptyToNull(item.GetValueOrDefault("stripeCustomerId")?.S),
            StripeCheckoutSessionId: item.GetValueOrDefault("stripeCheckoutSessionId")?.S
                ?? item.GetValueOrDefault("pk")?.S?.Replace("PAYMENT#", string.Empty, StringComparison.OrdinalIgnoreCase)
                ?? string.Empty,
            StripePaymentIntentId: EmptyToNull(item.GetValueOrDefault("stripePaymentIntentId")?.S),
            StripeSubscriptionId: EmptyToNull(item.GetValueOrDefault("stripeSubscriptionId")?.S),
            StripeEmail: EmptyToNull(item.GetValueOrDefault("stripeEmail")?.S),
            Amount: decimal.TryParse(item.GetValueOrDefault("amount")?.S, out var amt) ? amt : 0m,
            Currency: item.GetValueOrDefault("currency")?.S ?? "USD",
            Status: item.GetValueOrDefault("status")?.S ?? "unknown",
            PlanCode: item.GetValueOrDefault("planCode")?.S ?? "default",
            PaymentMethodBrand: EmptyToNull(item.GetValueOrDefault("paymentMethodBrand")?.S),
            PaymentMethodLast4: EmptyToNull(item.GetValueOrDefault("paymentMethodLast4")?.S),
            BillingCountry: EmptyToNull(item.GetValueOrDefault("billingCountry")?.S),
            BillingName: EmptyToNull(item.GetValueOrDefault("billingName")?.S),
            ReceiptUrl: EmptyToNull(item.GetValueOrDefault("receiptUrl")?.S),
            CreatedAt: ParseDate(item.GetValueOrDefault("createdAt")?.S),
            UpdatedAt: ParseDate(item.GetValueOrDefault("updatedAt")?.S),
            Mode: string.IsNullOrWhiteSpace(item.GetValueOrDefault("mode")?.S) ? "live" : item.GetValueOrDefault("mode")!.S,
            PaidAt: ParseNullableDate(item.GetValueOrDefault("paidAt")?.S)
        );
    }

    private static EntitlementRecord ReadEntitlement(Dictionary<string, AttributeValue> item)
    {
        var userPk = item.GetValueOrDefault("pk")?.S ?? string.Empty;
        var userId = userPk.Replace("USER#", string.Empty, StringComparison.OrdinalIgnoreCase);
        var entId = item.GetValueOrDefault("entitlementId")?.S
            ?? item.GetValueOrDefault("sk")?.S?.Replace("ENTITLEMENT#", string.Empty, StringComparison.OrdinalIgnoreCase)
            ?? string.Empty;
        return new EntitlementRecord(
            EntitlementId: entId,
            UserId: userId,
            AccessType: item.GetValueOrDefault("accessType")?.S ?? "premium",
            Status: item.GetValueOrDefault("status")?.S ?? "active",
            Source: item.GetValueOrDefault("source")?.S ?? "stripe",
            GrantedAt: ParseDate(item.GetValueOrDefault("grantedAt")?.S),
            ExpiresAt: ParseNullableDate(item.GetValueOrDefault("expiresAt")?.S),
            PaymentId: EmptyToNull(item.GetValueOrDefault("paymentId")?.S),
            Notes: EmptyToNull(item.GetValueOrDefault("notes")?.S),
            CreatedAt: ParseDate(item.GetValueOrDefault("createdAt")?.S),
            UpdatedAt: ParseDate(item.GetValueOrDefault("updatedAt")?.S),
            GrantedBy: EmptyToNull(item.GetValueOrDefault("grantedBy")?.S),
            GrantedReason: EmptyToNull(item.GetValueOrDefault("grantedReason")?.S),
            RevokedAt: ParseNullableDate(item.GetValueOrDefault("revokedAt")?.S)
        );
    }

    private async Task PutItemAsync(string tableName, Dictionary<string, AttributeValue> item, CancellationToken cancellationToken)
    {
        await _dynamoDb.PutItemAsync(new PutItemRequest
        {
            TableName = tableName,
            Item = item
        }, cancellationToken);
    }

    private async Task<int> CountItemsAsync(string tableName, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            Select = Select.COUNT
        }, cancellationToken);

        return response.Count;
    }

    private async Task<int> CountItemsBySortKeyAsync(string tableName, string sortKey, CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            FilterExpression = "sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":sk"] = StringValue(sortKey)
            }
        }, cancellationToken);

        return response.Count;
    }

    private async Task<IReadOnlyList<ActivityFeedItem>> GetRecentActivityAsync(CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:ActivityTable", "ybai-activity");
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            Limit = 10
        }, cancellationToken);

        return response.Items
            .Select(item => new ActivityFeedItem(
                item.GetValueOrDefault("eventName")?.S ?? "activity",
                item.GetValueOrDefault("scope")?.S ?? string.Empty,
                ParseDate(item.GetValueOrDefault("createdAt")?.S)
            ))
            .OrderByDescending(item => item.Timestamp)
            .Take(10)
            .ToArray();
    }

    private string GetUsersTableName() => GetTableName("Storage:UsersTable", "ybai-users");

    private string GetTableName(string configKey, string fallback) => _configuration[configKey] ?? fallback;

    private string? Protect(string? value) => string.IsNullOrWhiteSpace(value) ? null : _protector.Protect(value);

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private static DateTimeOffset ParseDate(string? value) => DateTimeOffset.TryParse(value, out var parsed) ? parsed : DateTimeOffset.UtcNow;

    private static long ParseLong(AttributeValue attribute)
    {
        // Dynamo stores numeric attributes as `N`; older/alternate writes may have used `S`.
        if (!string.IsNullOrWhiteSpace(attribute.N) && long.TryParse(attribute.N, out var parsedN)) return parsedN;
        if (!string.IsNullOrWhiteSpace(attribute.S) && long.TryParse(attribute.S, out var parsedS)) return parsedS;
        return 0L;
    }

    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private static AttributeValue StringValue(string value) => new() { S = value };

    private static AttributeValue BoolValue(bool value) => new() { BOOL = value };

    private static AttributeValue NumberValue(long value) => new() { N = value.ToString() };
}
