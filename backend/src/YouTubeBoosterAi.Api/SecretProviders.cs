using System.Text.Json;
using Amazon.SimpleSystemsManagement;
using Amazon.SimpleSystemsManagement.Model;

namespace YouTubeBoosterAi.Api;

public interface ISecretValueProvider
{
    Task<string?> GetValueAsync(string relativeKey, bool secure, CancellationToken cancellationToken);
}

public sealed class SsmSecretValueProvider : ISecretValueProvider
{
    private readonly IAmazonSimpleSystemsManagement _ssm;
    private readonly IConfiguration _configuration;
    private readonly Dictionary<string, string?> _cache = new(StringComparer.OrdinalIgnoreCase);

    public SsmSecretValueProvider(IAmazonSimpleSystemsManagement ssm, IConfiguration configuration)
    {
        _ssm = ssm;
        _configuration = configuration;
    }

    /// <summary>
    /// Tries to get YouTube API key from admin credentials JSON (SSM admin/google/credentials-json).
    /// The JSON may be standard Google OAuth credentials; if it also contains a top-level "youtube_api_key"
    /// or "api_key" property, that value is used for public YouTube Data API v3 calls.
    /// </summary>
    private async Task<string?> GetYouTubeApiKeyFromCredentialsJsonAsync(bool secure, CancellationToken cancellationToken)
    {
        var credentialsJson = await GetValueAsync("admin/google/credentials-json", secure, cancellationToken);
        if (string.IsNullOrWhiteSpace(credentialsJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(credentialsJson);
            var root = doc.RootElement;
            var key = TryExtractYouTubeDataApiKeyFromCredentialsJson(root);
            if (!string.IsNullOrWhiteSpace(key)) return key;
        }
        catch
        {
            /* ignore parse errors */
        }

        return null;
    }

    /// <summary>
    /// OAuth credentials.json is usually <c>{"installed":{...}}</c> or <c>{"web":{...}}</c> and does not include a Data API key.
    /// We optionally support <c>youtube_api_key</c> at the root, under <c>installed</c>, or under <c>web</c> so one SSM blob can carry both.
    /// </summary>
    private static string? TryExtractYouTubeDataApiKeyFromCredentialsJson(JsonElement root)
    {
        foreach (var prop in new[] { "youtube_api_key", "api_key" })
        {
            if (root.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.String)
            {
                var v = el.GetString();
                if (!string.IsNullOrWhiteSpace(v)) return v!.Trim();
            }
        }

        foreach (var section in new[] { "installed", "web" })
        {
            if (!root.TryGetProperty(section, out var nested) || nested.ValueKind != JsonValueKind.Object)
                continue;

            foreach (var prop in new[] { "youtube_api_key", "api_key" })
            {
                if (nested.TryGetProperty(prop, out var el) && el.ValueKind == JsonValueKind.String)
                {
                    var v = el.GetString();
                    if (!string.IsNullOrWhiteSpace(v)) return v!.Trim();
                }
            }
        }

        return null;
    }

    public async Task<string?> GetValueAsync(string relativeKey, bool secure, CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(relativeKey, out var cached))
        {
            return cached;
        }

        var configKey = relativeKey.Replace('/', ':');
        var envValue = _configuration[configKey];
        if (!string.IsNullOrWhiteSpace(envValue))
        {
            _cache[relativeKey] = envValue;
            return envValue;
        }

        if (string.Equals(relativeKey, "youtube/api-key", StringComparison.OrdinalIgnoreCase))
        {
            var youtubeKey = Environment.GetEnvironmentVariable("YOUTUBE_API_KEY");
            if (!string.IsNullOrWhiteSpace(youtubeKey))
            {
                _cache[relativeKey] = youtubeKey;
                return youtubeKey;
            }

            var fromCredentials = await GetYouTubeApiKeyFromCredentialsJsonAsync(secure, cancellationToken);
            if (!string.IsNullOrWhiteSpace(fromCredentials))
            {
                _cache[relativeKey] = fromCredentials;
                return fromCredentials;
            }
        }

        var basePath = _configuration["SSM:BasePath"] ?? _configuration["SSM__BASEPATH"];
        if (string.IsNullOrWhiteSpace(basePath))
        {
            return null;
        }

        try
        {
            var response = await _ssm.GetParameterAsync(new GetParameterRequest
            {
                Name = $"{basePath.TrimEnd('/')}/{relativeKey}",
                WithDecryption = secure
            }, cancellationToken);

            _cache[relativeKey] = response.Parameter?.Value;
            return response.Parameter?.Value;
        }
        catch (ParameterNotFoundException)
        {
            _cache[relativeKey] = null;
            return null;
        }
    }
}
