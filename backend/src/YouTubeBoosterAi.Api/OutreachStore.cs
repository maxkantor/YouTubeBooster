using Amazon.DynamoDBv2.Model;

namespace YouTubeBoosterAi.Api;

public sealed partial class DynamoDbAppDataStore
{
    public async Task UpsertOutreachContactAsync(OutreachContactRecord contact, CancellationToken cancellationToken)
    {
        var email = contact.Email.Trim().ToLowerInvariant();
        var existing = await GetOutreachContactAsync(email, cancellationToken);
        if (existing is not null &&
            string.Equals(existing.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var status = existing?.Status ?? contact.Status ?? "pending";
        if (string.Equals(existing?.Status, "sent", StringComparison.OrdinalIgnoreCase))
            status = "sent";

        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"OUTREACH#{email}"),
            ["sk"] = StringValue("CONTACT"),
            ["email"] = StringValue(email),
            ["name"] = StringValue(contact.Name ?? existing?.Name ?? ""),
            ["prospectId"] = StringValue(contact.ProspectId ?? existing?.ProspectId ?? ""),
            ["channelUrl"] = StringValue(contact.ChannelUrl ?? existing?.ChannelUrl ?? ""),
            ["handle"] = StringValue(contact.Handle ?? existing?.Handle ?? ""),
            ["status"] = StringValue(status),
            ["updatedAt"] = StringValue(now.ToString("O"))
        };
        if (existing?.LastSentAt is not null)
            item["lastSentAt"] = StringValue(existing.LastSentAt.Value.ToString("O"));
        if (existing?.UnsubscribedAt is not null)
            item["unsubscribedAt"] = StringValue(existing.UnsubscribedAt.Value.ToString("O"));

        await PutItemAsync(GetTableName("Storage:SupportTable", "ybai-support"), item, cancellationToken);
    }

    public async Task<OutreachContactRecord?> GetOutreachContactAsync(string email, CancellationToken cancellationToken)
    {
        var key = email.Trim().ToLowerInvariant();
        var response = await _dynamoDb.GetItemAsync(new GetItemRequest
        {
            TableName = GetTableName("Storage:SupportTable", "ybai-support"),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"OUTREACH#{key}"),
                ["sk"] = StringValue("CONTACT")
            }
        }, cancellationToken);
        if (response.Item is null || response.Item.Count == 0) return null;
        return ReadOutreach(response.Item);
    }

    public async Task<IReadOnlyList<OutreachContactRecord>> ListOutreachContactsAsync(CancellationToken cancellationToken)
    {
        var response = await _dynamoDb.ScanAsync(new ScanRequest
        {
            TableName = GetTableName("Storage:SupportTable", "ybai-support"),
            FilterExpression = "begins_with(pk, :p) AND sk = :sk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":p"] = StringValue("OUTREACH#"),
                [":sk"] = StringValue("CONTACT")
            }
        }, cancellationToken);
        return response.Items.Select(ReadOutreach).ToArray();
    }

    public async Task MarkOutreachSentAsync(string email, DateTimeOffset sentAt, CancellationToken cancellationToken)
    {
        var key = email.Trim().ToLowerInvariant();
        var existing = await GetOutreachContactAsync(key, cancellationToken);
        if (existing is null || string.Equals(existing.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase))
            return;

        await _dynamoDb.UpdateItemAsync(new UpdateItemRequest
        {
            TableName = GetTableName("Storage:SupportTable", "ybai-support"),
            Key = new Dictionary<string, AttributeValue>
            {
                ["pk"] = StringValue($"OUTREACH#{key}"),
                ["sk"] = StringValue("CONTACT")
            },
            UpdateExpression = "SET #s = :s, lastSentAt = :t, updatedAt = :t",
            ExpressionAttributeNames = new Dictionary<string, string> { ["#s"] = "status" },
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":s"] = StringValue("sent"),
                [":t"] = StringValue(sentAt.ToString("O"))
            }
        }, cancellationToken);
    }

    public async Task UnsubscribeOutreachAsync(string email, DateTimeOffset when, CancellationToken cancellationToken)
    {
        var key = email.Trim().ToLowerInvariant();
        var existing = await GetOutreachContactAsync(key, cancellationToken);
        var item = new Dictionary<string, AttributeValue>
        {
            ["pk"] = StringValue($"OUTREACH#{key}"),
            ["sk"] = StringValue("CONTACT"),
            ["email"] = StringValue(key),
            ["name"] = StringValue(existing?.Name ?? ""),
            ["prospectId"] = StringValue(existing?.ProspectId ?? ""),
            ["channelUrl"] = StringValue(existing?.ChannelUrl ?? ""),
            ["handle"] = StringValue(existing?.Handle ?? ""),
            ["status"] = StringValue("unsubscribed"),
            ["unsubscribedAt"] = StringValue(when.ToString("O")),
            ["updatedAt"] = StringValue(when.ToString("O"))
        };
        if (existing?.LastSentAt is not null)
            item["lastSentAt"] = StringValue(existing.LastSentAt.Value.ToString("O"));
        await PutItemAsync(GetTableName("Storage:SupportTable", "ybai-support"), item, cancellationToken);
        await TrackEventAsync("outreach_unsubscribed", key, new Dictionary<string, string?>
        {
            ["email"] = key
        }, cancellationToken);
    }

    private static OutreachContactRecord ReadOutreach(Dictionary<string, AttributeValue> item)
    {
        DateTimeOffset? ParseOpt(string name) =>
            DateTimeOffset.TryParse(item.GetValueOrDefault(name)?.S, out var d) ? d : null;
        DateTimeOffset.TryParse(item.GetValueOrDefault("updatedAt")?.S, out var updated);
        return new OutreachContactRecord(
            item.GetValueOrDefault("email")?.S ?? "",
            EmptyToNull(item.GetValueOrDefault("name")?.S),
            EmptyToNull(item.GetValueOrDefault("prospectId")?.S),
            EmptyToNull(item.GetValueOrDefault("channelUrl")?.S),
            EmptyToNull(item.GetValueOrDefault("handle")?.S),
            item.GetValueOrDefault("status")?.S ?? "pending",
            ParseOpt("lastSentAt"),
            ParseOpt("unsubscribedAt"),
            updated == default ? DateTimeOffset.UtcNow : updated
        );
    }
}
