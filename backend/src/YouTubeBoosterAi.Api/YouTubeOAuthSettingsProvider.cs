using System.Text.Json;

namespace YouTubeBoosterAi.Api;

public interface IAdminYouTubeOAuthSettingsProvider
{
    Task<string?> GetCredentialsJsonAsync(CancellationToken cancellationToken);
}

public sealed class AdminYouTubeOAuthSettingsProvider : IAdminYouTubeOAuthSettingsProvider
{
    private readonly ISecretValueProvider _secretValueProvider;

    public AdminYouTubeOAuthSettingsProvider(ISecretValueProvider secretValueProvider)
    {
        _secretValueProvider = secretValueProvider;
    }

    public async Task<string?> GetCredentialsJsonAsync(CancellationToken cancellationToken)
    {
        var rawJson = await _secretValueProvider.GetValueAsync("admin/google/credentials-json", secure: true, cancellationToken);
        if (!string.IsNullOrWhiteSpace(rawJson))
        {
            return rawJson;
        }

        var clientId = await _secretValueProvider.GetValueAsync("admin/google/client-id", secure: true, cancellationToken);
        var clientSecret = await _secretValueProvider.GetValueAsync("admin/google/client-secret", secure: true, cancellationToken);
        var projectId = await _secretValueProvider.GetValueAsync("admin/google/project-id", secure: false, cancellationToken);
        var authUri = await _secretValueProvider.GetValueAsync("admin/google/auth-uri", secure: false, cancellationToken)
            ?? "https://accounts.google.com/o/oauth2/auth";
        var tokenUri = await _secretValueProvider.GetValueAsync("admin/google/token-uri", secure: false, cancellationToken)
            ?? "https://oauth2.googleapis.com/token";
        var redirectUri = await _secretValueProvider.GetValueAsync("admin/google/redirect-uri", secure: false, cancellationToken)
            ?? "https://youtubeboosterai.com/oauth2/callback";

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
        {
            return null;
        }

        var payload = new
        {
            installed = new
            {
                client_id = clientId,
                project_id = projectId ?? "replace-me",
                auth_uri = authUri,
                token_uri = tokenUri,
                auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs",
                client_secret = clientSecret,
                redirect_uris = new[] { redirectUri }
            }
        };

        return JsonSerializer.Serialize(payload);
    }
}
