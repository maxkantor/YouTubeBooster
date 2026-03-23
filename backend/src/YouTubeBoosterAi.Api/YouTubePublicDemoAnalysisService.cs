using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace YouTubeBoosterAi.Api;

public sealed class YouTubePublicDemoAnalysisService : IDemoAnalysisService
{
    private static readonly Regex ChannelIdRegex = new(@"UC[a-zA-Z0-9_-]{20,}", RegexOptions.Compiled);
    private static readonly Regex HandleRegex = new(@"@([A-Za-z0-9._-]+)", RegexOptions.Compiled);
    private static readonly Regex VideoIdRegex = new(@"(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly HashSet<string> StopWords =
    [
        "the", "a", "an", "and", "or", "but", "this", "that", "with", "from", "into", "your", "what",
        "when", "where", "why", "how", "about", "for", "have", "will", "they", "them", "been", "were"
    ];

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IAppDataStore _appDataStore;
    private readonly ILogger<YouTubePublicDemoAnalysisService> _logger;

    public YouTubePublicDemoAnalysisService(
        IHttpClientFactory httpClientFactory,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore,
        ILogger<YouTubePublicDemoAnalysisService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
        _logger = logger;
    }

    public async Task<DemoAnalysisResponse> RunDemoAsync(DemoAnalysisRequest request, CancellationToken cancellationToken)
    {
        var apiKey = await _secretValueProvider.GetValueAsync("admin/youtube-api-key", secure: true, cancellationToken);
        var resolvedInput = request.ChannelInput ?? string.Empty;
        var client = _httpClientFactory.CreateClient();

        try
        {
            resolvedInput = await NormalizeChannelInputAsync(client, resolvedInput, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "YouTube public demo: normalize channel input failed");
            resolvedInput = request.ChannelInput ?? string.Empty;
        }

        DemoAnalysisResponse response;

        if (!HasUsableYouTubeApiKey(apiKey))
        {
            _logger.LogWarning("YouTube public demo: no usable API key (missing, placeholder, or too short).");
            response = await BuildFallbackResponseAsync(client, resolvedInput, cancellationToken);
        }
        else
        {
            try
            {
                var channel = await ResolveChannelAsync(client, apiKey!, resolvedInput, cancellationToken);

                // IMPORTANT: do not tie channel resolution + video list into one try/catch.
                // Playlist/video calls can fail (quota, permissions) even when channels.list succeeded.
                // Previously any playlist failure discarded resolved channel stats and showed full placeholder zeros.
                IReadOnlyList<VideoSnapshot> videos = [];
                if (!string.IsNullOrWhiteSpace(channel.UploadsPlaylistId))
                {
                    try
                    {
                        videos = await LoadRecentVideosAsync(client, apiKey!, channel.UploadsPlaylistId, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "YouTube public demo: load recent videos failed; returning channel stats only.");
                    }
                }
                else
                {
                    _logger.LogWarning("YouTube public demo: missing uploads playlist id for channel {ChannelId}", channel.ChannelId);
                }

                response = BuildResponseFromChannelData(resolvedInput, channel, videos);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "YouTube public demo: resolve channel failed for input {Input}", resolvedInput);
                response = await BuildFallbackResponseAsync(client, resolvedInput, cancellationToken);
            }
        }

        await _appDataStore.SaveDemoAsync(request with { ChannelInput = resolvedInput }, response, cancellationToken);
        return response;
    }

    private static bool HasUsableYouTubeApiKey(string? apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return false;
        }

        var trimmed = apiKey.Trim();
        // common placeholders / migration values
        if (trimmed.Equals("replace-me", StringComparison.OrdinalIgnoreCase)) return false;
        if (trimmed.Contains("replace", StringComparison.OrdinalIgnoreCase)) return false;
        if (trimmed.Equals("changeme", StringComparison.OrdinalIgnoreCase)) return false;

        return trimmed.Length >= 20;
    }

    private async Task<string> NormalizeChannelInputAsync(HttpClient client, string channelInput, CancellationToken cancellationToken)
    {
        // Must match YouTubePublicDashboardService: encoded query params break @handle extraction.
        var trimmed = YouTubeChannelInputHelpers.DecodeChannelInput((channelInput ?? string.Empty).Trim());
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return channelInput ?? string.Empty;
        }

        if (ExtractChannelId(trimmed) is not null || ExtractHandle(trimmed) is not null)
        {
            return trimmed;
        }

        var videoId = ExtractVideoId(trimmed);
        if (string.IsNullOrWhiteSpace(videoId))
        {
            return trimmed;
        }

        var oEmbedUrl = $"https://www.youtube.com/oembed?format=json&url={Uri.EscapeDataString($"https://www.youtube.com/watch?v={videoId}")}";
        using var response = await client.GetAsync(oEmbedUrl, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return trimmed;
        }

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var authorUrl = doc.RootElement.TryGetProperty("author_url", out var authorUrlElement)
            ? authorUrlElement.GetString()
            : null;
        var authorName = doc.RootElement.TryGetProperty("author_name", out var authorNameElement)
            ? authorNameElement.GetString()
            : null;

        return !string.IsNullOrWhiteSpace(authorUrl)
            ? authorUrl
            : !string.IsNullOrWhiteSpace(authorName)
                ? $"@{SanitizeHandle(authorName)}"
                : trimmed;
    }

    private async Task<ResolvedChannel> ResolveChannelAsync(HttpClient client, string apiKey, string channelInput, CancellationToken cancellationToken)
    {
        var trimmed = channelInput.Trim();
        var channelId = ExtractChannelId(trimmed);
        if (!string.IsNullOrWhiteSpace(channelId))
        {
            return await GetChannelByIdAsync(client, apiKey, channelId, trimmed, cancellationToken);
        }

        var handle = ExtractHandle(trimmed);
        if (!string.IsNullOrWhiteSpace(handle))
        {
            // Same as dashboard: forHandle is far more reliable than Search for @handles.
            try
            {
                return await GetChannelByHandleAsync(client, apiKey, handle, cancellationToken);
            }
            catch
            {
                return await SearchChannelAsync(client, apiKey, $"@{handle}", cancellationToken);
            }
        }

        return await SearchChannelAsync(client, apiKey, trimmed, cancellationToken);
    }

    private async Task<ResolvedChannel> GetChannelByHandleAsync(HttpClient client, string apiKey, string handle, CancellationToken cancellationToken)
    {
        var cleanHandle = handle.Trim().TrimStart('@');
        if (string.IsNullOrWhiteSpace(cleanHandle))
        {
            throw new InvalidOperationException("Channel handle is empty.");
        }

        var url =
            $"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle={Uri.EscapeDataString(cleanHandle)}&key={Uri.EscapeDataString(apiKey)}";
        using var response = await client.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var item = doc.RootElement.GetProperty("items").EnumerateArray().FirstOrDefault();
        if (item.ValueKind == JsonValueKind.Undefined)
        {
            throw new InvalidOperationException($"Could not resolve a public YouTube channel for handle '{handle}'.");
        }

        return ParseChannel(item);
    }

    private async Task<ResolvedChannel> GetChannelByIdAsync(HttpClient client, string apiKey, string channelId, string originalInput, CancellationToken cancellationToken)
    {
        var url = $"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id={Uri.EscapeDataString(channelId)}&key={Uri.EscapeDataString(apiKey)}";
        using var response = await client.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
        var item = doc.RootElement.GetProperty("items").EnumerateArray().FirstOrDefault();
        if (item.ValueKind == JsonValueKind.Undefined)
        {
            throw new InvalidOperationException($"Could not resolve a public YouTube channel for '{originalInput}'.");
        }

        return ParseChannel(item);
    }

    private async Task<ResolvedChannel> SearchChannelAsync(HttpClient client, string apiKey, string query, CancellationToken cancellationToken)
    {
        var searchUrl = $"https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=5&q={Uri.EscapeDataString(query)}&key={Uri.EscapeDataString(apiKey)}";
        using var searchResponse = await client.GetAsync(searchUrl, cancellationToken);
        searchResponse.EnsureSuccessStatusCode();
        using var searchDoc = JsonDocument.Parse(await searchResponse.Content.ReadAsStringAsync(cancellationToken));

        var first = searchDoc.RootElement.GetProperty("items").EnumerateArray().FirstOrDefault();
        if (first.ValueKind == JsonValueKind.Undefined)
        {
            throw new InvalidOperationException($"Could not find a public YouTube channel for '{query}'.");
        }

        var channelId = first.GetProperty("snippet").GetProperty("channelId").GetString();
        if (string.IsNullOrWhiteSpace(channelId))
        {
            throw new InvalidOperationException($"Could not find a public YouTube channel for '{query}'.");
        }

        return await GetChannelByIdAsync(client, apiKey, channelId, query, cancellationToken);
    }

    private async Task<IReadOnlyList<VideoSnapshot>> LoadRecentVideosAsync(HttpClient client, string apiKey, string uploadsPlaylistId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(uploadsPlaylistId))
        {
            return [];
        }

        var playlistUrl = $"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId={Uri.EscapeDataString(uploadsPlaylistId)}&maxResults=20&key={Uri.EscapeDataString(apiKey)}";
        using var playlistResponse = await client.GetAsync(playlistUrl, cancellationToken);
        playlistResponse.EnsureSuccessStatusCode();
        using var playlistDoc = JsonDocument.Parse(await playlistResponse.Content.ReadAsStringAsync(cancellationToken));

        var videoIds = playlistDoc.RootElement
            .GetProperty("items")
            .EnumerateArray()
            .Select(item => item.GetProperty("contentDetails").GetProperty("videoId").GetString())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Cast<string>()
            .ToArray();

        if (videoIds.Length == 0)
        {
            return [];
        }

        var videosUrl = $"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id={Uri.EscapeDataString(string.Join(",", videoIds))}&key={Uri.EscapeDataString(apiKey)}";
        using var videosResponse = await client.GetAsync(videosUrl, cancellationToken);
        videosResponse.EnsureSuccessStatusCode();
        using var videosDoc = JsonDocument.Parse(await videosResponse.Content.ReadAsStringAsync(cancellationToken));

        return videosDoc.RootElement
            .GetProperty("items")
            .EnumerateArray()
            .Select(ParseVideo)
            .OrderByDescending(video => video.PublishedAt)
            .ToArray();
    }

    private DemoAnalysisResponse BuildResponseFromChannelData(string channelInput, ResolvedChannel channel, IReadOnlyList<VideoSnapshot> videos)
    {
        if (videos.Count == 0)
        {
            return new DemoAnalysisResponse(
                DemoId: $"demo_{Guid.NewGuid():N}",
                ChannelInput: channelInput,
                ChannelTitle: channel.Title,
                ChannelHandle: channel.Handle,
                HealthScore: 65,
                Findings: ["Channel stats loaded. Add more public videos to get a full growth analysis."],
                PreviewRecommendations: ["Publish and make videos public to unlock engagement and title insights."],
                GatedInsights: ["Full AI growth plan", "Premium title rewrites", "Video-by-video SEO", "Traffic leak analysis", "Saved dashboard and report"],
                PaywallMessage: "Unlock the full growth report for premium insights.",
                SubscriberCount: channel.SubscriberCount,
                TotalViews: channel.ViewCount,
                VideoCount: (int)channel.VideoCount,
                AvgEngagement: 0,
                TopVideos: []
            );
        }

        var healthScore = CalculateHealthScore(channel, videos);
        var avgEngagement = videos.Average(video => video.EngagementRate);
        var titleIssues = videos.Count(video => video.Title.Length < 30 || video.Title.Length > 70);
        var weakDescriptions = videos.Count(video => video.DescriptionWordCount < 80);
        var avgDaysBetweenUploads = CalculateAverageDaysBetweenUploads(videos);
        var topVideos = videos.OrderByDescending(video => video.ViewCount).Take(3).ToArray();
        var topWords = ExtractTopWords(topVideos.Select(video => video.Title)).Take(3).ToArray();

        var findings = new List<string>
        {
            $"Health score: {healthScore}/100 based on engagement, packaging quality, upload consistency, and recent content performance.",
            $"Average engagement across recent uploads is {avgEngagement:F2}%, which {(avgEngagement >= 5 ? "signals strong viewer response" : avgEngagement >= 2 ? "shows moderate traction with room to improve" : "suggests the channel is not turning enough viewers into active engagement")}.",
            $"{titleIssues} of the last {videos.Count} videos have titles that are likely under-optimized for click-through because they are too short or too long.",
            $"{weakDescriptions} recent videos have weak descriptions, which is limiting discoverability and clarity for both viewers and search.",
            $"The current upload rhythm averages one video every {avgDaysBetweenUploads:F1} days, which {(avgDaysBetweenUploads <= 7 ? "supports momentum" : "is likely too inconsistent to compound growth reliably")}."
        };

        if (topVideos.Length > 0)
        {
            findings.Add($"Your current winners are {string.Join(", ", topVideos.Select(video => $"\"{video.Title}\""))}. The fastest growth path is to build around the patterns these videos already proved.");
        }

        var recommendations = new List<string>
        {
            topWords.Length > 0
                ? $"Build the next content sprint around {string.Join(", ", topWords)} because your strongest videos already show demand there."
                : "Build the next content sprint around your strongest-performing topic cluster and package it more aggressively.",
            titleIssues > 0
                ? "Rewrite the next 3 to 5 titles with a clearer promised outcome and stronger keyword placement before publishing."
                : "Keep the title format consistent, then test stronger hooks in thumbnails and opening promises."
        };

        var topVideoDtos = videos
            .OrderByDescending(v => v.ViewCount)
            .Take(10)
            .Select(v => new DemoTopVideoDto(v.VideoId, v.Title, v.ViewCount))
            .ToArray();

        return new DemoAnalysisResponse(
            DemoId: $"demo_{Guid.NewGuid():N}",
            ChannelInput: channelInput,
            ChannelTitle: channel.Title,
            ChannelHandle: channel.Handle,
            HealthScore: healthScore,
            Findings: findings.Take(5).ToArray(),
            PreviewRecommendations: recommendations,
            GatedInsights:
            [
                "Full AI growth plan",
                "Premium title rewrite suggestions",
                "Video-by-video SEO opportunities",
                "Traffic leak analysis",
                "Saved dashboard and downloadable report"
            ],
            PaywallMessage: "Unlock the full growth report to see your highest-priority fixes, premium title rewrites, and deeper strategy recommendations.",
            SubscriberCount: channel.SubscriberCount,
            TotalViews: channel.ViewCount,
            VideoCount: (int)channel.VideoCount,
            AvgEngagement: avgEngagement,
            TopVideos: topVideoDtos
        );
    }

    private static readonly IReadOnlyList<DemoTopVideoDto> ShowcaseFallbackTopVideos = new List<DemoTopVideoDto>
    {
        new("sample-1", "How to Make Pickled Eggplants with Mushrooms", 9600),
        new("sample-2", "Chicken Breast Pâté / Spread", 9600),
        new("sample-3", "How to Make Georgian-style Pickled Cabbage", 7900),
        new("sample-4", "How to Make Belyashi (Fried Meat Buns)", 6200)
    };

    /// <summary>
    /// Only the built-in marketing showcase may use the fictional metrics + sample video list.
    /// Any other channel must not receive those numbers when YouTube API is unavailable — it reads as "wrong channel".
    /// </summary>
    private static bool IsBuiltInShowcaseChannel(string channelInput)
    {
        if (string.IsNullOrWhiteSpace(channelInput)) return false;
        var t = channelInput.Trim();
        var handle = ExtractHandle(t);
        if (!string.IsNullOrWhiteSpace(handle) && handle.Equals("maxkantorUSA", StringComparison.OrdinalIgnoreCase))
            return true;

        return t.Contains("maxkantorUSA", StringComparison.OrdinalIgnoreCase)
               || t.Contains("@maxkantorusa", StringComparison.OrdinalIgnoreCase);
    }

    private DemoAnalysisResponse BuildFallbackResponse(string channelInput)
    {
        if (IsBuiltInShowcaseChannel(channelInput))
        {
            return new DemoAnalysisResponse(
                DemoId: $"demo_{Guid.NewGuid():N}",
                ChannelInput: channelInput,
                ChannelTitle: "YouTube Channel Preview",
                ChannelHandle: channelInput,
                HealthScore: 71,
                Findings:
                [
                    "Titles exceed optimal length",
                    "Missing search keywords",
                    "Weak video packaging",
                    "Irregular posting cadence"
                ],
                PreviewRecommendations:
                [
                    "Rewrite high-potential titles",
                    "Optimize descriptions for search",
                    "Focus on winning content patterns",
                    "Improve CTR keywords"
                ],
                GatedInsights:
                [
                    "Full growth plan",
                    "Premium title rewrites",
                    "Traffic opportunity map",
                    "Saved dashboard",
                    "Downloadable report"
                ],
                PaywallMessage: "Unlock premium access to save reports, run deeper analysis, and turn channel data into an actionable growth plan.",
                SubscriberCount: 5770,
                TotalViews: 515218,
                VideoCount: 188,
                AvgEngagement: 3.42,
                TopVideos: ShowcaseFallbackTopVideos
            );
        }

        return new DemoAnalysisResponse(
            DemoId: $"demo_{Guid.NewGuid():N}",
            ChannelInput: channelInput,
            ChannelTitle: "YouTube Channel Preview",
            ChannelHandle: channelInput,
            HealthScore: 0,
            Findings:
            [
                "Live YouTube data could not be loaded (missing API key, quota limit, or channel could not be resolved). The numbers below are placeholders — they are not this channel’s real stats."
            ],
            PreviewRecommendations:
            [
                "Confirm the YouTube Data API key is configured and has quota, then run the audit again."
            ],
            GatedInsights:
            [
                "Full growth plan",
                "Premium title rewrites",
                "Traffic opportunity map",
                "Saved dashboard",
                "Downloadable report"
            ],
            PaywallMessage: "Unlock premium access to save reports, run deeper analysis, and turn channel data into an actionable growth plan.",
            SubscriberCount: 0,
            TotalViews: 0,
            VideoCount: 0,
            AvgEngagement: 0,
            TopVideos: Array.Empty<DemoTopVideoDto>()
        );
    }

    private async Task<DemoAnalysisResponse> BuildFallbackResponseAsync(HttpClient client, string channelInput, CancellationToken cancellationToken)
    {
        var fallbackTitle = "YouTube Channel Preview";
        var fallbackHandle = channelInput;

        try
        {
            var normalizedInput = await NormalizeChannelInputAsync(client, channelInput, cancellationToken);
            var handle = ExtractHandle(normalizedInput);
            if (!string.IsNullOrWhiteSpace(handle))
            {
                fallbackHandle = $"@{handle}";
                fallbackTitle = $"Preview for {fallbackHandle}";
            }
            else
            {
                fallbackHandle = normalizedInput;
            }
        }
        catch
        {
            fallbackHandle = channelInput;
        }

        var response = BuildFallbackResponse(channelInput);
        return response with
        {
            ChannelTitle = fallbackTitle,
            ChannelHandle = fallbackHandle
        };
    }

    private static int CalculateHealthScore(ResolvedChannel channel, IReadOnlyList<VideoSnapshot> videos)
    {
        var score = 55;

        var avgEngagement = videos.Average(video => video.EngagementRate);
        if (avgEngagement >= 6) score += 18;
        else if (avgEngagement >= 4) score += 12;
        else if (avgEngagement >= 2) score += 6;

        var averageViewsPerDay = videos.Average(video => video.ViewsPerDay);
        if (averageViewsPerDay >= 250) score += 10;
        else if (averageViewsPerDay >= 75) score += 6;
        else if (averageViewsPerDay >= 20) score += 3;

        var goodTitles = videos.Count(video => video.Title.Length is >= 30 and <= 70);
        score += (int)Math.Round((double)goodTitles / videos.Count * 8);

        var goodDescriptions = videos.Count(video => video.DescriptionWordCount >= 80);
        score += (int)Math.Round((double)goodDescriptions / videos.Count * 5);

        var cadence = CalculateAverageDaysBetweenUploads(videos);
        if (cadence <= 7) score += 8;
        else if (cadence <= 14) score += 5;
        else if (cadence <= 30) score += 2;

        if (channel.VideoCount >= 50) score += 4;
        else if (channel.VideoCount >= 20) score += 2;

        return Math.Clamp(score, 25, 95);
    }

    private static double CalculateAverageDaysBetweenUploads(IReadOnlyList<VideoSnapshot> videos)
    {
        if (videos.Count < 2)
        {
            return 30;
        }

        var ordered = videos.OrderByDescending(video => video.PublishedAt).ToArray();
        var gaps = new List<double>();
        for (var index = 0; index < ordered.Length - 1; index++)
        {
            gaps.Add(Math.Max((ordered[index].PublishedAt - ordered[index + 1].PublishedAt).TotalDays, 1));
        }

        return gaps.Average();
    }

    private static IEnumerable<string> ExtractTopWords(IEnumerable<string> titles)
    {
        return titles
            .SelectMany(title => Regex.Matches(title.ToLowerInvariant(), @"\b[a-z0-9']+\b").Select(match => match.Value))
            .Where(word => word.Length > 3 && !StopWords.Contains(word))
            .GroupBy(word => word)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key)
            .Select(group => group.Key);
    }

    private static string? ExtractChannelId(string input)
    {
        var match = ChannelIdRegex.Match(input);
        return match.Success ? match.Value : null;
    }

    private static string? ExtractHandle(string input)
    {
        var match = HandleRegex.Match(input);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string? ExtractVideoId(string input)
    {
        var match = VideoIdRegex.Match(input);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static ResolvedChannel ParseChannel(JsonElement item)
    {
        var snippet = item.GetProperty("snippet");
        var title = snippet.GetProperty("title").GetString() ?? "YouTube Channel";
        var handle = $"@{SanitizeHandle(title)}";
        if (snippet.TryGetProperty("customUrl", out var customUrlEl))
        {
            var customUrl = customUrlEl.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(customUrl))
                handle = customUrl.StartsWith("@", StringComparison.Ordinal) ? customUrl : $"@{customUrl}";
        }

        var uploadsPlaylistId = string.Empty;
        if (item.TryGetProperty("contentDetails", out var contentDetailsRoot))
        {
            if (contentDetailsRoot.TryGetProperty("relatedPlaylists", out var playlists))
            {
                if (playlists.TryGetProperty("uploads", out var uploadsEl))
                    uploadsPlaylistId = uploadsEl.GetString() ?? string.Empty;
            }
        }

        long subscriberCount = 0;
        long viewCount = 0;
        long videoCount = 0;
        if (item.TryGetProperty("statistics", out var statistics))
        {
            subscriberCount = GetInt64(statistics, "subscriberCount");
            viewCount = GetInt64(statistics, "viewCount");
            videoCount = GetInt64(statistics, "videoCount");
        }

        return new ResolvedChannel(
            ChannelId: item.GetProperty("id").GetString() ?? string.Empty,
            Title: title,
            Handle: handle,
            UploadsPlaylistId: uploadsPlaylistId,
            SubscriberCount: subscriberCount,
            ViewCount: viewCount,
            VideoCount: videoCount
        );
    }

    private static VideoSnapshot ParseVideo(JsonElement item)
    {
        var snippet = item.GetProperty("snippet");
        var statistics = item.GetProperty("statistics");
        var duration = item.GetProperty("contentDetails").GetProperty("duration").GetString() ?? "PT0S";
        var publishedAt = DateTimeOffset.Parse(snippet.GetProperty("publishedAt").GetString() ?? DateTimeOffset.UtcNow.ToString("O"));
        var viewCount = GetInt64(statistics, "viewCount");
        var likeCount = GetInt64(statistics, "likeCount");
        var commentCount = GetInt64(statistics, "commentCount");
        var ageDays = Math.Max((DateTimeOffset.UtcNow - publishedAt).TotalDays, 1);
        var description = snippet.GetProperty("description").GetString() ?? string.Empty;

        return new VideoSnapshot(
            item.GetProperty("id").GetString() ?? string.Empty,
            snippet.GetProperty("title").GetString() ?? "Untitled",
            description,
            description.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length,
            publishedAt,
            duration,
            viewCount,
            likeCount,
            commentCount,
            ((double)(likeCount + commentCount) / Math.Max(viewCount, 1)) * 100,
            viewCount / ageDays
        );
    }

    private static long GetInt64(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return 0;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number => property.GetInt64(),
            JsonValueKind.String when long.TryParse(property.GetString(), out var parsed) => parsed,
            _ => 0
        };
    }

    private static string SanitizeHandle(string input)
    {
        var cleaned = Regex.Replace(input.ToLowerInvariant(), @"[^a-z0-9]+", string.Empty);
        return string.IsNullOrWhiteSpace(cleaned) ? "channel" : cleaned;
    }

    private sealed record ResolvedChannel(
        string ChannelId,
        string Title,
        string Handle,
        string UploadsPlaylistId,
        long SubscriberCount,
        long ViewCount,
        long VideoCount
    );

    private sealed record VideoSnapshot(
        string VideoId,
        string Title,
        string Description,
        int DescriptionWordCount,
        DateTimeOffset PublishedAt,
        string Duration,
        long ViewCount,
        long LikeCount,
        long CommentCount,
        double EngagementRate,
        double ViewsPerDay
    );
}
