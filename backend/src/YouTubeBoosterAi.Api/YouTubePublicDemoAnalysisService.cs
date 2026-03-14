using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;

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

    public YouTubePublicDemoAnalysisService(
        IHttpClientFactory httpClientFactory,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore)
    {
        _httpClientFactory = httpClientFactory;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
    }

    public async Task<DemoAnalysisResponse> RunDemoAsync(DemoAnalysisRequest request, CancellationToken cancellationToken)
    {
        var apiKey = await _secretValueProvider.GetValueAsync("youtube/api-key", secure: true, cancellationToken);
        var resolvedInput = request.ChannelInput;
        var client = _httpClientFactory.CreateClient();

        try
        {
            resolvedInput = await NormalizeChannelInputAsync(client, resolvedInput, cancellationToken);
        }
        catch
        {
            resolvedInput = request.ChannelInput;
        }

        DemoAnalysisResponse response;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            response = await BuildFallbackResponseAsync(client, resolvedInput, cancellationToken);
        }
        else
        {
            var channel = await ResolveChannelAsync(client, apiKey, resolvedInput, cancellationToken);
            var videos = await LoadRecentVideosAsync(client, apiKey, channel.UploadsPlaylistId, cancellationToken);
            response = BuildResponseFromChannelData(resolvedInput, channel, videos);
        }

        await _appDataStore.SaveDemoAsync(request with { ChannelInput = resolvedInput }, response, cancellationToken);
        return response;
    }

    private async Task<string> NormalizeChannelInputAsync(HttpClient client, string channelInput, CancellationToken cancellationToken)
    {
        var trimmed = channelInput.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return channelInput;
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
            return await SearchChannelAsync(client, apiKey, $"@{handle}", cancellationToken);
        }

        return await SearchChannelAsync(client, apiKey, trimmed, cancellationToken);
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

    private static readonly IReadOnlyList<DemoTopVideoDto> FallbackTopVideos = new List<DemoTopVideoDto>
    {
        new("sample-1", "How to Make Pickled Eggplants with Mushrooms", 9600),
        new("sample-2", "Chicken Breast Pâté / Spread", 9600),
        new("sample-3", "How to Make Georgian-style Pickled Cabbage", 7900),
        new("sample-4", "How to Make Belyashi (Fried Meat Buns)", 6200)
    };

    private DemoAnalysisResponse BuildFallbackResponse(string channelInput)
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
            TopVideos: FallbackTopVideos
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
        var statistics = item.GetProperty("statistics");
        var contentDetails = item.GetProperty("contentDetails").GetProperty("relatedPlaylists");
        var title = snippet.GetProperty("title").GetString() ?? "YouTube Channel";
        var handle = $"@{SanitizeHandle(title)}";
        if (snippet.TryGetProperty("customUrl", out var customUrlEl))
        {
            var customUrl = customUrlEl.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(customUrl))
                handle = customUrl.StartsWith("@", StringComparison.Ordinal) ? customUrl : $"@{customUrl}";
        }
        return new ResolvedChannel(
            ChannelId: item.GetProperty("id").GetString() ?? string.Empty,
            Title: title,
            Handle: handle,
            UploadsPlaylistId: contentDetails.GetProperty("uploads").GetString() ?? string.Empty,
            SubscriberCount: GetInt64(statistics, "subscriberCount"),
            ViewCount: GetInt64(statistics, "viewCount"),
            VideoCount: GetInt64(statistics, "videoCount")
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
