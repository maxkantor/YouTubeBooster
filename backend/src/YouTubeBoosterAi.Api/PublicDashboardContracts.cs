using System.Text.Json.Serialization;

namespace YouTubeBoosterAi.Api;

public sealed record PublicChannelInfoDto(
    [property: JsonPropertyName("channel_id")] string ChannelId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("subscriber_count")] long SubscriberCount,
    [property: JsonPropertyName("video_count")] long VideoCount,
    [property: JsonPropertyName("view_count")] long ViewCount
);

public sealed record PublicTopVideoByViewsDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("view_count")] long ViewCount,
    [property: JsonPropertyName("video_id")] string VideoId
);

public sealed record PublicTopVideoByEngagementDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("engagement_rate")] double EngagementRate,
    [property: JsonPropertyName("video_id")] string VideoId
);

public sealed record PublicTopVideoByDailyViewsDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("views_per_day")] double ViewsPerDay,
    [property: JsonPropertyName("video_id")] string VideoId
);

public sealed record PublicVideoPerformanceDto(
    [property: JsonPropertyName("total_videos")] int TotalVideos,
    [property: JsonPropertyName("total_views")] long TotalViews,
    [property: JsonPropertyName("total_likes")] long TotalLikes,
    [property: JsonPropertyName("avg_views_per_video")] double AvgViewsPerVideo,
    [property: JsonPropertyName("avg_engagement_rate")] double AvgEngagementRate,
    [property: JsonPropertyName("top_videos_by_views")] IReadOnlyList<PublicTopVideoByViewsDto> TopVideosByViews,
    [property: JsonPropertyName("top_videos_by_engagement")] IReadOnlyList<PublicTopVideoByEngagementDto> TopVideosByEngagement,
    [property: JsonPropertyName("top_videos_by_daily_views")] IReadOnlyList<PublicTopVideoByDailyViewsDto> TopVideosByDailyViews
);

public sealed record PublicChannelAnalyzeResponse(
    [property: JsonPropertyName("channel_info")] PublicChannelInfoDto ChannelInfo,
    [property: JsonPropertyName("videos_analyzed")] int VideosAnalyzed,
    [property: JsonPropertyName("video_performance")] PublicVideoPerformanceDto VideoPerformance,
    [property: JsonPropertyName("recommendations")] IReadOnlyList<string> Recommendations
);

public sealed record PublicVideoDto(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("published_at")] string PublishedAt,
    [property: JsonPropertyName("view_count")] long ViewCount,
    [property: JsonPropertyName("like_count")] long LikeCount,
    [property: JsonPropertyName("comment_count")] long CommentCount,
    [property: JsonPropertyName("duration")] string Duration,
    [property: JsonPropertyName("tags")] IReadOnlyList<string> Tags
);

public sealed record PublicSuggestionTopPerformerDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("views")] long Views,
    [property: JsonPropertyName("engagement")] long Engagement,
    [property: JsonPropertyName("video_id")] string VideoId
);

public sealed record PublicSuggestionCommonPatternsDto(
    [property: JsonPropertyName("common_words")] IReadOnlyList<string> CommonWords,
    [property: JsonPropertyName("common_tags")] IReadOnlyList<string> CommonTags
);

public sealed record PublicChannelSuggestionsResponse(
    [property: JsonPropertyName("top_performers")] IReadOnlyList<PublicSuggestionTopPerformerDto> TopPerformers,
    [property: JsonPropertyName("common_patterns")] PublicSuggestionCommonPatternsDto CommonPatterns,
    [property: JsonPropertyName("content_suggestions")] IReadOnlyList<string> ContentSuggestions
);

public sealed record PublicSeoSuggestionDto(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("priority")] string Priority
);

public sealed record PublicSeoTitleAnalysisDto(
    [property: JsonPropertyName("current_title")] string CurrentTitle,
    [property: JsonPropertyName("current_length")] int CurrentLength,
    [property: JsonPropertyName("suggestions")] IReadOnlyList<PublicSeoSuggestionDto> Suggestions,
    [property: JsonPropertyName("optimized_examples")] IReadOnlyList<string> OptimizedExamples
);

public sealed record PublicSeoDescriptionAnalysisDto(
    [property: JsonPropertyName("current_length")] int CurrentLength,
    [property: JsonPropertyName("word_count")] int WordCount,
    [property: JsonPropertyName("suggestions")] IReadOnlyList<PublicSeoSuggestionDto> Suggestions
);

public sealed record PublicSeoScoreDto(
    [property: JsonPropertyName("score")] int Score,
    [property: JsonPropertyName("rating")] string Rating,
    [property: JsonPropertyName("issues")] IReadOnlyList<string> Issues
);

public sealed record PublicVideoSeoResponse(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("video_title")] string VideoTitle,
    [property: JsonPropertyName("title_analysis")] PublicSeoTitleAnalysisDto TitleAnalysis,
    [property: JsonPropertyName("description_analysis")] PublicSeoDescriptionAnalysisDto DescriptionAnalysis,
    [property: JsonPropertyName("current_tags")] IReadOnlyList<string> CurrentTags,
    [property: JsonPropertyName("suggested_tags")] IReadOnlyList<string> SuggestedTags,
    [property: JsonPropertyName("seo_score")] PublicSeoScoreDto SeoScore
);

public sealed record PublicTrafficChecklistItemDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("details")] string Details
);

public sealed record PublicTrafficSeriesIdeaDto(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("examples")] IReadOnlyList<string> Examples
);

public sealed record PublicTrafficVideoDto(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("published_at")] string? PublishedAt,
    [property: JsonPropertyName("age_days")] int? AgeDays,
    [property: JsonPropertyName("view_count")] long ViewCount,
    [property: JsonPropertyName("like_count")] long LikeCount,
    [property: JsonPropertyName("comment_count")] long CommentCount,
    [property: JsonPropertyName("engagement_rate")] double EngagementRate,
    [property: JsonPropertyName("watch_url")] string WatchUrl,
    [property: JsonPropertyName("share_text")] string ShareText,
    [property: JsonPropertyName("reason")] string Reason
);

public sealed record PublicChannelTrafficToolsResponse(
    [property: JsonPropertyName("promotion_candidates")] IReadOnlyList<PublicTrafficVideoDto> PromotionCandidates,
    [property: JsonPropertyName("top_performers")] IReadOnlyList<PublicTrafficVideoDto> TopPerformers,
    [property: JsonPropertyName("content_suggestions")] IReadOnlyList<string> ContentSuggestions,
    [property: JsonPropertyName("series_ideas")] IReadOnlyList<PublicTrafficSeriesIdeaDto> SeriesIdeas,
    [property: JsonPropertyName("common_patterns")] PublicSuggestionCommonPatternsDto CommonPatterns,
    [property: JsonPropertyName("checklist")] IReadOnlyList<PublicTrafficChecklistItemDto> Checklist
);

public sealed record PublicRunnerPingResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("ts")] string Timestamp
);

public sealed record PublicRunnerIssueRequest(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("desired_speed")] double? DesiredSpeed,
    [property: JsonPropertyName("actual_speed")] double? ActualSpeed,
    [property: JsonPropertyName("position_seconds")] double? PositionSeconds,
    [property: JsonPropertyName("note")] string Note
);

