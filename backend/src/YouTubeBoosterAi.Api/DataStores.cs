using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Microsoft.AspNetCore.DataProtection;

namespace YouTubeBoosterAi.Api;

public interface IAppDataStore
{
    Task SaveDemoAsync(DemoAnalysisRequest request, DemoAnalysisResponse response, CancellationToken cancellationToken);
    Task<string> SaveSupportTicketAsync(SupportTicketRequest request, CancellationToken cancellationToken);
    Task SavePurchaseAsync(PurchaseRecord purchase, CancellationToken cancellationToken);
    Task<UserAccount> UpsertPurchasedUserAsync(string email, string? channelInput, CancellationToken cancellationToken);
    Task<UserAccount?> GetUserByEmailAsync(string email, CancellationToken cancellationToken);
    Task<UserAccount?> GetUserByIdAsync(string userId, CancellationToken cancellationToken);
    Task SaveMagicLinkTokenAsync(MagicLinkTokenRecord tokenRecord, CancellationToken cancellationToken);
    Task<MagicLinkTokenRecord?> ConsumeMagicLinkTokenAsync(string token, CancellationToken cancellationToken);
    Task SaveUserSessionAsync(UserSessionRecord sessionRecord, CancellationToken cancellationToken);
    Task<UserSessionRecord?> GetUserSessionAsync(string sessionId, CancellationToken cancellationToken);
    Task DeleteUserSessionAsync(string sessionId, CancellationToken cancellationToken);
    Task SaveAdminSessionAsync(AdminSessionRecord sessionRecord, CancellationToken cancellationToken);
    Task<AdminSessionRecord?> GetAdminSessionAsync(string sessionId, CancellationToken cancellationToken);
    Task DeleteAdminSessionAsync(string sessionId, CancellationToken cancellationToken);
    Task SaveUserOnboardingAsync(string userId, SaveUserOnboardingRequest request, CancellationToken cancellationToken);
    Task<UserOnboardingStateResponse?> GetUserOnboardingStateAsync(string userId, CancellationToken cancellationToken);
    Task CompleteUserOnboardingAsync(string userId, CancellationToken cancellationToken);
    Task SaveUserYouTubeSettingsAsync(string userId, UserYouTubeSettingsRequest request, CancellationToken cancellationToken);
    Task<UserYouTubeSettingsResponse?> GetUserYouTubeSettingsAsync(string userId, CancellationToken cancellationToken);
    Task TrackEventAsync(string eventName, string scope, IDictionary<string, string?> metadata, CancellationToken cancellationToken);
    Task<AdminDataSnapshot> GetAdminSnapshotAsync(CancellationToken cancellationToken);
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

public sealed class InMemoryAppDataStore : IAppDataStore
{
    private readonly List<DemoAnalysisResponse> _demos = [];
    private readonly List<PurchaseRecord> _purchases = [];
    private readonly List<ActivityFeedItem> _activity = [];
    private readonly List<string> _supportTickets = [];
    private readonly Dictionary<string, UserAccount> _usersById = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _userIdsByEmail = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, MagicLinkTokenRecord> _magicLinkTokens = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, UserSessionRecord> _userSessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, AdminSessionRecord> _adminSessions = new(StringComparer.OrdinalIgnoreCase);
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

    public Task<string> SaveSupportTicketAsync(SupportTicketRequest request, CancellationToken cancellationToken)
    {
        var ticketId = $"ticket_{Guid.NewGuid():N}";
        _supportTickets.Add(ticketId);
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
            Email: normalizedEmail,
            Purchased: true,
            OnboardingCompleted: existing?.OnboardingCompleted ?? false,
            AccessStatus: "purchased",
            ChannelUrl: existing?.ChannelUrl ?? channelInput,
            GrowthGoal: existing?.GrowthGoal,
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

    private string? Protect(string? value) => string.IsNullOrWhiteSpace(value) ? null : _protector.Protect(value);

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}

public sealed class DynamoDbAppDataStore : IAppDataStore
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

    public async Task<string> SaveSupportTicketAsync(SupportTicketRequest request, CancellationToken cancellationToken)
    {
        var ticketId = $"ticket_{Guid.NewGuid():N}";
        var now = DateTimeOffset.UtcNow.ToString("O");
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"TICKET#{ticketId}"),
            ["sk"] = StringValue("DETAILS"),
            ["email"] = StringValue(request.Email),
            ["name"] = StringValue(request.Name ?? string.Empty),
            ["subject"] = StringValue(request.Subject),
            ["message"] = StringValue(request.Message),
            ["productArea"] = StringValue(request.ProductArea),
            ["channelUrl"] = StringValue(request.ChannelUrl ?? string.Empty),
            ["status"] = StringValue("new"),
            ["createdAt"] = StringValue(now),
            ["updatedAt"] = StringValue(now)
        };

        await PutItemAsync(GetTableName("Storage:SupportTable", "ybai-support"), item, cancellationToken);
        await TrackEventAsync("support_submitted", request.Subject, new Dictionary<string, string?>
        {
            ["ticketId"] = ticketId,
            ["productArea"] = request.ProductArea
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
            Email: normalizedEmail,
            Purchased: true,
            OnboardingCompleted: existing?.OnboardingCompleted ?? false,
            AccessStatus: "purchased",
            ChannelUrl: existing?.ChannelUrl ?? channelInput,
            GrowthGoal: existing?.GrowthGoal,
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
            RedirectPath: response.Item.GetValueOrDefault("redirectPath")?.S ?? "/app/onboarding",
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

    public async Task SaveAdminSessionAsync(AdminSessionRecord sessionRecord, CancellationToken cancellationToken)
    {
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"ADMINSESSION#{sessionRecord.SessionId}"),
            ["sk"] = StringValue("DETAILS"),
            ["email"] = StringValue(sessionRecord.Email),
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

    private async Task SaveUserProfileAsync(UserAccount user, CancellationToken cancellationToken)
    {
        await PutItemAsync(GetUsersTableName(), new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"USER#{user.UserId}"),
            ["sk"] = StringValue("PROFILE"),
            ["email"] = StringValue(user.Email),
            ["purchased"] = BoolValue(user.Purchased),
            ["onboardingCompleted"] = BoolValue(user.OnboardingCompleted),
            ["accessStatus"] = StringValue(user.AccessStatus),
            ["channelUrl"] = StringValue(user.ChannelUrl ?? string.Empty),
            ["growthGoal"] = StringValue(user.GrowthGoal ?? string.Empty),
            ["createdAt"] = StringValue(user.CreatedAt.ToString("O")),
            ["updatedAt"] = StringValue(user.UpdatedAt.ToString("O"))
        }, cancellationToken);
    }

    private UserAccount ReadUserAccount(Dictionary<string, AttributeValue> item)
    {
        var userId = item.GetValueOrDefault("pk")?.S?.Replace("USER#", string.Empty, StringComparison.OrdinalIgnoreCase) ?? string.Empty;
        return new UserAccount(
            UserId: userId,
            Email: item.GetValueOrDefault("email")?.S ?? string.Empty,
            Purchased: item.GetValueOrDefault("purchased")?.BOOL ?? false,
            OnboardingCompleted: item.GetValueOrDefault("onboardingCompleted")?.BOOL ?? false,
            AccessStatus: item.GetValueOrDefault("accessStatus")?.S ?? "demo",
            ChannelUrl: EmptyToNull(item.GetValueOrDefault("channelUrl")?.S),
            GrowthGoal: EmptyToNull(item.GetValueOrDefault("growthGoal")?.S),
            CreatedAt: ParseDate(item.GetValueOrDefault("createdAt")?.S),
            UpdatedAt: ParseDate(item.GetValueOrDefault("updatedAt")?.S)
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

    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    private static AttributeValue StringValue(string value) => new() { S = value };

    private static AttributeValue BoolValue(bool value) => new() { BOOL = value };
}
