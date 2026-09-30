namespace YouTubeBoosterAi.Api;

/// <summary>
/// Single authoritative lifecycle + primary blocker for acquisition prospects.
/// Overview, Creators, Approvals, Campaigns, Analytics, and weekday automation
/// must derive readiness from these helpers (via WhyNotSentCode / SendLaneFor).
/// </summary>
public static class AcqProspectLifecycle
{
    public const string Discovered = "DISCOVERED";
    public const string EmailDiscoveryRequired = "EMAIL_DISCOVERY_REQUIRED";
    public const string EmailDiscoveryBackoff = "EMAIL_DISCOVERY_BACKOFF";
    public const string Contactable = "CONTACTABLE";
    public const string Qualified = "QUALIFIED";
    public const string DraftRequired = "DRAFT_REQUIRED";
    public const string Ready = "READY";
    public const string InitialSent = "INITIAL_SENT";
    public const string FollowUpDue = "FOLLOW_UP_DUE";
    public const string FollowUpSent = "FOLLOW_UP_SENT";
    public const string Replied = "REPLIED";
    public const string Interested = "INTERESTED";
    public const string NotInterested = "NOT_INTERESTED";
    public const string Converted = "CONVERTED";
    public const string Suppressed = "SUPPRESSED";
    public const string Bounced = "BOUNCED";
    public const string Complaint = "COMPLAINT";
    public const string Unsubscribed = "UNSUBSCRIBED";
    public const string Exhausted = "EXHAUSTED";

    /// <summary>Map WhyNotSent / gate reason to a single primary inventory blocker code.</summary>
    public static string PrimaryBlocker(string? whyNotSentOrGateReason)
    {
        var code = OutreachPolicy.NormalizeSkipReason(whyNotSentOrGateReason);
        return code switch
        {
            "READY_TO_SEND" => "NONE",
            "DISCOVERY_PENDING" => "EMAIL_DISCOVERY_DUE",
            "DISCOVERY_BACKOFF" => "EMAIL_DISCOVERY_BACKOFF",
            "NO_PUBLIC_EMAIL_FOUND" => "EMAIL_NOT_FOUND",
            "INVALID_EMAIL" => "INVALID_EMAIL",
            "COOLDOWN" => "COOLDOWN",
            "ALREADY_CONTACTED" => "ALREADY_SENT",
            "DUPLICATE_EMAIL" or "DUPLICATE_CHANNEL" => "ALREADY_SENT",
            "SUPPRESSED" or "GLOBAL_SUPPRESSION_UNSUBSCRIBED" => "UNSUBSCRIBED",
            "GLOBAL_SUPPRESSION_BOUNCED" => "BOUNCED",
            "GLOBAL_SUPPRESSION_COMPLAINT" => "COMPLAINT",
            "GLOBAL_SUPPRESSION_MANUAL_SUPPRESSION" or "GLOBAL_SUPPRESSION_INVALID_ADDRESS" => "SUPPRESSED",
            "INSUFFICIENT_PERSONALIZATION" or "UNSUPPORTED_CLAIM" => "DRAFT_MISSING",
            "MANUAL_APPROVAL_REQUIRED" or "NOT_APPROVED" => "OTHER",
            "DAILY_LIMIT_REACHED" => "DAILY_LIMIT",
            "SES_QUOTA_REACHED" => "SES_LIMIT",
            "CAMPAIGN_DISABLED" or "SAFETY_PAUSED" or "DRY_RUN" or "MISSING_CONFIG" => "CAMPAIGN_DISABLED",
            "STRATEGIC_MANUAL" => "OTHER",
            "NOT_QUALIFIED" => MapNotQualifiedDetail(whyNotSentOrGateReason),
            _ => string.IsNullOrWhiteSpace(code) ? "OTHER" : code
        };
    }

    private static string MapNotQualifiedDetail(string? raw)
    {
        var r = (raw ?? "").Trim().ToLowerInvariant();
        if (r.Contains("stale")) return "NOT_QUALIFIED";
        if (r.Contains("subscriber")) return "NOT_QUALIFIED";
        if (r.Contains("score")) return "NOT_QUALIFIED";
        if (r.Contains("draft")) return "DRAFT_MISSING";
        if (r.Contains("legacy")) return "DRAFT_MISSING";
        return "NOT_QUALIFIED";
    }

    public static string DeriveState(
        AcqProspectRecord p,
        DateTimeOffset now,
        AcqCampaignState state,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        var outreach = (p.OutreachStatus ?? "").ToLowerInvariant();
        var suppression = (p.SuppressionStatus ?? "none").ToLowerInvariant();

        if (suppression is "unsubscribed" || outreach is "unsubscribed")
            return Unsubscribed;
        if (suppression is "bounced" || outreach is "bounced")
            return Bounced;
        if (suppression is "complained" || outreach is "complained")
            return Complaint;
        if (suppression is not "none" || outreach is "suppressed" or "rejected")
            return Suppressed;
        if (outreach is "customer")
            return Converted;
        if (outreach is "interested")
            return Interested;
        if (outreach is "replied")
            return Replied;
        if (outreach is "not_interested")
            return NotInterested;

        if (p.FollowUpStep >= 2 && p.LastContactedAt is not null)
            return Exhausted;

        if (CreatorAcquisitionScoring.IsFollowUpDue(p, now))
            return FollowUpDue;

        if (p.LastContactedAt is not null)
            return p.FollowUpStep > 0 ? FollowUpSent : InitialSent;

        var why = CreatorAcquisitionService.WhyNotSentCode(p, now, state, all);
        if (why == "READY_TO_SEND")
            return Ready;

        if (!CreatorAcquisitionScoring.IsVerifiedPublicEmail(p))
        {
            if (p.ContactResearchNextAt is not null && p.ContactResearchNextAt > now)
                return EmailDiscoveryBackoff;
            return EmailDiscoveryRequired;
        }

        if (p.PriorityScore >= 70
            && string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(p.Subject) || string.IsNullOrWhiteSpace(p.Body)
                || p.AuditGeneratedAt is null
                || !CreatorAcquisitionScoring.HasStrongPersonalization(p))
                return DraftRequired;
            return Qualified;
        }

        if (CreatorAcquisitionScoring.IsVerifiedPublicEmail(p))
            return Contactable;
        return Discovered;
    }

    public static Dictionary<string, int> TallyBlockers(
        IEnumerable<AcqProspectRecord> prospects,
        DateTimeOffset now,
        AcqCampaignState state,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var p in prospects)
        {
            var why = CreatorAcquisitionService.WhyNotSentCode(p, now, state, all);
            var blocker = PrimaryBlocker(why);
            if (blocker == "NONE") continue;
            // Follow-ups due: distinguish FOLLOW_UP_NOT_DUE vs send gates
            if (CreatorAcquisitionScoring.IsFollowUpDue(p, now) && blocker != "NONE")
            {
                // keep gate blocker
            }
            counts[blocker] = counts.GetValueOrDefault(blocker) + 1;
        }
        return counts;
    }

    /// <summary>
    /// Exclusive lifecycle bucket for prospects that have a generated draft (observation+subject).
    /// "Drafts generated" must reconcile to these states — never treat drafts as sendable inventory.
    /// </summary>
    public static string ClassifyDraftLifecycle(
        AcqProspectRecord p,
        DateTimeOffset now,
        AcqCampaignState state,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        var hasDraft = !string.IsNullOrWhiteSpace(p.Observation) && !string.IsNullOrWhiteSpace(p.Subject);
        if (!hasDraft) return "NO_DRAFT";

        var outreach = (p.OutreachStatus ?? "").ToLowerInvariant();
        var suppression = (p.SuppressionStatus ?? "none").ToLowerInvariant();

        if (suppression is "unsubscribed" || outreach is "unsubscribed")
            return "UNSUBSCRIBED";
        if (suppression is "bounced" || outreach is "bounced")
            return "BOUNCED";
        if (suppression is "complained" || outreach is "complained")
            return "COMPLAINT";
        if (suppression is not "none" || outreach is "suppressed")
            return "SUPPRESSED";
        if (outreach is "customer")
            return "CONVERTED";
        if (outreach is "replied" or "interested")
            return "REPLIED";
        if (outreach is "rejected" or "not_interested")
            return "DISQUALIFIED";

        if (p.LastContactedAt is not null)
        {
            if (CreatorAcquisitionScoring.IsFollowUpDue(p, now))
                return "FOLLOWUP_PENDING";
            var cooldownDays = state.CooldownDays > 0 ? state.CooldownDays : OutreachPolicy.DefaultCooldownDays;
            if (OutreachPolicy.InCooldown(p.LastContactedAt, now, cooldownDays))
                return "COOLDOWN";
            return "SENT";
        }

        if (string.IsNullOrWhiteSpace(p.PublicBusinessEmail)
            || !EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail)
            || !CreatorAcquisitionScoring.IsVerifiedPublicEmail(p))
            return "NO_VALID_EMAIL";
        if (OutreachPolicy.IsSpamTrapOrInvalid(p.PublicBusinessEmail))
            return "INVALID_EMAIL";

        var why = CreatorAcquisitionService.WhyNotSentCode(p, now, state, all);
        if (why == "READY_TO_SEND")
            return "READY";
        if (CreatorAcquisitionScoring.IsReadyForApproval(p)
            || string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
            return "WAITING";

        if (why is "NOT_QUALIFIED" or "INSUFFICIENT_PERSONALIZATION" or "UNSUPPORTED_CLAIM"
            || p.PriorityScore < 70
            || (p.SubscriberCount is < 1000 or > 100_000))
            return "DISQUALIFIED";

        if (p.AuditGeneratedAt is null
            || string.IsNullOrWhiteSpace(p.Body)
            || !CreatorAcquisitionScoring.HasStrongPersonalization(p))
            return "STALE";

        if (why is "DISCOVERY_PENDING" or "DISCOVERY_BACKOFF" or "NO_PUBLIC_EMAIL_FOUND")
            return "NO_VALID_EMAIL";

        return "OTHER";
    }

    public static Dictionary<string, int> TallyDraftLifecycle(
        IEnumerable<AcqProspectRecord> prospects,
        DateTimeOffset now,
        AcqCampaignState state,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var p in prospects)
        {
            var bucket = ClassifyDraftLifecycle(p, now, state, all);
            if (bucket == "NO_DRAFT") continue;
            counts[bucket] = counts.GetValueOrDefault(bucket) + 1;
        }
        return counts;
    }
}
