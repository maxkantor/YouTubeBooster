using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

namespace YouTubeBoosterAi.Api;

public sealed partial class DynamoDbAppDataStore : IAppDataStore
{
    private async Task RecomputeUserAccessFromEntitlementsAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null) return;

        var ents = await ListEntitlementsByUserAsync(userId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var hasActive = ents.Any(e =>
            string.Equals(e.Status, "active", StringComparison.OrdinalIgnoreCase) &&
            (e.ExpiresAt is null || e.ExpiresAt > now));

        await SaveUserProfileAsync(user with
        {
            Purchased = hasActive,
            AccessStatus = hasActive ? "entitled" : "free",
            UpdatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<ActivityFeedItem>> ListActivityForScopeAsync(string scope, int limit, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:ActivityTable", "ybai-activity");
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            Limit = Math.Max(50, Math.Min(limit * 5, 500))
        }, cancellationToken);

        var rows = response.Items
            .Select(item => new ActivityFeedItem(
                item.GetValueOrDefault("eventName")?.S ?? "activity",
                item.GetValueOrDefault("scope")?.S ?? string.Empty,
                ParseDate(item.GetValueOrDefault("createdAt")?.S)))
            .Where(a =>
                string.Equals(a.Detail, scope, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(a.Title, scope, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(a => a.Timestamp)
            .Take(Math.Max(1, limit))
            .ToArray();
        return rows;
    }

    public async Task<AdminOperationalDashboardResponse> GetOperationalDashboardAsync(string range, CancellationToken cancellationToken)
    {
        var snapshot = await GetAdminSnapshotAsync(cancellationToken);
        var paymentsTable = GetTableName("Storage:PaymentsTable", GetTableName("Storage:PurchasesTable", "ybai-purchases"));
        var payScan = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = paymentsTable,
            FilterExpression = "begins_with(pk, :p) AND sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":p"] = StringValue("PAYMENT#"),
                [":sk"] = StringValue("DETAILS")
            },
            Limit = 5000
        }, cancellationToken);

        var payments = payScan.Items.Select(ReadPayment).ToArray();
        var livePaid = payments.Where(p =>
            string.Equals(p.Status, "completed", StringComparison.OrdinalIgnoreCase) &&
            p.Amount > 0 &&
            string.Equals(p.Mode, "live", StringComparison.OrdinalIgnoreCase)).ToArray();
        var revenue = livePaid.Sum(p => p.Amount);
        var unmatched = payments.Count(p => string.IsNullOrWhiteSpace(p.UserId)) +
            payments.Count(p => string.Equals(p.Status, "completed", StringComparison.OrdinalIgnoreCase) && p.Amount == 0 && string.Equals(p.Mode, "live", StringComparison.OrdinalIgnoreCase)) / 2;

        var failed = payments.Count(p =>
            string.Equals(p.Status, "failed", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p.Status, "unpaid", StringComparison.OrdinalIgnoreCase));

        var demoToPaid = snapshot.TotalDemos == 0
            ? 0d
            : Math.Min(100d, livePaid.Length / (double)Math.Max(1, snapshot.TotalDemos) * 100d);

        var usersSnap = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = GetUsersTableName(),
            FilterExpression = "sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue> { [":sk"] = StringValue("PROFILE") },
            Limit = 5000
        }, cancellationToken);
        var profiles = usersSnap.Items.Select(ReadUserAccount).ToArray();
        var entitledActive = profiles.Count(u =>
            u.Purchased &&
            string.Equals(string.IsNullOrWhiteSpace(u.UserStatus) ? "active" : u.UserStatus, "active", StringComparison.OrdinalIgnoreCase));

        var supportTickets = await ListSupportTicketsAsync(200, null, cancellationToken);
        var openTickets = supportTickets.Items.Count(t =>
            !string.Equals(t.Status, "closed", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(t.Status, "resolved", StringComparison.OrdinalIgnoreCase));

        var recent = await GetRecentActivityAsync(cancellationToken);
        var attention = new List<AdminAttentionItemDto>();
        if (unmatched > 0)
            attention.Add(new AdminAttentionItemDto("unmatched", "Payments or orders with missing user linkage or zero-amount live completions.", null));
        if (failed > 0)
            attention.Add(new AdminAttentionItemDto("failed_payments", $"{failed} failed/unpaid payment rows.", null));

        var ordersAttention = payments
            .Where(p => string.IsNullOrWhiteSpace(p.UserId) || p.Amount == 0 || string.Equals(p.Status, "failed", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(p => p.CreatedAt)
            .Take(50)
            .Select(p => new AdminOrderRowDto(
                p.PaymentId,
                p.StripeCheckoutSessionId,
                string.IsNullOrWhiteSpace(p.UserId) ? null : p.UserId,
                p.AccountEmail,
                p.StripeEmail,
                p.Amount,
                p.Currency,
                p.Status,
                p.Mode,
                p.PlanCode,
                ClassifyPayment(p),
                p.CreatedAt,
                p.PaidAt))
            .ToArray();

        var supportQueue = supportTickets.Items
            .Where(t => !string.Equals(t.Status, "closed", StringComparison.OrdinalIgnoreCase))
            .Take(25)
            .ToArray();

        var entitledUsers = profiles
            .Where(u => u.Purchased)
            .OrderByDescending(u => u.UpdatedAt)
            .Take(15)
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
                "premium",
                u.AdminNotes))
            .ToArray();

        var audits = await ListDemoAuditsAsync(25, null, cancellationToken);

        return new AdminOperationalDashboardResponse(
            range,
            new AdminOperationalKpis(
                snapshot.TotalUsers,
                entitledActive,
                snapshot.TotalDemos,
                livePaid.Length,
                revenue,
                demoToPaid,
                failed,
                openTickets,
                payments.Count(p => string.IsNullOrWhiteSpace(p.UserId))),
            recent,
            ordersAttention,
            supportQueue,
            entitledUsers,
            audits.Items.Take(15).ToArray(),
            attention.ToArray());
    }

    private static string ClassifyPayment(PaymentRecord p)
    {
        if (string.Equals(p.Mode, "test", StringComparison.OrdinalIgnoreCase)) return "test";
        if (string.IsNullOrWhiteSpace(p.UserId)) return "unmatched_user";
        if (p.Amount <= 0 && string.Equals(p.Status, "completed", StringComparison.OrdinalIgnoreCase)) return "zero_or_free";
        if (string.Equals(p.Status, "completed", StringComparison.OrdinalIgnoreCase) && p.Amount > 0 && string.Equals(p.Mode, "live", StringComparison.OrdinalIgnoreCase)) return "live_paid";
        return p.Status;
    }

    public async Task<AdminListResponse<AdminOrderRowDto>> ListPaymentOrdersAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:PaymentsTable", GetTableName("Storage:PurchasesTable", "ybai-purchases"));
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            FilterExpression = "begins_with(pk, :p) AND sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":p"] = StringValue("PAYMENT#"),
                [":sk"] = StringValue("DETAILS")
            },
            Limit = Math.Max(1, Math.Min(limit, 200)),
            ExclusiveStartKey = DecodeCursor(cursor)
        }, cancellationToken);

        var items = response.Items
            .Select(ReadPayment)
            .Select(p => new AdminOrderRowDto(
                p.PaymentId,
                p.StripeCheckoutSessionId,
                string.IsNullOrWhiteSpace(p.UserId) ? null : p.UserId,
                p.AccountEmail,
                p.StripeEmail,
                p.Amount,
                p.Currency,
                p.Status,
                p.Mode,
                p.PlanCode,
                ClassifyPayment(p),
                p.CreatedAt,
                p.PaidAt))
            .OrderByDescending(p => p.CreatedAt)
            .ToArray();

        return new AdminListResponse<AdminOrderRowDto>(items, EncodeCursor(response.LastEvaluatedKey));
    }

    public async Task<AdminListResponse<AdminActivityEventDto>> ListActivityEventsAsync(int limit, string? cursor, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:ActivityTable", "ybai-activity");
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = tableName,
            Limit = Math.Max(1, Math.Min(limit, 200)),
            ExclusiveStartKey = DecodeCursor(cursor)
        }, cancellationToken);

        var items = response.Items
            .Select(ReadActivityEvent)
            .OrderByDescending(a => a.CreatedAt)
            .ToArray();

        return new AdminListResponse<AdminActivityEventDto>(items, EncodeCursor(response.LastEvaluatedKey));
    }

    private static AdminActivityEventDto ReadActivityEvent(Dictionary<string, AttributeValue> item)
    {
        var meta = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var kv in item)
        {
            if (!kv.Key.StartsWith("meta_", StringComparison.Ordinal)) continue;
            var key = kv.Key.Substring(5);
            meta[key] = kv.Value.S;
        }

        return new AdminActivityEventDto(
            item.GetValueOrDefault("eventName")?.S ?? "",
            item.GetValueOrDefault("scope")?.S ?? "",
            ParseDate(item.GetValueOrDefault("createdAt")?.S),
            meta);
    }

    public async Task UpdateUserAdminAsync(string userId, AdminUserPatchRequest request, string adminEmail, CancellationToken cancellationToken)
    {
        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null) return;

        var next = user with
        {
            UserStatus = request.UserStatus ?? user.UserStatus,
            AdminNotes = request.AdminNotes ?? user.AdminNotes,
            Tags = request.Tags ?? user.Tags,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await SaveUserProfileAsync(next, cancellationToken);
        await TrackEventAsync("admin_user_updated", userId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["userStatus"] = next.UserStatus
        }, cancellationToken);
    }

    public async Task GrantEntitlementAdminAsync(string userId, AdminGrantEntitlementRequest request, string adminEmail, CancellationToken cancellationToken)
    {
        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null) return;

        var id = $"ent_admin_{Guid.NewGuid():N}";
        var now = DateTimeOffset.UtcNow;
        var ent = new EntitlementRecord(
            EntitlementId: id,
            UserId: userId,
            AccessType: request.AccessType,
            Status: "active",
            Source: "manual",
            GrantedAt: now,
            ExpiresAt: request.ExpiresAt,
            PaymentId: null,
            Notes: request.Reason,
            CreatedAt: now,
            UpdatedAt: now,
            GrantedBy: adminEmail,
            GrantedReason: request.Reason,
            RevokedAt: null);
        await SaveEntitlementAsync(ent, cancellationToken);
        await TrackEventAsync("admin_entitlement_granted", userId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["accessType"] = request.AccessType
        }, cancellationToken);
    }

    public async Task RevokeEntitlementAdminAsync(string userId, string entitlementId, string reason, string adminEmail, CancellationToken cancellationToken)
    {
        var ents = await ListEntitlementsByUserAsync(userId, cancellationToken);
        var ent = ents.FirstOrDefault(e => string.Equals(e.EntitlementId, entitlementId, StringComparison.OrdinalIgnoreCase));
        if (ent is null) return;

        var now = DateTimeOffset.UtcNow;
        var revoked = ent with
        {
            Status = "revoked",
            RevokedAt = now,
            UpdatedAt = now,
            GrantedReason = string.IsNullOrWhiteSpace(ent.GrantedReason) ? reason : ent.GrantedReason,
            Notes = string.IsNullOrWhiteSpace(ent.Notes) ? reason : ent.Notes
        };
        await SaveEntitlementAsync(revoked, cancellationToken);
        await TrackEventAsync("admin_entitlement_revoked", userId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["entitlementId"] = entitlementId
        }, cancellationToken);
    }

    public async Task LinkPaymentToUserAsync(string stripeCheckoutSessionId, string userId, string adminEmail, CancellationToken cancellationToken)
    {
        var payment = await GetPaymentByCheckoutSessionIdAsync(stripeCheckoutSessionId, cancellationToken);
        if (payment is null) return;

        var user = await GetUserByIdAsync(userId, cancellationToken);
        if (user is null) return;

        var updated = payment with
        {
            UserId = userId,
            AccountEmail = user.Email,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await SavePaymentAsync(updated, cancellationToken);
        await TrackEventAsync("admin_payment_linked", userId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["checkoutSessionId"] = stripeCheckoutSessionId
        }, cancellationToken);
    }

    public async Task UpdateSupportTicketStatusAsync(string ticketId, AdminSupportTicketPatchRequest request, string adminEmail, CancellationToken cancellationToken)
    {
        var tableName = GetTableName("Storage:SupportTable", "ybai-support");
        var existing = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = tableName,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"TICKET#{ticketId}"),
                ["sk"] = StringValue("DETAILS")
            }
        }, cancellationToken);

        if (existing.Item is null || existing.Item.Count == 0) return;

        var item = new Dictionary<string, AttributeValue>(existing.Item);
        if (!string.IsNullOrWhiteSpace(request.Status))
            item["status"] = StringValue(request.Status.Trim());
        if (!string.IsNullOrWhiteSpace(request.Priority))
            item["priority"] = StringValue(request.Priority.Trim());
        item["updatedAt"] = StringValue(DateTimeOffset.UtcNow.ToString("O"));

        await PutItemAsync(tableName, item, cancellationToken);
        await TrackEventAsync("admin_support_ticket_updated", ticketId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["status"] = request.Status ?? ""
        }, cancellationToken);
    }
}

public sealed partial class InMemoryAppDataStore : IAppDataStore
{
    public Task<AdminOperationalDashboardResponse> GetOperationalDashboardAsync(string range, CancellationToken cancellationToken)
    {
        return Task.FromResult(new AdminOperationalDashboardResponse(
            range,
            new AdminOperationalKpis(0, 0, 0, 0, 0, 0, 0, 0, 0),
            Array.Empty<ActivityFeedItem>(),
            Array.Empty<AdminOrderRowDto>(),
            Array.Empty<AdminSupportTicketDto>(),
            Array.Empty<AdminUserDto>(),
            Array.Empty<AdminDemoAuditDto>(),
            Array.Empty<AdminAttentionItemDto>()));
    }

    public Task<AdminListResponse<AdminOrderRowDto>> ListPaymentOrdersAsync(int limit, string? cursor, CancellationToken cancellationToken) =>
        Task.FromResult(new AdminListResponse<AdminOrderRowDto>(Array.Empty<AdminOrderRowDto>(), null));

    public Task<AdminListResponse<AdminActivityEventDto>> ListActivityEventsAsync(int limit, string? cursor, CancellationToken cancellationToken) =>
        Task.FromResult(new AdminListResponse<AdminActivityEventDto>(Array.Empty<AdminActivityEventDto>(), null));

    public Task<IReadOnlyList<ActivityFeedItem>> ListActivityForScopeAsync(string scope, int limit, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<ActivityFeedItem>>(Array.Empty<ActivityFeedItem>());

    public Task UpdateUserAdminAsync(string userId, AdminUserPatchRequest request, string adminEmail, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task GrantEntitlementAdminAsync(string userId, AdminGrantEntitlementRequest request, string adminEmail, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task RevokeEntitlementAdminAsync(string userId, string entitlementId, string reason, string adminEmail, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task LinkPaymentToUserAsync(string stripeCheckoutSessionId, string userId, string adminEmail, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task UpdateSupportTicketStatusAsync(string ticketId, AdminSupportTicketPatchRequest request, string adminEmail, CancellationToken cancellationToken)
    {
        if (_supportMeta.TryGetValue(ticketId, out var meta))
        {
            var status = string.IsNullOrWhiteSpace(request.Status) ? meta.Status : request.Status.Trim();
            var priority = string.IsNullOrWhiteSpace(request.Priority) ? meta.Priority : request.Priority.Trim();
            _supportMeta[ticketId] = meta with
            {
                Status = status,
                Priority = priority,
                UpdatedAt = DateTimeOffset.UtcNow,
                AssignedAdmin = adminEmail
            };
        }
        _activity.Insert(0, new ActivityFeedItem("admin_support_ticket_updated", ticketId, DateTimeOffset.UtcNow));
        return Task.CompletedTask;
    }
}
