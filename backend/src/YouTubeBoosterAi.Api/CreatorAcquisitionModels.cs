using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace YouTubeBoosterAi.Api;

public static class CreatorAcquisitionCampaigns
{
    public const string Cook001 = "COOK-001";
    public const string Other001 = "OTHER-001";
    public const string DefaultSubject = "One idea for your YouTube channel";
}

public static class CreatorAcquisitionViews
{
    public static readonly string[] All =
    [
        "discovered", "needs_inspection", "qualified", "contact_verified", "draft_ready", "needs_review",
        "approval_queue", "approved", "scheduled", "sent", "delivered", "clicked", "replied", "interested",
        "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer",
        "unsubscribed", "bounced", "complained", "suppressed", "rejected"
    ];
}

public sealed record AcqProspectRecord(
    string ProspectId,
    string ChannelName,
    string Handle,
    string ChannelUrl,
    string? ChannelId,
    string PrimaryNiche,
    string Language,
    string? Country,
    long SubscriberCount,
    int VideoCount,
    DateTimeOffset? RecentUploadAt,
    double? CadenceDays,
    string? TypicalViewRange,
    string? OfficialWebsite,
    string? PublicBusinessEmail,
    string? ContactSourceUrl,
    DateTimeOffset? ContactVerifiedAt,
    string ContactType,
    int ChannelFitScore,
    int AuditOpportunityScore,
    int PurchaseLikelihoodScore,
    int PriorityScore,
    string InspectionStatus,
    string OutreachStatus,
    DateTimeOffset? LastContactedAt,
    string SuppressionStatus,
    string Campaign,
    string TrackedPath,
    string OpaqueToken,
    string? InspectedUrl,
    DateTimeOffset? EvidenceAt,
    string? Observation,
    string? SuggestedImprovement,
    string? EvidenceSummary,
    string? Subject,
    string? Body,
    string? ContentHash,
    string? ApprovalId,
    string? TicketId,
    string? Notes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    bool PreviewPlaceholder,
    string? EmailVariant = null,
    string? CohortRunId = null,
    string? LastSesMessageId = null,
    int WeakDescriptionCount = 0,
    int TitleIssueCount = 0,
    int SampleSize = 0,
    int ContactResearchAttempts = 0,
    DateTimeOffset? ContactResearchNextAt = null,
    DateTimeOffset? ContactResearchLastAt = null,
    string? ContactResearchStatus = null,
    int FollowUpStep = 0,
    DateTimeOffset? NextFollowUpAt = null,
    string? ScoreBreakdownJson = null,
    string? ApprovedBy = null,
    DateTimeOffset? ApprovedAt = null,
    DateTimeOffset? CooldownOverrideUntil = null,
    bool AdminAttestedContact = false,
    string? TemplateVersion = null,
    string? SubjectVariant = null,
    string? MessageVariant = null,
    string? FindingType = null,
    string? ExampleVideoTitle = null,
    string? ContactConfidence = null,
    string? ContactDiscoveryDetail = null,
    string? ContactDiscoveryResult = null,
    string? Market = null,
    string? CreatorTier = null,
    string? ContentFormat = null,
    bool Strategic = false,
    string? StrategicGoal = null
);

public sealed record AcqApprovalRecord(
    string ApprovalId,
    string Approver,
    DateTimeOffset ApprovedAt,
    string Campaign,
    IReadOnlyList<string> ProspectIds,
    Dictionary<string, string> ContentHashes,
    string AudienceQueryVersion,
    int MaximumSends,
    DateTimeOffset ExpiresAt
);

public sealed record AcqCampaignState(
    bool MarketingSendingEnabled,
    bool ComplaintPause,
    int DailyLimit,
    DateTimeOffset? LastSendDayEt,
    int SentTodayEt,
    string? PostalAddress,
    string? FromEmail,
    string? FromName,
    string? ReplyTo,
    string? ConfigSet,
    int MaxDailyLimit = 30,
    bool RampEnabled = true,
    int CooldownDays = 14,
    int RampStage = 10,
    bool StandingCampaignApproval = false,
    string? RampBlockReason = null,
    bool AllowWeekends = true
);

public sealed record AcqSendGateResult(bool Ok, string Reason);

/// <summary>
/// automated: full safety + cooldown + daily pacing (pacing enforced by caller).
/// manual_admin: authenticated admin override — skips automation cooldown/pacing only.
/// </summary>
public enum AcqSendMode
{
    Automated = 0,
    ManualAdmin = 1
}

public sealed record AcqSanitizedProspectDto(
    string ProspectId,
    string ChannelName,
    string Handle,
    string ChannelUrl,
    string? ChannelId,
    string PrimaryNiche,
    string Language,
    string? Country,
    string SubscriberRange,
    int VideoCount,
    DateTimeOffset? RecentUploadAt,
    double? CadenceDays,
    string? OfficialWebsite,
    string? ContactSourceUrl,
    string ContactType,
    string ContactStatus,
    int PriorityScore,
    string OpportunityCategory,
    string InspectionStatus,
    string OutreachStatus,
    string ApprovalStatus,
    string Campaign,
    string TrackedPath,
    string? Observation,
    string? SuggestedImprovement,
    string? Subject,
    DateTimeOffset? EvidenceAt,
    bool PreviewPlaceholder,
    int AcquisitionScore = 0,
    string? ScoreBreakdownJson = null,
    string? ContactResearchStatus = null,
    int FollowUpStep = 0,
    DateTimeOffset? NextFollowUpAt = null,
    DateTimeOffset? LastContactedAtPublic = null,
    string? TemplateVersion = null,
    string? SubjectVariant = null,
    string? MessageVariant = null,
    string? FindingType = null,
    string? ExampleVideoTitle = null,
    string? ContactConfidence = null,
    string? ContactDiscoveryResult = null,
    DateTimeOffset? ContactResearchLastAt = null,
    DateTimeOffset? ContactResearchNextAt = null,
    string? TicketId = null,
    string? Market = null,
    string? CreatorTier = null,
    string? ContentFormat = null,
    bool Strategic = false,
    string? StrategicGoal = null
);

public sealed record AcqAdminProspectDto(
    AcqSanitizedProspectDto Public,
    string? PublicBusinessEmail,
    string? Body = null,
    DateTimeOffset? LastContactedAt = null,
    string? ApprovedBy = null,
    DateTimeOffset? ApprovedAt = null,
    DateTimeOffset? CooldownOverrideUntil = null,
    bool AdminAttestedContact = false,
    string? FromDisplay = null,
    string? HtmlPreview = null,
    string? TextPreview = null,
    string? CtaDestination = null,
    string? FindingSource = null
);

public sealed record AcqUpsertProspectRequest(
    string ChannelInput,
    string PrimaryNiche,
    string Campaign,
    string? Language,
    string? OfficialWebsite,
    string? PublicBusinessEmail,
    string? ContactSourceUrl,
    string ContactType,
    string? Notes,
    string? Market = null,
    bool Strategic = false,
    string? StrategicGoal = null,
    bool SkipContactResearch = false
);

public sealed record AcqApproveBatchRequest(
    string Campaign,
    IReadOnlyList<string> ProspectIds,
    int MaximumSends,
    string AudienceQueryVersion
);

public sealed record AcqSendApprovedRequest(
    string? Campaign = null,
    IReadOnlyList<string>? ProspectIds = null
);

public sealed record AcqApproveAndSendResult(
    bool Ok,
    bool Approved,
    bool Sent,
    string? Error,
    string? MessageId,
    AcqProspectRecord? Prospect
);

public sealed record AcqSendApprovedItemResult(
    string ProspectId,
    bool Sent,
    string? Error,
    string? MessageId
);

public sealed record AcqSendApprovedBatchResult(
    int Sent,
    int Skipped,
    IReadOnlyList<AcqSendApprovedItemResult> Results
);

public sealed record AcqEmailDiscoveryStartRequest(
    string? Campaign = null,
    IReadOnlyList<string>? ProspectIds = null,
    string? Filter = null,
    bool DryRun = false,
    bool ForceRetry = false,
    int BatchSize = 5
);

public sealed record AcqEmailDiscoveryItemResult(
    string ProspectId,
    string Handle,
    string Outcome,
    string? Email,
    string? SourceUrl,
    string? SourceType,
    string? Confidence,
    string? Detail,
    bool DraftPrepared = false,
    string? Warning = null
);

public sealed record AcqEmailDiscoveryJobState(
    string JobId,
    string Campaign,
    string AdminEmail,
    bool DryRun,
    bool ForceRetry,
    DateTimeOffset StartedAt,
    DateTimeOffset UpdatedAt,
    string Status,
    IReadOnlyList<string> ProspectIds,
    int Cursor,
    int Processed,
    int Found,
    int Review,
    int NotFound,
    int Failed,
    int Skipped,
    IReadOnlyList<AcqEmailDiscoveryItemResult> Results,
    int HttpFetches = 0
);

public sealed record AcqEmailDiscoveryAcceptRequest(bool Accept = true, string? Reason = null);

public sealed record AcqCreatorDiscoveryStartRequest(
    string? Category = null,
    string? Language = null,
    string? Market = null,
    string? Tier = null,
    int? Target = null,
    string? Campaign = null
);

public sealed record AcqCreatorDiscoveryItem(
    string? ChannelId,
    string? Handle,
    string? Title,
    string Outcome,
    string? Reason,
    string? ProspectId
);

public sealed record AcqCreatorDiscoveryJobState(
    string JobId,
    string Category,
    string Language,
    string Market,
    string? Tier,
    string Campaign,
    string AdminEmail,
    int Target,
    DateTimeOffset StartedAt,
    DateTimeOffset UpdatedAt,
    string Status,
    IReadOnlyList<string> Queries,
    int QueryIndex,
    string? PageToken,
    IReadOnlyList<AcqYoutubeSearchHit> Queue,
    int QueueIndex,
    int SourcesEvaluated,
    int Qualified,
    int DuplicatesSkipped,
    int Added,
    int Failed,
    IReadOnlyList<AcqCreatorDiscoveryItem> Results,
    string? LastError = null,
    string? LastErrorStatus = null
);

public sealed record AcqCampaignConfig(
    string CampaignId,
    string Name,
    string Category,
    string Language,
    string Market,
    string? Tier,
    int DailyLimit,
    bool SendingEnabled,
    DateTimeOffset CreatedAt
);

public sealed record AcqCampaignConfigRequest(
    string? Name = null,
    string? Category = null,
    string? Language = null,
    string? Market = null,
    string? Tier = null,
    int? DailyLimit = null,
    bool? SendingEnabled = null,
    string? CampaignId = null
);

public sealed record AcqDraftPrepareResult(
    AcqProspectRecord? Prospect,
    bool DraftPrepared,
    string? Reason = null
);

public sealed record AcqDraftPrepareBatchRequest(
    string? Campaign = null,
    IReadOnlyList<string>? ProspectIds = null,
    string? Filter = null,
    bool Force = false
);

public sealed record AcqDraftPrepareBatchItem(
    string ProspectId,
    string Handle,
    bool DraftPrepared,
    string? Reason,
    string? Subject
);

public sealed record AcqDraftPrepareBatchResult(
    int Attempted,
    int Prepared,
    int Failed,
    int Skipped,
    IReadOnlyList<AcqDraftPrepareBatchItem> Results
);


public sealed record AcqWeekdaySendResult(
    bool MarketingSendingEnabled,
    int Attempted,
    int Sent,
    int Skipped,
    IReadOnlyList<string> Reasons,
    int DailyLimit = 10,
    string? CohortRunId = null,
    string? RampBlockReason = null,
    /// <summary>Prospects evaluated against gates (not SES send attempts).</summary>
    int Evaluated = 0,
    /// <summary>SES SendRawEmail calls made this run (accepted or rejected).</summary>
    int SesAttempted = 0,
    IReadOnlyDictionary<string, int>? ReasonCounts = null
);

public static class AcqJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };
}

public static class AcqIds
{
    public static string NewProspectId(string campaign, int n) =>
        $"{campaign}-P{n:D3}";

    public static string NewOpaqueToken() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    public static string NewApprovalId() =>
        $"APR-{DateTimeOffset.UtcNow:yyyyMMdd}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant()}";

    public static string Sha256Hex(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string SubscriberRange(long subs)
    {
        if (subs < 1000) return "under_1k";
        if (subs <= 100000) return "1k_100k";
        if (subs <= 350000) return "100k_350k";
        return "over_350k";
    }
}
