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
    /// Read one parameter from SSM only (no env, no appsettings). Used so the YouTube key can be resolved
    /// from <c>admin/google/credentials-json</c> in production without being overridden by local config.
    /// </summary>
    private async Task<string?> ReadSsmParameterDirectAsync(string relativeKey, bool secure, CancellationToken cancellationToken)
    {
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

            return response.Parameter?.Value;
        }
        catch (ParameterNotFoundException)
        {
            return null;
        }
    }

    /// <summary>
    /// YouTube Data API key: read from <c>admin/youtube-api-key</c> (SSM) or
    /// <c>admin/google/credentials-json</c> (SSM) — root or <c>installed</c>/<c>web</c>
    /// fields <c>youtube_api_key</c> / <c>api_key</c>. Production uses SSM only (no <c>YOUTUBE_API_KEY</c> env).
    /// </summary>
    private async Task<string?> GetYouTubeApiKeyFromCredentialsJsonAsync(bool secure, CancellationToken cancellationToken)
    {
        var directKey = await ReadSsmParameterDirectAsync("admin/youtube-api-key", secure, cancellationToken);
        if (!string.IsNullOrWhiteSpace(directKey))
        {
            return directKey;
        }

        // Prefer direct SSM read so we don't pick up mis-ordered appsettings in Lambda.
        var credentialsJson = await ReadSsmParameterDirectAsync("admin/google/credentials-json", secure, cancellationToken);
        if (string.IsNullOrWhiteSpace(credentialsJson))
        {
            // Local dev: appsettings / user secrets
            credentialsJson = await GetValueAsync("admin/google/credentials-json", secure, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(credentialsJson))
        {
            return null;
        }

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
    /// OAuth credentials.json is usually <c>{"installed":{...}}</c> or <c>{"web":{...}}</c>.
    /// We support <c>youtube_api_key</c> at the root, under <c>installed</c>, or under <c>web</c>.
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

        // Resolve YouTube Data API key from admin/youtube-api-key or credentials-json first; optional legacy SSM param youtube/api-key after config.
        if (string.Equals(relativeKey, "youtube/api-key", StringComparison.OrdinalIgnoreCase))
        {
            var fromCredentials = await GetYouTubeApiKeyFromCredentialsJsonAsync(secure, cancellationToken);
            if (!string.IsNullOrWhiteSpace(fromCredentials))
            {
                _cache[relativeKey] = fromCredentials;
                return fromCredentials;
            }
        }

        var configKey = relativeKey.Replace('/', ':');
        var envValue = _configuration[configKey];
        if (!string.IsNullOrWhiteSpace(envValue))
        {
            _cache[relativeKey] = envValue;
            return envValue;
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

            var value = response.Parameter?.Value?.Trim();
            _cache[relativeKey] = value;
            return value;
        }
        catch (ParameterNotFoundException)
        {
            _cache[relativeKey] = null;
            return null;
        }
    }
}
