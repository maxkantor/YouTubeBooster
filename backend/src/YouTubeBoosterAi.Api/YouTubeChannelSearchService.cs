using System.Text.Json;

namespace YouTubeBoosterAi.Api;

public sealed record AcqYoutubeSearchHit(
    string ChannelId,
    string Title,
    string? Handle,
    string? Description,
    string? Country,
    long SubscriberCount,
    long VideoCount,
    DateTimeOffset? PublishedAt
);

public sealed record AcqYoutubeSearchPage(
    IReadOnlyList<AcqYoutubeSearchHit> Hits,
    string? NextPageToken
);

public interface IYouTubeChannelSearch
{
    Task<AcqYoutubeSearchPage> SearchAsync(
        string query,
        string? relevanceLanguage,
        string? regionCode,
        int maxResults,
        string? pageToken,
        CancellationToken cancellationToken);
}

public sealed class YouTubeChannelSearchService : IYouTubeChannelSearch
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ISecretValueProvider _secrets;

    public YouTubeChannelSearchService(IHttpClientFactory httpClientFactory, ISecretValueProvider secrets)
    {
        _httpClientFactory = httpClientFactory;
        _secrets = secrets;
    }

    public async Task<AcqYoutubeSearchPage> SearchAsync(
        string query,
        string? relevanceLanguage,
        string? regionCode,
        int maxResults,
        string? pageToken,
        CancellationToken cancellationToken)
    {
        var apiKey = await _secrets.GetValueAsync("admin/youtube-api-key", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(apiKey) || apiKey.Trim().Length < 20
            || apiKey.Contains("replace", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("youtube_api_key_missing");

        var client = _httpClientFactory.CreateClient();
        var take = Math.Clamp(maxResults, 1, 25);
        var url =
            "https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel"
            + $"&maxResults={take}&q={Uri.EscapeDataString(query)}"
            + $"&key={Uri.EscapeDataString(apiKey.Trim())}";
        if (!string.IsNullOrWhiteSpace(relevanceLanguage))
            url += "&relevanceLanguage=" + Uri.EscapeDataString(relevanceLanguage);
        if (!string.IsNullOrWhiteSpace(regionCode))
            url += "&regionCode=" + Uri.EscapeDataString(regionCode);
        if (!string.IsNullOrWhiteSpace(pageToken))
            url += "&pageToken=" + Uri.EscapeDataString(pageToken);

        using var searchResponse = await client.GetAsync(url, cancellationToken);
        var searchBody = await searchResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!searchResponse.IsSuccessStatusCode)
            throw new InvalidOperationException($"youtube_search_failed:{searchResponse.StatusCode}");

        using var searchDoc = JsonDocument.Parse(searchBody);
        var root = searchDoc.RootElement;
        var next = root.TryGetProperty("nextPageToken", out var npt) ? npt.GetString() : null;
        var ids = new List<string>();
        var snippets = new Dictionary<string, (string Title, string? Description)>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("items", out var items))
        {
            foreach (var item in items.EnumerateArray())
            {
                if (!item.TryGetProperty("snippet", out var sn)) continue;
                var id = sn.TryGetProperty("channelId", out var cid) ? cid.GetString() : null;
                if (string.IsNullOrWhiteSpace(id))
                {
                    if (item.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Object
                        && idEl.TryGetProperty("channelId", out var cid2))
                        id = cid2.GetString();
                }
                if (string.IsNullOrWhiteSpace(id)) continue;
                ids.Add(id);
                snippets[id] = (
                    sn.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "",
                    sn.TryGetProperty("description", out var d) ? d.GetString() : null);
            }
        }

        if (ids.Count == 0)
            return new AcqYoutubeSearchPage([], next);

        var channelsUrl =
            "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics"
            + $"&id={Uri.EscapeDataString(string.Join(",", ids.Distinct()))}"
            + $"&key={Uri.EscapeDataString(apiKey.Trim())}";
        using var chResponse = await client.GetAsync(channelsUrl, cancellationToken);
        chResponse.EnsureSuccessStatusCode();
        using var chDoc = JsonDocument.Parse(await chResponse.Content.ReadAsStringAsync(cancellationToken));
        var hits = new List<AcqYoutubeSearchHit>();
        if (chDoc.RootElement.TryGetProperty("items", out var chItems))
        {
            foreach (var item in chItems.EnumerateArray())
            {
                var id = item.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
                if (string.IsNullOrWhiteSpace(id)) continue;
                var sn = item.TryGetProperty("snippet", out var sne) ? sne : default;
                var st = item.TryGetProperty("statistics", out var ste) ? ste : default;
                var title = sn.ValueKind == JsonValueKind.Object && sn.TryGetProperty("title", out var te)
                    ? te.GetString() ?? snippets.GetValueOrDefault(id).Title
                    : snippets.GetValueOrDefault(id).Title;
                var desc = sn.ValueKind == JsonValueKind.Object && sn.TryGetProperty("description", out var de)
                    ? de.GetString()
                    : snippets.GetValueOrDefault(id).Description;
                var handle = sn.ValueKind == JsonValueKind.Object && sn.TryGetProperty("customUrl", out var cu)
                    ? cu.GetString()
                    : null;
                var country = sn.ValueKind == JsonValueKind.Object && sn.TryGetProperty("country", out var co)
                    ? co.GetString()
                    : null;
                DateTimeOffset? published = null;
                if (sn.ValueKind == JsonValueKind.Object && sn.TryGetProperty("publishedAt", out var pa)
                    && DateTimeOffset.TryParse(pa.GetString(), out var pdt))
                    published = pdt;
                long subs = 0, videos = 0;
                if (st.ValueKind == JsonValueKind.Object)
                {
                    if (st.TryGetProperty("subscriberCount", out var sc))
                        long.TryParse(sc.GetString(), out subs);
                    if (st.TryGetProperty("videoCount", out var vc))
                        long.TryParse(vc.GetString(), out videos);
                }
                hits.Add(new AcqYoutubeSearchHit(id, title ?? id, handle, desc, country, subs, videos, published));
            }
        }

        return new AcqYoutubeSearchPage(hits, next);
    }
}
