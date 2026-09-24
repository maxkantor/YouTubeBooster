namespace YouTubeBoosterAi.Api;

/// <summary>
/// Shared identity, history, and skip classification for creator outreach.
/// Used by weekday automation, manual send, and bulk jobs so no path can
/// double-send an initial email.
/// </summary>
public static class AcqSendGuard
{
    public const string ReasonAlreadyContacted = "already_contacted";
    public const string ReasonAlreadyProcessing = "already_processing";
    public const string ReasonAlreadyFollowUp = "already_sent_follow_up";
    public const string ReasonGlobalUnsub = "GLOBAL_SUPPRESSION_UNSUBSCRIBED";
    public const string ReasonGlobalBounce = "GLOBAL_SUPPRESSION_BOUNCED";
    public const string ReasonGlobalComplaint = "GLOBAL_SUPPRESSION_COMPLAINT";
    public const string ReasonGlobalManual = "GLOBAL_SUPPRESSION_MANUAL_SUPPRESSION";
    public const string ReasonGlobalInvalid = "GLOBAL_SUPPRESSION_INVALID_ADDRESS";
    public const string ReasonReplied = "replied";
    public const string ReasonConverted = "converted";
    public const string ReasonDuplicateEmail = "duplicate_email";

    public static string NormalizeEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return "";
        return email.Trim().ToLowerInvariant();
    }

    public static string SuppressionLedgerRunId(string normalizedEmail) =>
        "suppress:" + NormalizeEmail(normalizedEmail);

    public static string[] IdempotencyKeys(
        string campaign,
        string? email,
        string? channelId,
        int followUpStep)
    {
        var camp = (campaign ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(camp)) camp = CreatorAcquisitionCampaigns.Cook001;
        var step = Math.Clamp(followUpStep, 0, OutreachPolicy.DefaultMaxFollowUps);
        var prefix = step <= 0 ? "acq:initial" : $"acq:fu{step}";
        var keys = new List<string>(2);
        var em = NormalizeEmail(email);
        if (!string.IsNullOrWhiteSpace(em))
            keys.Add($"{prefix}:{camp}:{em}");
        var ch = (channelId ?? "").Trim();
        if (!string.IsNullOrWhiteSpace(ch))
            keys.Add($"{prefix}:{camp}:ch:{ch}");
        if (keys.Count == 0)
            keys.Add($"{prefix}:{camp}:unknown");
        return keys.ToArray();
    }

    public static string HumanSkipReason(string? raw)
    {
        var code = OutreachPolicy.NormalizeSkipReason(raw);
        return code switch
        {
            "ALREADY_CONTACTED" => "Already contacted",
            "SUPPRESSED" => "Unsubscribed",
            "GLOBAL_SUPPRESSION_UNSUBSCRIBED" => "Unsubscribed",
            "GLOBAL_SUPPRESSION_BOUNCED" => "Bounced",
            "GLOBAL_SUPPRESSION_COMPLAINT" => "Complaint",
            "GLOBAL_SUPPRESSION_MANUAL_SUPPRESSION" => "Suppressed",
            "GLOBAL_SUPPRESSION_INVALID_ADDRESS" => "Invalid email",
            "COOLDOWN" => "In cooldown",
            "INVALID_EMAIL" => "Invalid email",
            "NOT_APPROVED" => "Waiting for approval",
            "DAILY_LIMIT_REACHED" => "Daily limit reached",
            "MANUAL_APPROVAL_REQUIRED" => "Waiting for approval",
            "READY_TO_SEND" => "Ready to send",
            "SAFETY_PAUSED" => "Automatic sending paused — bounce or complaint rate above threshold",
            "CAMPAIGN_DISABLED" => "Sending is off",
            "DRY_RUN" => "Dry run — no emails sent",
            "NO_PUBLIC_EMAIL_FOUND" => "No public email found",
            "DUPLICATE_EMAIL" => "Duplicate email",
            "DUPLICATE_CHANNEL" => "Duplicate channel",
            "SES_QUOTA_REACHED" => "SES provider quota reached",
            "EXECUTION_BUDGET" => "Invocation time budget reached",
            "NOT_QUALIFIED" => "Not eligible",
            "MISSING_CONFIG" => "Sending not configured",
            "STRATEGIC_MANUAL" => "Strategic — manual only",
            _ => string.IsNullOrWhiteSpace(raw) ? "Skipped" : raw.Trim()
        };
    }

    public static string? HistoryBlockReason(
        IReadOnlyList<AcqProspectRecord> all,
        AcqProspectRecord candidate,
        bool followUpDue)
    {
        var status = (candidate.OutreachStatus ?? "").ToLowerInvariant();
        if (status is "replied" or "interested")
            return ReasonReplied;
        if (status is "customer")
            return ReasonConverted;
        if (status is "unsubscribed")
            return ReasonGlobalUnsub;
        if (status is "bounced")
            return ReasonGlobalBounce;
        if (status is "complained")
            return ReasonGlobalComplaint;
        if (!string.Equals(candidate.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
            return SuppressionReasonCode(candidate.SuppressionStatus);

        var email = NormalizeEmail(candidate.PublicBusinessEmail);
        var channel = (candidate.ChannelId ?? "").Trim();
        var campaign = (candidate.Campaign ?? "").Trim();

        foreach (var other in all)
        {
            if (string.Equals(other.ProspectId, candidate.ProspectId, StringComparison.OrdinalIgnoreCase))
                continue;
            var sameEmail = email.Length > 0 && string.Equals(NormalizeEmail(other.PublicBusinessEmail), email, StringComparison.OrdinalIgnoreCase);
            var sameChannel = channel.Length > 0 && string.Equals((other.ChannelId ?? "").Trim(), channel, StringComparison.OrdinalIgnoreCase);
            if (!sameEmail && !sameChannel) continue;

            if (!string.Equals(other.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
                return SuppressionReasonCode(other.SuppressionStatus);
            var otherStatus = (other.OutreachStatus ?? "").ToLowerInvariant();
            if (otherStatus is "unsubscribed") return ReasonGlobalUnsub;
            if (otherStatus is "replied" or "interested") return ReasonReplied;
            if (otherStatus is "customer") return ReasonConverted;
            if (otherStatus is "bounced") return ReasonGlobalBounce;
            if (otherStatus is "complained") return ReasonGlobalComplaint;

            var sameCampaign = string.Equals(other.Campaign, campaign, StringComparison.OrdinalIgnoreCase);
            if (!sameCampaign) continue;

            if (!followUpDue && (other.LastContactedAt is not null || otherStatus is "sent" or "delivered" or "clicked"))
                return sameEmail ? ReasonDuplicateEmail : "duplicate_channel";
        }

        if (!followUpDue && candidate.LastContactedAt is not null)
            return ReasonAlreadyContacted;

        return null;
    }

    public static string SuppressionReasonCode(string? status)
    {
        var s = (status ?? "").Trim().ToLowerInvariant();
        return s switch
        {
            "unsubscribed" or "unsub" => ReasonGlobalUnsub,
            "bounced" or "bounce" or "hard_bounce" => ReasonGlobalBounce,
            "complained" or "complaint" => ReasonGlobalComplaint,
            "manual" or "manual_suppression" => ReasonGlobalManual,
            "invalid" or "invalid_address" => ReasonGlobalInvalid,
            _ => "suppressed"
        };
    }

    public static string LedgerReasonToCode(string? reason)
    {
        var r = (reason ?? "").Trim().ToUpperInvariant();
        return r switch
        {
            "UNSUBSCRIBED" => ReasonGlobalUnsub,
            "BOUNCED" => ReasonGlobalBounce,
            "COMPLAINT" => ReasonGlobalComplaint,
            "MANUAL_SUPPRESSION" => ReasonGlobalManual,
            "INVALID_ADDRESS" => ReasonGlobalInvalid,
            _ => string.IsNullOrWhiteSpace(r) ? ReasonGlobalUnsub : "GLOBAL_SUPPRESSION_" + r
        };
    }

    public static string ClassifyPreviewBucket(string? reason)
    {
        var code = OutreachPolicy.NormalizeSkipReason(reason);
        return code switch
        {
            "ALREADY_CONTACTED" => "alreadyContacted",
            "GLOBAL_SUPPRESSION_UNSUBSCRIBED" or "SUPPRESSED" => "unsubscribed",
            "GLOBAL_SUPPRESSION_BOUNCED" or "GLOBAL_SUPPRESSION_COMPLAINT"
                or "GLOBAL_SUPPRESSION_MANUAL_SUPPRESSION" => "unsubscribed",
            "COOLDOWN" => "cooldown",
            "INVALID_EMAIL" or "GLOBAL_SUPPRESSION_INVALID_ADDRESS" => "invalid",
            "DAILY_LIMIT_REACHED" => "dailyLimit",
            _ => "other"
        };
    }

    public static AcqSuppressionRecord? ParseLedger(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<AcqSuppressionRecord>(json, AcqJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public static string FormatLedger(AcqSuppressionRecord row) =>
        System.Text.Json.JsonSerializer.Serialize(row, AcqJson.Options);

    public static bool IsStoppedOutreachStatus(string? outreachStatus, string? suppressionStatus)
    {
        var o = (outreachStatus ?? "").ToLowerInvariant();
        if (o is "replied" or "interested" or "customer" or "unsubscribed" or "bounced" or "complained" or "suppressed")
            return true;
        return !string.Equals(suppressionStatus ?? "none", "none", StringComparison.OrdinalIgnoreCase);
    }
}

public sealed record AcqSuppressionRecord(
    string Email,
    string Reason,
    DateTimeOffset At,
    string? Source = null);

public sealed record AcqSendPreviewRequest(
    string? Campaign = null,
    IReadOnlyList<string>? ProspectIds = null,
    bool SelectAllEligible = false,
    bool DryRun = false,
    bool ApproveFirst = false);

public sealed record AcqSendPreviewResult(
    string Campaign,
    int Selected,
    int Eligible,
    int AlreadyContacted,
    int Unsubscribed,
    int Cooldown,
    int Invalid,
    int OtherBlocked,
    int DailyLimit,
    int SentToday,
    int RemainingCapacity,
    int WillSend,
    bool DryRun,
    string SendingMode,
    IReadOnlyDictionary<string, int> ReasonCounts,
    IReadOnlyList<AcqSendPreviewItem> Items);

public sealed record AcqSendPreviewItem(
    string ProspectId,
    bool Eligible,
    string? Reason,
    string? HumanReason);

public sealed record AcqBulkSendStartRequest(
    string? Campaign = null,
    IReadOnlyList<string>? ProspectIds = null,
    bool ApproveFirst = false,
    bool DryRun = false,
    bool SelectAllEligible = false);

public sealed record AcqBulkSendJobState(
    string JobId,
    string Campaign,
    string Trigger,
    string AdminEmail,
    bool DryRun,
    DateTimeOffset StartedAt,
    DateTimeOffset UpdatedAt,
    string Status,
    IReadOnlyList<string> ProspectIds,
    int Cursor,
    int Requested,
    int Eligible,
    int Sent,
    int Skipped,
    int Failed,
    int Remaining,
    IReadOnlyDictionary<string, int> ReasonCounts,
    IReadOnlyList<AcqBulkSendItem> Results,
    string? LastError = null);

public sealed record AcqBulkSendItem(
    string ProspectId,
    string Outcome,
    string? Reason,
    string? MessageId);

public sealed record AcqCampaignSettingsRequest(
    string? SendingMode = null,
    int? DailyLimit = null,
    bool? DryRun = null,
    int? MaxFollowUps = null,
    bool? AutoDiscover = null,
    bool? AutoFindEmails = null,
    bool? AutoPrepareDrafts = null,
    bool? AutoSend = null,
    bool? AutoFollowUps = null,
    bool? SendingEnabled = null,
    string? Name = null,
    string? Category = null,
    string? Language = null,
    string? Market = null,
    string? Tier = null);

public sealed record AcqProviderQuota(int Max24HourSend, int SentLast24Hours, int Remaining, bool Available);

public sealed record AcqCampaignCard(
    string CampaignId,
    string Name,
    string Category,
    string Language,
    string Market,
    string? Tier,
    int DailyLimit,
    int SentToday,
    int RemainingToday,
    int ReadyToSend,
    int NeedsApproval,
    int Replies,
    int Unsubscribes,
    bool SendingEnabled,
    string SendingMode,
    bool DryRun,
    bool AutoDiscover,
    bool AutoFindEmails,
    bool AutoPrepareDrafts,
    bool AutoSend,
    bool AutoFollowUps,
    int MaxFollowUps,
    string Status,
    string? StatusReason,
    string? NextRunEt,
    DateTimeOffset CreatedAt);
