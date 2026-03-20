using System.Text.Json;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

public interface IPublicDashboardService
{
    Task<PublicChannelAnalyzeResponse> AnalyzeChannelAsync(string channelInput, int days, CancellationToken cancellationToken);
    Task<IReadOnlyList<PublicVideoDto>> GetVideosAsync(string channelInput, int maxResults, CancellationToken cancellationToken);
    Task<PublicChannelSuggestionsResponse> GetSuggestionsAsync(string channelInput, int topN, CancellationToken cancellationToken);
    Task<PublicVideoSeoResponse> GetVideoSeoAsync(string channelInput, string videoId, CancellationToken cancellationToken);
    Task<PublicChannelTrafficToolsResponse> GetTrafficToolsAsync(string channelInput, CancellationToken cancellationToken);
}

public sealed class YouTubePublicDashboardService : IPublicDashboardService
{
    private static readonly Regex ChannelIdRegex = new(@"UC[a-zA-Z0-9_-]{20,}", RegexOptions.Compiled);
    private static readonly Regex HandleRegex = new(@"@([A-Za-z0-9._-]+)", RegexOptions.Compiled);
    private static readonly Regex VideoIdRegex = new(@"(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly HashSet<string> StopWords =
    [
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
        "is", "was", "are", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "should", "could", "may", "might", "must", "can", "this", "that", "these", "those", "i", "you",
        "he", "she", "it", "we", "they", "how", "what", "when", "where", "why", "who", "which", "your"
    ];

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ISecretValueProvider _secretValueProvider;

    public YouTubePublicDashboardService(IHttpClientFactory httpClientFactory, ISecretValueProvider secretValueProvider)
    {
        _httpClientFactory = httpClientFactory;
        _secretValueProvider = secretValueProvider;
    }

    public async Task<PublicChannelAnalyzeResponse> AnalyzeChannelAsync(string channelInput, int days, CancellationToken cancellationToken)
    {
        var normalizedInput = await NormalizeChannelInputAsync(channelInput, cancellationToken);
        var channel = await ResolveChannelOrFallbackAsync(normalizedInput, cancellationToken);
        var videos = await LoadRecentVideosOrFallbackAsync(channel, maxResults: 25, cancellationToken);

        var performance = BuildPerformance(videos);
        var recommendations = BuildRecommendations(videos, performance);

        return new PublicChannelAnalyzeResponse(
            ChannelInfo: new PublicChannelInfoDto(
                ChannelId: channel.ChannelId,
                Title: channel.Title,
                SubscriberCount: channel.SubscriberCount,
                VideoCount: channel.VideoCount,
                ViewCount: channel.ViewCount
            ),
            VideosAnalyzed: videos.Count,
            VideoPerformance: performance,
            Recommendations: recommendations
        );
    }

    public async Task<IReadOnlyList<PublicVideoDto>> GetVideosAsync(string channelInput, int maxResults, CancellationToken cancellationToken)
    {
        var normalizedInput = await NormalizeChannelInputAsync(channelInput, cancellationToken);
        var channel = await ResolveChannelOrFallbackAsync(normalizedInput, cancellationToken);
        var videos = await LoadRecentVideosOrFallbackAsync(channel, maxResults: Math.Clamp(maxResults, 1, 200), cancellationToken);
        return videos
            .OrderByDescending(v => v.PublishedAt)
            .Select(v => v.ToDto())
            .ToArray();
    }

    public async Task<PublicChannelSuggestionsResponse> GetSuggestionsAsync(string channelInput, int topN, CancellationToken cancellationToken)
    {
        var normalizedInput = await NormalizeChannelInputAsync(channelInput, cancellationToken);
        var channel = await ResolveChannelOrFallbackAsync(normalizedInput, cancellationToken);
        var videos = await LoadRecentVideosOrFallbackAsync(channel, maxResults: 50, cancellationToken);
        if (videos.Count == 0)
        {
            return new PublicChannelSuggestionsResponse([], new PublicSuggestionCommonPatternsDto([], []), []);
        }

        var sorted = videos.OrderByDescending(v => v.ViewCount).ToArray();
        var top = sorted.Take(Math.Clamp(topN, 1, 20)).ToArray();
        var commonWords = ExtractCommonWords(top.Select(v => v.Title)).Take(10).ToArray();
        var commonTags = ExtractCommonTags(top.SelectMany(v => v.Tags ?? [])).Take(10).ToArray();
        var ideas = GenerateContentIdeas(top.Select(v => v.Title).ToArray(), commonWords);

        return new PublicChannelSuggestionsResponse(
            TopPerformers: top.Select(v => new PublicSuggestionTopPerformerDto(v.Title, v.ViewCount, v.LikeCount + v.CommentCount, v.VideoId)).ToArray(),
            CommonPatterns: new PublicSuggestionCommonPatternsDto(commonWords, commonTags),
            ContentSuggestions: ideas
        );
    }

    public async Task<PublicVideoSeoResponse> GetVideoSeoAsync(string channelInput, string videoId, CancellationToken cancellationToken)
    {
        var normalizedInput = await NormalizeChannelInputAsync(channelInput, cancellationToken);
        var channel = await ResolveChannelOrFallbackAsync(normalizedInput, cancellationToken);
        var videos = await LoadRecentVideosOrFallbackAsync(channel, maxResults: 200, cancellationToken);
        var video = videos.FirstOrDefault(v => string.Equals(v.VideoId, videoId, StringComparison.OrdinalIgnoreCase));
        if (video is null)
        {
            return new PublicVideoSeoResponse(
                VideoId: videoId,
                VideoTitle: "Video not found",
                TitleAnalysis: new PublicSeoTitleAnalysisDto("", 0, [new PublicSeoSuggestionDto("warning", $"Video {videoId} not found", "high")], []),
                DescriptionAnalysis: new PublicSeoDescriptionAnalysisDto(0, 0, []),
                CurrentTags: [],
                SuggestedTags: [],
                SeoScore: new PublicSeoScoreDto(0, "poor", ["Video not found"])
            );
        }

        var titleAnalysis = AnalyzeTitle(video.Title);
        var descriptionAnalysis = AnalyzeDescription(video.Description);
        var topic = ExtractTopic(video.Title);
        var suggestedTags = GenerateTags(topic, video.Title, video.Tags ?? []);
        var seoScore = CalculateSeoScore(titleAnalysis, descriptionAnalysis, (video.Tags ?? []).Count);

        return new PublicVideoSeoResponse(
            VideoId: video.VideoId,
            VideoTitle: video.Title,
            TitleAnalysis: titleAnalysis,
            DescriptionAnalysis: descriptionAnalysis,
            CurrentTags: video.Tags ?? [],
            SuggestedTags: suggestedTags,
            SeoScore: seoScore
        );
    }

    public async Task<PublicChannelTrafficToolsResponse> GetTrafficToolsAsync(string channelInput, CancellationToken cancellationToken)
    {
        var normalizedInput = await NormalizeChannelInputAsync(channelInput, cancellationToken);
        var channel = await ResolveChannelOrFallbackAsync(normalizedInput, cancellationToken);
        var videos = await LoadRecentVideosOrFallbackAsync(channel, maxResults: 50, cancellationToken);
        if (videos.Count == 0)
        {
            return new PublicChannelTrafficToolsResponse([], [], [], [], new PublicSuggestionCommonPatternsDto([], []), []);
        }

        var sortedByViews = videos.OrderByDescending(v => v.ViewCount).ToArray();
        var topPerformers = sortedByViews.Take(5).Select(v => SerializeForGrowth(v,
            "Already a proven winner. Reshare it in community posts, related descriptions, and social posts when the topic is timely."
        )).ToArray();

        const int recentCutoffDays = 120;
        var now = DateTimeOffset.UtcNow;
        var recent = videos.Where(v => (now - v.PublishedAt).TotalDays <= recentCutoffDays).ToArray();
        var pool = recent.Length > 0 ? recent : videos.ToArray();

        var promotionCandidates = pool
            .OrderByDescending(v => v.EngagementRate)
            .ThenByDescending(v => v.ViewCount)
            .Take(5)
            .Select(v => SerializeForGrowth(v,
                "Strong engagement suggests this could travel further. Promote it with direct YouTube links, playlists, pinned comments, and social shares."
            ))
            .ToArray();

        var suggestions = await GetSuggestionsAsync(normalizedInput, 5, cancellationToken);
        var seriesIdeas = BuildSeriesIdeas(videos);

        var checklist = new[]
        {
            new PublicTrafficChecklistItemDto("Share the standard YouTube watch link", "Use the normal watch page for community posts, newsletters, texts, and social posts so viewers watch in the standard YouTube experience."),
            new PublicTrafficChecklistItemDto("Link older winners from new uploads", "Add your strongest related videos in descriptions, pinned comments, end screens, and cards to move real viewers between videos."),
            new PublicTrafficChecklistItemDto("Reshare timely evergreen videos", "Bring back proven videos when the topic becomes relevant again instead of only promoting the newest upload."),
            new PublicTrafficChecklistItemDto("Turn winners into follow-ups", "Publish sequels, deeper dives, and series entries based on your highest-performing topics to capture existing demand."),
            new PublicTrafficChecklistItemDto("Improve click-through before promoting", "Run the SEO optimizer first so the title, description, and tags are stronger before you send more traffic.")
        };

        return new PublicChannelTrafficToolsResponse(
            PromotionCandidates: promotionCandidates,
            TopPerformers: topPerformers,
            ContentSuggestions: suggestions.ContentSuggestions,
            SeriesIdeas: seriesIdeas,
            CommonPatterns: suggestions.CommonPatterns,
            Checklist: checklist
        );
    }

    private async Task<string> NormalizeChannelInputAsync(string channelInput, CancellationToken cancellationToken)
    {
        var trimmed = (channelInput ?? string.Empty).Trim();
        trimmed = DecodeChannelInput(trimmed);
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return "https://www.youtube.com/@maxkantorUSA";
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

        var client = _httpClientFactory.CreateClient();
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

    private static string DecodeChannelInput(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return input;

        var value = input.Trim();
        // Some clients pass already-percent-encoded channel URLs (e.g. .../%40LandsharkOutdoors).
        // Decode a couple of rounds so handle extraction sees '@landshark...'.
        for (var i = 0; i < 2; i++)
        {
            if (!value.Contains('%', StringComparison.Ordinal)) break;
            try
            {
                var decoded = Uri.UnescapeDataString(value);
                if (string.Equals(decoded, value, StringComparison.Ordinal)) break;
                value = decoded;
            }
            catch
            {
                break;
            }
        }

        return value;
    }

    private async Task<ResolvedChannel> ResolveChannelOrFallbackAsync(string channelInput, CancellationToken cancellationToken)
    {
        var apiKey = await _secretValueProvider.GetValueAsync("youtube/api-key", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(apiKey) || apiKey.Trim().Equals("replace-me", StringComparison.OrdinalIgnoreCase))
        {
            return ResolvedChannel.Fallback(channelInput);
        }

        var client = _httpClientFactory.CreateClient();
        try
        {
            return await ResolveChannelAsync(client, apiKey.Trim(), channelInput, cancellationToken);
        }
        catch
        {
            return ResolvedChannel.Fallback(channelInput);
        }
    }

    private async Task<IReadOnlyList<VideoSnapshot>> LoadRecentVideosOrFallbackAsync(ResolvedChannel channel, int maxResults, CancellationToken cancellationToken)
    {
        // Never attach the built-in recipe sample list to an arbitrary channel — that reads as "wrong channel".
        if (string.Equals(channel.ChannelId, "UC_fallback", StringComparison.Ordinal))
        {
            return [];
        }

        var apiKey = await _secretValueProvider.GetValueAsync("youtube/api-key", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(apiKey) || apiKey.Trim().Equals("replace-me", StringComparison.OrdinalIgnoreCase))
        {
            return VideoSnapshot.Fallback().Take(maxResults).ToArray();
        }

        if (string.IsNullOrWhiteSpace(channel.UploadsPlaylistId))
        {
            return VideoSnapshot.Fallback().Take(maxResults).ToArray();
        }

        var client = _httpClientFactory.CreateClient();
        try
        {
            return await LoadRecentVideosAsync(client, apiKey.Trim(), channel.UploadsPlaylistId, maxResults, cancellationToken);
        }
        catch
        {
            return VideoSnapshot.Fallback().Take(maxResults).ToArray();
        }
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
            // First-party handle resolver is much more reliable than general search for @handles.
            // Example: https://www.youtube.com/@LandsharkOutdoors
            try
            {
                return await GetChannelByHandleAsync(client, apiKey, handle, cancellationToken);
            }
            catch
            {
                // Fallback to search-based lookup when forHandle isn't available for a key/project.
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

        return ResolvedChannel.Parse(item);
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

        return ResolvedChannel.Parse(item);
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

    private async Task<IReadOnlyList<VideoSnapshot>> LoadRecentVideosAsync(HttpClient client, string apiKey, string uploadsPlaylistId, int maxResults, CancellationToken cancellationToken)
    {
        var playlistUrl = $"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId={Uri.EscapeDataString(uploadsPlaylistId)}&maxResults={Math.Clamp(maxResults, 1, 50)}&key={Uri.EscapeDataString(apiKey)}";
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
            .Select(VideoSnapshot.Parse)
            .OrderByDescending(video => video.PublishedAt)
            .Take(maxResults)
            .ToArray();
    }

    private static PublicVideoPerformanceDto BuildPerformance(IReadOnlyList<VideoSnapshot> videos)
    {
        if (videos.Count == 0)
        {
            return new PublicVideoPerformanceDto(0, 0, 0, 0, 0, [], [], []);
        }

        var totalViews = videos.Sum(v => v.ViewCount);
        var totalLikes = videos.Sum(v => v.LikeCount);
        var avgViewsPerVideo = videos.Average(v => (double)v.ViewCount);
        var avgEngagementRate = videos.Average(v => v.EngagementRate);

        var topViews = videos.OrderByDescending(v => v.ViewCount).Take(5).Select(v => new PublicTopVideoByViewsDto(v.Title, v.ViewCount, v.VideoId)).ToArray();
        var topEngagement = videos.OrderByDescending(v => v.EngagementRate).Take(5).Select(v => new PublicTopVideoByEngagementDto(v.Title, v.EngagementRate, v.VideoId)).ToArray();
        var topDaily = videos.OrderByDescending(v => v.ViewsPerDay).Take(5).Select(v => new PublicTopVideoByDailyViewsDto(v.Title, v.ViewsPerDay, v.VideoId)).ToArray();

        return new PublicVideoPerformanceDto(
            TotalVideos: videos.Count,
            TotalViews: totalViews,
            TotalLikes: totalLikes,
            AvgViewsPerVideo: avgViewsPerVideo,
            AvgEngagementRate: avgEngagementRate,
            TopVideosByViews: topViews,
            TopVideosByEngagement: topEngagement,
            TopVideosByDailyViews: topDaily
        );
    }

    private static IReadOnlyList<string> BuildRecommendations(IReadOnlyList<VideoSnapshot> videos, PublicVideoPerformanceDto performance)
    {
        var recs = new List<string>();
        if (videos.Count == 0)
        {
            return recs;
        }

        var avgEngagement = performance.AvgEngagementRate;
        if (avgEngagement < 2)
        {
            recs.Add("🔴 Low engagement rate (<2%). Focus on creating more engaging content and encourage viewers to like and comment.");
        }
        else if (avgEngagement < 5)
        {
            recs.Add("🟡 Moderate engagement rate. Try to increase viewer interaction through call-to-actions and community-focused content.");
        }
        else
        {
            recs.Add("🟢 Good engagement rate! Keep up the engaging content.");
        }

        if (videos.Count < 10)
        {
            recs.Add("📹 Build a larger content library. Consistent posting helps build watch time and subscriber retention.");
        }

        var topTitles = performance.TopVideosByViews.Take(3).Select(v => v.Title).ToArray();
        if (topTitles.Length > 0)
        {
            recs.Add($"⭐ Your top performing videos are: {string.Join(", ", topTitles)}. Consider creating similar content or sequels.");
        }

        var now = DateTimeOffset.UtcNow;
        var recent = videos.Where(v => (now - v.PublishedAt).TotalDays <= 30).ToArray();
        if (recent.Length > 0)
        {
            var recentAvg = recent.Average(v => (double)v.ViewCount);
            var overallAvg = videos.Average(v => (double)v.ViewCount);
            if (recentAvg < overallAvg * 0.8)
            {
                recs.Add("📉 Recent videos are underperforming. Review your content strategy, SEO optimization, and promotion tactics.");
            }
            else if (recentAvg > overallAvg * 1.2)
            {
                recs.Add("📈 Recent videos are performing well! Your channel is growing. Continue with your current strategy.");
            }
        }

        return recs;
    }

    private static IEnumerable<string> ExtractCommonWords(IEnumerable<string> titles)
    {
        return titles
            .SelectMany(title => Regex.Matches(title.ToLowerInvariant(), @"\b\w+\b").Select(m => m.Value))
            .Where(word => word.Length > 3 && !StopWords.Contains(word))
            .GroupBy(word => word)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key)
            .Select(group => group.Key);
    }

    private static IEnumerable<string> ExtractCommonTags(IEnumerable<string> tags)
    {
        return tags
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.Key);
    }

    private static IReadOnlyList<string> GenerateContentIdeas(IReadOnlyList<string> topTitles, IReadOnlyList<string> commonWords)
    {
        var suggestions = new List<string>();
        foreach (var title in topTitles.Take(3))
        {
            suggestions.Add($"Create a sequel or follow-up to: '{title}'");
            suggestions.Add($"Make a detailed tutorial version of: '{title}'");
            suggestions.Add($"Create a 'Part 2' or advanced version of: '{title}'");
        }

        if (commonWords.Count > 0)
        {
            var main = commonWords.Take(3).ToArray();
            suggestions.Add($"Create a 'Complete Guide' video about {main[0]}");
            suggestions.Add($"Make a 'Top 10 Tips' video combining {main[0]} and {(main.Length > 1 ? main[1] : "your niche")}");
            suggestions.Add($"Create a beginner-friendly tutorial about {main[0]}");
        }

        suggestions.AddRange([
            "Create a 'How I...' personal story video",
            "Make a comparison video: 'X vs Y'",
            "Create a 'Common Mistakes' or 'What NOT to Do' video",
            "Make a 'Behind the Scenes' or 'Day in the Life' video",
            "Create a Q&A or FAQ video addressing viewer questions"
        ]);

        return suggestions.Take(10).ToArray();
    }

    private static IReadOnlyList<PublicTrafficSeriesIdeaDto> BuildSeriesIdeas(IReadOnlyList<VideoSnapshot> videos)
    {
        var titles = videos.Select(v => v.Title).ToArray();
        var numbered = titles.Where(t => t.Any(char.IsDigit)).Take(3).ToArray();
        var result = new List<PublicTrafficSeriesIdeaDto>();
        if (numbered.Length > 0)
        {
            result.Add(new PublicTrafficSeriesIdeaDto("Numbered Series", "You have videos with numbers - consider creating a formal series", numbered));
        }

        result.AddRange([
            new PublicTrafficSeriesIdeaDto("Beginner to Advanced Series", "Create a progression series for your main topic", ["Part 1: Basics", "Part 2: Intermediate", "Part 3: Advanced"]),
            new PublicTrafficSeriesIdeaDto("Weekly/Monthly Roundup", "Regular summary or recap videos", ["This Week in [Topic]", "Monthly Recap", "What Happened This Month"]),
            new PublicTrafficSeriesIdeaDto("Tutorial Series", "Multi-part comprehensive tutorial", ["Complete Guide: Part 1", "Step-by-Step Tutorial Series"])
        ]);

        return result;
    }

    private static PublicTrafficVideoDto SerializeForGrowth(VideoSnapshot v, string reason)
    {
        var viewCount = v.ViewCount;
        var likeCount = v.LikeCount;
        var commentCount = v.CommentCount;
        var watchUrl = $"https://www.youtube.com/watch?v={v.VideoId}";
        return new PublicTrafficVideoDto(
            VideoId: v.VideoId,
            Title: v.Title,
            Description: v.Description,
            PublishedAt: v.PublishedAt.ToString("O"),
            AgeDays: (int)Math.Max((DateTimeOffset.UtcNow - v.PublishedAt).TotalDays, 0),
            ViewCount: viewCount,
            LikeCount: likeCount,
            CommentCount: commentCount,
            EngagementRate: Math.Round(v.EngagementRate, 2),
            WatchUrl: watchUrl,
            ShareText: $"Check out this video: {v.Title}\n{watchUrl}",
            Reason: reason
        );
    }

    private static PublicSeoTitleAnalysisDto AnalyzeTitle(string currentTitle)
    {
        var suggestions = new List<PublicSeoSuggestionDto>();
        if (currentTitle.Length < 30)
        {
            suggestions.Add(new PublicSeoSuggestionDto("warning", $"Title is too short ({currentTitle.Length} chars). Aim for 50-60 characters for optimal SEO and display.", "high"));
        }
        else if (currentTitle.Length > 60)
        {
            suggestions.Add(new PublicSeoSuggestionDto("warning", $"Title might be truncated ({currentTitle.Length} chars). Consider keeping it under 60 characters.", "medium"));
        }

        if (!Regex.IsMatch(currentTitle, @"\d"))
        {
            suggestions.Add(new PublicSeoSuggestionDto("tip", "Consider adding numbers (e.g., \"5 Ways to...\", \"Top 10...\") as they tend to perform well.", "low"));
        }

        var powerWords = new[] { "ultimate", "complete", "guide", "best", "top", "secret", "proven", "essential", "amazing", "incredible" };
        if (!powerWords.Any(w => currentTitle.Contains(w, StringComparison.OrdinalIgnoreCase)))
        {
            suggestions.Add(new PublicSeoSuggestionDto("tip", "Consider adding power words to increase click-through rate.", "low"));
        }

        return new PublicSeoTitleAnalysisDto(
            CurrentTitle: currentTitle,
            CurrentLength: currentTitle.Length,
            Suggestions: suggestions,
            OptimizedExamples: []
        );
    }

    private static PublicSeoDescriptionAnalysisDto AnalyzeDescription(string currentDescription)
    {
        var suggestions = new List<PublicSeoSuggestionDto>();
        var wordCount = currentDescription.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        if (wordCount < 200)
        {
            suggestions.Add(new PublicSeoSuggestionDto("warning", $"Description is too short ({wordCount} words). Aim for at least 200-300 words with keywords, timestamps, and links.", "high"));
        }

        var first125 = currentDescription.Length > 125 ? currentDescription[..125] : currentDescription;
        if (string.IsNullOrWhiteSpace(first125))
        {
            suggestions.Add(new PublicSeoSuggestionDto("warning", "First 125 characters are critical! Make sure to include main keywords and a compelling hook.", "high"));
        }

        if (!Regex.IsMatch(currentDescription, @"\d{1,2}:\d{2}"))
        {
            suggestions.Add(new PublicSeoSuggestionDto("tip", "Add timestamps to help viewers navigate and improve watch time.", "medium"));
        }

        if (!Regex.IsMatch(currentDescription, @"http[s]?://", RegexOptions.IgnoreCase))
        {
            suggestions.Add(new PublicSeoSuggestionDto("tip", "Add relevant links (social media, resources, related videos) to increase engagement.", "low"));
        }

        if (!currentDescription.Contains("subscribe", StringComparison.OrdinalIgnoreCase))
        {
            suggestions.Add(new PublicSeoSuggestionDto("tip", "Include a subscribe call-to-action in your description.", "medium"));
        }

        return new PublicSeoDescriptionAnalysisDto(
            CurrentLength: currentDescription.Length,
            WordCount: wordCount,
            Suggestions: suggestions
        );
    }

    private static string? ExtractTopic(string title)
    {
        var first = (title ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return string.IsNullOrWhiteSpace(first) ? null : first;
    }

    private static IReadOnlyList<string> GenerateTags(string? topic, string videoTitle, IReadOnlyList<string> existingTags)
    {
        var suggested = new List<string>();

        // Build recommended tags first (so Suggested is visibly different from Current)
        if (!string.IsNullOrWhiteSpace(topic))
        {
            foreach (var t in new[] { topic, $"{topic} tutorial", $"{topic} guide", $"how to {topic}", $"{topic} tips", $"{topic} 2024" })
            {
                var trimmed = t?.Trim();
                if (!string.IsNullOrWhiteSpace(trimmed) && suggested.Count < 15)
                    suggested.Add(trimmed);
            }
        }

        var titleWords = Regex.Matches(videoTitle.ToLowerInvariant(), @"\b\w+\b")
            .Select(m => m.Value)
            .Where(w => w.Length > 4)
            .ToArray();
        var suggestedSet = new HashSet<string>(suggested, StringComparer.OrdinalIgnoreCase);
        foreach (var w in titleWords)
        {
            if (string.IsNullOrWhiteSpace(w)) continue;
            var t = w.Trim();
            if (suggestedSet.Count >= 15) break;
            if (suggestedSet.Add(t))
                suggested.Add(t);
        }

        foreach (var g in new[] { "youtube", "tutorial", "how to", "guide", "tips" })
        {
            if (suggestedSet.Count >= 15) break;
            if (suggestedSet.Add(g))
                suggested.Add(g);
        }

        // Then add existing tags that are not already in suggested (up to 15 total)
        if (existingTags is not null)
        {
            foreach (var t in existingTags)
            {
                if (suggestedSet.Count >= 15) break;
                var trimmed = t?.Trim();
                if (string.IsNullOrWhiteSpace(trimmed)) continue;
                if (suggestedSet.Add(trimmed))
                    suggested.Add(trimmed);
            }
        }

        return suggested.Take(15).ToArray();
    }

    private static PublicSeoScoreDto CalculateSeoScore(PublicSeoTitleAnalysisDto titleAnalysis, PublicSeoDescriptionAnalysisDto descriptionAnalysis, int tagCount)
    {
        var score = 100;
        var issues = new List<string>();
        if (titleAnalysis.CurrentLength < 30 || titleAnalysis.CurrentLength > 60)
        {
            score -= 20;
            issues.Add("Title length needs optimization");
        }
        if (descriptionAnalysis.WordCount < 200)
        {
            score -= 30;
            issues.Add("Description is too short");
        }
        if (tagCount < 10)
        {
            score -= 15;
            issues.Add("Not enough tags");
        }
        else if (tagCount > 15)
        {
            score -= 5;
            issues.Add("Too many tags (YouTube recommends 10-15)");
        }

        score = Math.Max(0, score);
        var rating = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "needs improvement" : "poor";
        return new PublicSeoScoreDto(score, rating, issues);
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

    private static string SanitizeHandle(string input)
    {
        var cleaned = Regex.Replace(input.ToLowerInvariant(), @"[^a-z0-9]+", string.Empty);
        return string.IsNullOrWhiteSpace(cleaned) ? "channel" : cleaned;
    }

    /// <summary>
    /// When the YouTube API cannot be used, avoid branding the UI as the product demo channel.
    /// </summary>
    private static string PreviewTitleFromChannelInput(string? channelInput)
    {
        var trimmed = (channelInput ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed)) return "Channel preview";
        var match = HandleRegex.Match(trimmed);
        if (match.Success) return $"Preview for @{match.Groups[1].Value}";
        return "Channel preview";
    }

    private sealed record ResolvedChannel(
        string ChannelId,
        string Title,
        long SubscriberCount,
        long ViewCount,
        long VideoCount,
        string UploadsPlaylistId)
    {
        public static ResolvedChannel Fallback(string channelInput) => new(
            ChannelId: "UC_fallback",
            Title: YouTubePublicDashboardService.PreviewTitleFromChannelInput(channelInput),
            SubscriberCount: 0,
            ViewCount: 0,
            VideoCount: 0,
            UploadsPlaylistId: string.Empty
        );

        public static ResolvedChannel Parse(JsonElement item)
        {
            var snippet = item.GetProperty("snippet");
            var statistics = item.GetProperty("statistics");
            var contentDetails = item.GetProperty("contentDetails").GetProperty("relatedPlaylists");
            return new ResolvedChannel(
                ChannelId: item.GetProperty("id").GetString() ?? string.Empty,
                Title: snippet.GetProperty("title").GetString() ?? "YouTube Channel",
                SubscriberCount: GetInt64(statistics, "subscriberCount"),
                ViewCount: GetInt64(statistics, "viewCount"),
                VideoCount: GetInt64(statistics, "videoCount"),
                UploadsPlaylistId: contentDetails.TryGetProperty("uploads", out var uploads) ? uploads.GetString() ?? string.Empty : string.Empty
            );
        }
    }

    private sealed record VideoSnapshot(
        string VideoId,
        string Title,
        string Description,
        DateTimeOffset PublishedAt,
        string Duration,
        long ViewCount,
        long LikeCount,
        long CommentCount,
        IReadOnlyList<string>? Tags)
    {
        public double EngagementRate => ((double)(LikeCount + CommentCount) / Math.Max(ViewCount, 1)) * 100;
        public double ViewsPerDay
        {
            get
            {
                var ageDays = Math.Max((DateTimeOffset.UtcNow - PublishedAt).TotalDays, 1);
                return ViewCount / ageDays;
            }
        }

        public PublicVideoDto ToDto() => new(
            VideoId,
            Title,
            Description,
            PublishedAt.ToString("O"),
            ViewCount,
            LikeCount,
            CommentCount,
            Duration,
            Tags ?? []
        );

        public static VideoSnapshot Parse(JsonElement item)
        {
            var snippet = item.GetProperty("snippet");
            var statistics = item.GetProperty("statistics");
            var duration = item.GetProperty("contentDetails").GetProperty("duration").GetString() ?? "PT0S";
            var publishedAt = DateTimeOffset.Parse(snippet.GetProperty("publishedAt").GetString() ?? DateTimeOffset.UtcNow.ToString("O"));
            var description = snippet.GetProperty("description").GetString() ?? string.Empty;
            var tags = snippet.TryGetProperty("tags", out var tagsEl) && tagsEl.ValueKind == JsonValueKind.Array
                ? tagsEl.EnumerateArray().Select(t => t.GetString()).Where(s => !string.IsNullOrWhiteSpace(s)).Cast<string>().ToArray()
                : Array.Empty<string>();

            return new VideoSnapshot(
                item.GetProperty("id").GetString() ?? string.Empty,
                snippet.GetProperty("title").GetString() ?? "Untitled",
                description,
                publishedAt,
                duration,
                GetInt64(statistics, "viewCount"),
                GetInt64(statistics, "likeCount"),
                GetInt64(statistics, "commentCount"),
                tags
            );
        }

        public static IEnumerable<VideoSnapshot> Fallback()
        {
            var now = DateTimeOffset.UtcNow;
            yield return new VideoSnapshot("B3bcAR1565k", "How to Make Pickled Eggplants with Mushrooms", "", now.AddDays(-90), "PT10M", 9596, 120, 15, []);
            yield return new VideoSnapshot("ozTRk69sNAw", "Chicken Breast Pâté / Spread — Quick & Fancy", "", now.AddDays(-120), "PT8M", 9559, 98, 9, []);
            yield return new VideoSnapshot("aU5WFB8vPZg", "How to Make Georgian-style Pickled Cabbage", "", now.AddDays(-150), "PT12M", 7948, 80, 7, []);
            yield return new VideoSnapshot("aQ8c5OmX14", "How to Make Belyashi (Fried Meat Buns)", "", now.AddDays(-180), "PT14M", 7215, 77, 6, []);
        }
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
}

