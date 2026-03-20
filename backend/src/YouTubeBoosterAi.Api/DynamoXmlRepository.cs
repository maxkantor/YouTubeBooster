using System.Xml.Linq;
using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.Extensions.Configuration;

namespace YouTubeBoosterAi.Api;

/// <summary>
/// Persist ASP.NET Data Protection key ring XML elements to DynamoDB so cookies
/// remain decryptable across Lambda cold starts / container recycling.
/// </summary>
internal sealed class DynamoXmlRepository : IXmlRepository
{
    private readonly IAmazonDynamoDB _dynamoDb;
    private readonly string _tableName;
    private readonly string _partitionKey;

    // Use a dedicated partition to avoid colliding with application user/profile items.
    public DynamoXmlRepository(IAmazonDynamoDB dynamoDb, IConfiguration configuration, string applicationName)
    {
        _dynamoDb = dynamoDb;
        _tableName = configuration["Storage:UsersTable"] ?? configuration["Storage__UsersTable"] ?? "ybai-users";
        _partitionKey = $"DPKEY#{applicationName}";
    }

    public IReadOnlyCollection<XElement> GetAllElements()
    {
        var response = _dynamoDb.QueryAsync(new QueryRequest
        {
            TableName = _tableName,
            KeyConditionExpression = "pk = :pk",
            ExpressionAttributeValues = new Dictionary<string, AttributeValue>
            {
                [":pk"] = new AttributeValue { S = _partitionKey }
            },
            ConsistentRead = true
        }).GetAwaiter().GetResult();

        var elements = response.Items
            .Select(item => item.TryGetValue("xml", out var xmlAttr) ? xmlAttr.S : null)
            .Where(xml => !string.IsNullOrWhiteSpace(xml))
            .Select(xml => XElement.Parse(xml!))
            .ToList();

        return elements;
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        // friendlyName is expected to be unique per key; if not provided, make it unique.
        var safeFriendlyName = string.IsNullOrWhiteSpace(friendlyName) ? $"key-{Guid.NewGuid():N}" : friendlyName;

        // Keep sort keys unique and grouped under the DPKEY partition.
        var sortKey = $"DPKEYE#{safeFriendlyName}";
        var xml = element.ToString(SaveOptions.DisableFormatting);

        _dynamoDb.PutItemAsync(new PutItemRequest
        {
            TableName = _tableName,
            Item = new Dictionary<string, AttributeValue>
            {
                ["pk"] = new AttributeValue { S = _partitionKey },
                ["sk"] = new AttributeValue { S = sortKey },
                ["xml"] = new AttributeValue { S = xml }
            }
        }).GetAwaiter().GetResult();
    }
}

