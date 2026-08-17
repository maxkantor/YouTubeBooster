using System.Collections.Concurrent;
using System.Text.Json;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

namespace YouTubeBoosterAi.Api;

public interface ICreatorAcquisitionStore
{
    Task UpsertProspectAsync(AcqProspectRecord prospect, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> GetProspectAsync(string prospectId, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> GetByTokenAsync(string token, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> GetByEmailAsync(string email, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> FindDuplicateAsync(string? channelId, string? channelUrl, string? handle, string? email, CancellationToken cancellationToken);
    Task<IReadOnlyList<AcqProspectRecord>> ListProspectsAsync(CancellationToken cancellationToken);
    Task SaveApprovalAsync(AcqApprovalRecord approval, CancellationToken cancellationToken);
    Task<AcqApprovalRecord?> GetApprovalAsync(string approvalId, CancellationToken cancellationToken);
    Task<bool> TryClaimIdempotencyAsync(string key, CancellationToken cancellationToken);
    Task SaveCampaignFlagsAsync(string campaign, bool marketingSendingEnabled, bool complaintPause, CancellationToken cancellationToken);
    Task<(bool SendingEnabled, bool ComplaintPause)> GetCampaignFlagsAsync(string campaign, CancellationToken cancellationToken);
}

public sealed class InMemoryCreatorAcquisitionStore : ICreatorAcquisitionStore
{
    private readonly ConcurrentDictionary<string, AcqProspectRecord> _byId = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, AcqApprovalRecord> _approvals = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _idempotency = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, (bool Sending, bool Pause)> _flags = new(StringComparer.OrdinalIgnoreCase);

    public Task UpsertProspectAsync(AcqProspectRecord prospect, CancellationToken cancellationToken)
    {
        _byId[prospect.ProspectId] = prospect;
        return Task.CompletedTask;
    }

    public Task<AcqProspectRecord?> GetProspectAsync(string prospectId, CancellationToken cancellationToken)
    {
        _byId.TryGetValue(prospectId, out var row);
        return Task.FromResult(row);
    }

    public Task<AcqProspectRecord?> GetByTokenAsync(string token, CancellationToken cancellationToken) =>
        Task.FromResult(_byId.Values.FirstOrDefault(p => string.Equals(p.OpaqueToken, token, StringComparison.OrdinalIgnoreCase)));

    public Task<AcqProspectRecord?> GetByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var key = email.Trim().ToLowerInvariant();
        return Task.FromResult(_byId.Values.FirstOrDefault(p =>
            string.Equals(p.PublicBusinessEmail?.Trim(), key, StringComparison.OrdinalIgnoreCase)));
    }

    public Task<AcqProspectRecord?> FindDuplicateAsync(string? channelId, string? channelUrl, string? handle, string? email, CancellationToken cancellationToken)
    {
        foreach (var p in _byId.Values)
        {
            if (!string.IsNullOrWhiteSpace(channelId) && string.Equals(p.ChannelId, channelId, StringComparison.OrdinalIgnoreCase))
                return Task.FromResult<AcqProspectRecord?>(p);
            if (!string.IsNullOrWhiteSpace(handle) && string.Equals(NormalizeHandle(p.Handle), NormalizeHandle(handle), StringComparison.OrdinalIgnoreCase))
                return Task.FromResult<AcqProspectRecord?>(p);
            if (!string.IsNullOrWhiteSpace(channelUrl) && CanonicalUrl(p.ChannelUrl) == CanonicalUrl(channelUrl))
                return Task.FromResult<AcqProspectRecord?>(p);
            if (EmailAddressHelpers.LooksLikeEmail(email) &&
                string.Equals(p.PublicBusinessEmail?.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase))
                return Task.FromResult<AcqProspectRecord?>(p);
        }
        return Task.FromResult<AcqProspectRecord?>(null);
    }

    public Task<IReadOnlyList<AcqProspectRecord>> ListProspectsAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<AcqProspectRecord>>(_byId.Values.OrderByDescending(p => p.PriorityScore).ToArray());

    public Task SaveApprovalAsync(AcqApprovalRecord approval, CancellationToken cancellationToken)
    {
        _approvals[approval.ApprovalId] = approval;
        return Task.CompletedTask;
    }

    public Task<AcqApprovalRecord?> GetApprovalAsync(string approvalId, CancellationToken cancellationToken)
    {
        _approvals.TryGetValue(approvalId, out var row);
        return Task.FromResult(row);
    }

    public Task<bool> TryClaimIdempotencyAsync(string key, CancellationToken cancellationToken) =>
        Task.FromResult(_idempotency.TryAdd(key, 1));

    public Task SaveCampaignFlagsAsync(string campaign, bool marketingSendingEnabled, bool complaintPause, CancellationToken cancellationToken)
    {
        _flags[campaign] = (marketingSendingEnabled, complaintPause);
        return Task.CompletedTask;
    }

    public Task<(bool SendingEnabled, bool ComplaintPause)> GetCampaignFlagsAsync(string campaign, CancellationToken cancellationToken)
    {
        if (_flags.TryGetValue(campaign, out var v)) return Task.FromResult(v);
        return Task.FromResult((false, false));
    }

    public static string NormalizeHandle(string? handle) =>
        (handle ?? "").Trim().TrimStart('@').ToLowerInvariant();

    public static string CanonicalUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "";
        var t = url.Trim().TrimEnd('/').ToLowerInvariant();
        t = t.Replace("https://www.youtube.com", "https://youtube.com", StringComparison.Ordinal);
        return t;
    }
}

public sealed class DynamoCreatorAcquisitionStore : ICreatorAcquisitionStore
{
    private readonly IAmazonDynamoDB _db;
    private readonly IConfiguration _configuration;

    public DynamoCreatorAcquisitionStore(IAmazonDynamoDB db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    private string Table => _configuration["Storage:SupportTable"] ?? "ybai-support";

    public async Task UpsertProspectAsync(AcqProspectRecord prospect, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(prospect, AcqJson.Options);
        await _db.PutItemAsync(new PutItemRequest
        {
            TableName = Table,
            Item = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQPROSPECT#{prospect.ProspectId}"),
                ["sk"] = S("META"),
                ["payload"] = S(json),
                ["token"] = S(prospect.OpaqueToken),
                ["email"] = S(prospect.PublicBusinessEmail?.Trim().ToLowerInvariant() ?? ""),
                ["handle"] = S(InMemoryCreatorAcquisitionStore.NormalizeHandle(prospect.Handle)),
                ["channelId"] = S(prospect.ChannelId ?? "")
            }
        }, cancellationToken);
        if (!string.IsNullOrWhiteSpace(prospect.OpaqueToken))
        {
            await _db.PutItemAsync(new PutItemRequest
            {
                TableName = Table,
                Item = new Dictionary<string, AttributeValue>
                {
                    ["pk"] = S($"ACQTOKEN#{prospect.OpaqueToken}"),
                    ["sk"] = S("META"),
                    ["prospectId"] = S(prospect.ProspectId)
                }
            }, cancellationToken);
        }
    }

    public async Task<AcqProspectRecord?> GetProspectAsync(string prospectId, CancellationToken cancellationToken)
    {
        var res = await _db.GetItemAsync(new GetItemRequest
        {
            TableName = Table,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQPROSPECT#{prospectId}"),
                ["sk"] = S("META")
            }
        }, cancellationToken);
        return ReadProspect(res.Item);
    }

    public async Task<AcqProspectRecord?> GetByTokenAsync(string token, CancellationToken cancellationToken)
    {
        var map = await _db.GetItemAsync(new GetItemRequest
        {
            TableName = Table,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQTOKEN#{token}"),
                ["sk"] = S("META")
            }
        }, cancellationToken);
        var id = map.Item?.GetValueOrDefault("prospectId")?.S;
        if (string.IsNullOrWhiteSpace(id)) return null;
        return await GetProspectAsync(id, cancellationToken);
    }

    public async Task<AcqProspectRecord?> GetByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var key = email.Trim().ToLowerInvariant();
        var all = await ListProspectsAsync(cancellationToken);
        return all.FirstOrDefault(p => string.Equals(p.PublicBusinessEmail?.Trim(), key, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<AcqProspectRecord?> FindDuplicateAsync(string? channelId, string? channelUrl, string? handle, string? email, CancellationToken cancellationToken)
    {
        var all = await ListProspectsAsync(cancellationToken);
        foreach (var p in all)
        {
            if (!string.IsNullOrWhiteSpace(channelId) && string.Equals(p.ChannelId, channelId, StringComparison.OrdinalIgnoreCase))
                return p;
            if (!string.IsNullOrWhiteSpace(handle) &&
                string.Equals(InMemoryCreatorAcquisitionStore.NormalizeHandle(p.Handle), InMemoryCreatorAcquisitionStore.NormalizeHandle(handle), StringComparison.OrdinalIgnoreCase))
                return p;
            if (!string.IsNullOrWhiteSpace(channelUrl) &&
                InMemoryCreatorAcquisitionStore.CanonicalUrl(p.ChannelUrl) == InMemoryCreatorAcquisitionStore.CanonicalUrl(channelUrl))
                return p;
            if (EmailAddressHelpers.LooksLikeEmail(email) &&
                string.Equals(p.PublicBusinessEmail?.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase))
                return p;
        }
        return null;
    }

    public async Task<IReadOnlyList<AcqProspectRecord>> ListProspectsAsync(CancellationToken cancellationToken)
    {
        var res = await _db.ScanAsync(new ScanRequest
        {
            TableName = Table,
            FilterExpression = "begins_with(pk, :p) AND sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":p"] = S("ACQPROSPECT#"),
                [":sk"] = S("META")
            }
        }, cancellationToken);
        return res.Items.Select(ReadProspect).OfType<AcqProspectRecord>().OrderByDescending(p => p.PriorityScore).ToArray();
    }

    public async Task SaveApprovalAsync(AcqApprovalRecord approval, CancellationToken cancellationToken)
    {
        await _db.PutItemAsync(new PutItemRequest
        {
            TableName = Table,
            Item = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQAPPROVAL#{approval.ApprovalId}"),
                ["sk"] = S("META"),
                ["payload"] = S(JsonSerializer.Serialize(approval, AcqJson.Options))
            }
        }, cancellationToken);
    }

    public async Task<AcqApprovalRecord?> GetApprovalAsync(string approvalId, CancellationToken cancellationToken)
    {
        var res = await _db.GetItemAsync(new GetItemRequest
        {
            TableName = Table,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQAPPROVAL#{approvalId}"),
                ["sk"] = S("META")
            }
        }, cancellationToken);
        var json = res.Item?.GetValueOrDefault("payload")?.S;
        if (string.IsNullOrWhiteSpace(json)) return null;
        return JsonSerializer.Deserialize<AcqApprovalRecord>(json, AcqJson.Options);
    }

    public async Task<bool> TryClaimIdempotencyAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            await _db.PutItemAsync(new PutItemRequest
            {
                TableName = Table,
                Item = new Dictionary<string, AttributeValue>
                {
                    ["pk"] = S($"ACQIDEMPOTENCY#{key}"),
                    ["sk"] = S("META"),
                    ["createdAt"] = S(DateTimeOffset.UtcNow.ToString("O"))
                },
                ConditionExpression = "attribute_not_exists(pk)"
            }, cancellationToken);
            return true;
        }
        catch (ConditionalCheckFailedException)
        {
            return false;
        }
    }

    public async Task SaveCampaignFlagsAsync(string campaign, bool marketingSendingEnabled, bool complaintPause, CancellationToken cancellationToken)
    {
        await _db.PutItemAsync(new PutItemRequest
        {
            TableName = Table,
            Item = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQFLAGS#{campaign}"),
                ["sk"] = S("META"),
                ["sending"] = S(marketingSendingEnabled ? "true" : "false"),
                ["pause"] = S(complaintPause ? "true" : "false")
            }
        }, cancellationToken);
    }

    public async Task<(bool SendingEnabled, bool ComplaintPause)> GetCampaignFlagsAsync(string campaign, CancellationToken cancellationToken)
    {
        var res = await _db.GetItemAsync(new GetItemRequest
        {
            TableName = Table,
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = S($"ACQFLAGS#{campaign}"),
                ["sk"] = S("META")
            }
        }, cancellationToken);
        var sending = string.Equals(res.Item?.GetValueOrDefault("sending")?.S, "true", StringComparison.OrdinalIgnoreCase);
        var pause = string.Equals(res.Item?.GetValueOrDefault("pause")?.S, "true", StringComparison.OrdinalIgnoreCase);
        return (sending, pause);
    }

    private static AcqProspectRecord? ReadProspect(Dictionary<string, AttributeValue>? item)
    {
        var json = item?.GetValueOrDefault("payload")?.S;
        if (string.IsNullOrWhiteSpace(json)) return null;
        return JsonSerializer.Deserialize<AcqProspectRecord>(json, AcqJson.Options);
    }

    private static AttributeValue S(string v) => new() { S = v ?? "" };
}
