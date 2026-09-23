using System.Globalization;

namespace YouTubeBoosterAi.Api;

public static class OutreachPolicy
{
    public const int DefaultDailyLimit = 10;
    public const int DefaultMaxLimit = 30;
    /// <summary>Hard ceiling for campaign-configured daily volume. Ramp for COOK-001 still uses DefaultMaxLimit unless a campaign override is saved.</summary>
    public const int ConfiguredMaxDailyLimit = 500;
    public const int DefaultMaxFollowUps = 2;
    public const int DefaultCooldownDays = 14;
    public const int MinSendsForRate = 30;
    public const int SendingDaysBeforeRamp = 3;
    public const int EvalMinSends = 100;
    public const int EvalMinDays = 14;
    public const double BounceStop = 0.03;
    public const double ComplaintStop = 0.001;
    public const double UnsubscribeStop = 0.02;

    public static readonly int[] Stages = [10, 20, 30];

    public static int ClampDailyLimit(int requested, int maxLimit = DefaultMaxLimit)
    {
        var max = Math.Clamp(maxLimit, Stages[0], DefaultMaxLimit);
        return Math.Clamp(requested, 1, max);
    }

    /// <summary>Campaign daily limit: 1–500. Does not auto-ramp.</summary>
    public static int ClampConfiguredDailyLimit(int requested, int maxLimit = ConfiguredMaxDailyLimit)
    {
        var max = Math.Clamp(maxLimit, 1, ConfiguredMaxDailyLimit);
        return Math.Clamp(requested, 1, max);
    }

    public static int ParseInt(string? raw, int fallback)
    {
        if (int.TryParse((raw ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
            return n;
        return fallback;
    }

    public static bool ParseBool(string? raw, bool fallback)
    {
        if (string.IsNullOrWhiteSpace(raw)) return fallback;
        return raw.Trim() is "1" or "true" or "TRUE" or "yes" or "on";
    }

    public static int ResolveDailyLimit(string? envDaily, string? cfgDaily, string? ssmDaily, int maxLimit)
    {
        var raw = FirstNonEmpty(envDaily, cfgDaily, ssmDaily);
        return ClampDailyLimit(ParseInt(raw, DefaultDailyLimit), maxLimit);
    }

    public static int ResolveMaxLimit(string? envMax, string? cfgMax, string? ssmMax) =>
        Math.Clamp(ParseInt(FirstNonEmpty(envMax, cfgMax, ssmMax), DefaultMaxLimit), Stages[0], DefaultMaxLimit);

    public static AcqDeliveryHealth HealthFromCounts(int sent, int bounced, int complaints, int unsubscribes)
    {
        var enough = sent >= MinSendsForRate;
        double? Rate(int n) => enough && sent > 0 ? n / (double)sent : null;
        var bounce = Rate(bounced);
        var complaint = Rate(complaints);
        var unsub = Rate(unsubscribes);
        var unhealthy =
            (bounce is >= BounceStop)
            || (complaint is >= ComplaintStop)
            || (unsub is >= UnsubscribeStop);
        var reason = !enough
            ? "sample_too_small"
            : bounce >= BounceStop ? "bounce_rate"
            : complaint >= ComplaintStop ? "complaint_rate"
            : unsub >= UnsubscribeStop ? "unsubscribe_rate"
            : "ok";
        return new AcqDeliveryHealth(sent, bounced, complaints, unsubscribes, bounce, complaint, unsub, enough, unhealthy, reason);
    }

    public static AcqRampDecision DecideRamp(
        int currentStage,
        int sendingDaysAtStage,
        AcqDeliveryHealth health,
        bool rampEnabled,
        int maxLimit)
    {
        var stage = Stages.Contains(currentStage) ? currentStage : Stages[0];
        if (!rampEnabled)
            return new AcqRampDecision(stage, stage, false, "ramp_disabled");
        if (stage >= Math.Min(Stages[^1], maxLimit))
            return new AcqRampDecision(stage, stage, false, "at_max_stage");
        if (!health.EnoughSample)
            return new AcqRampDecision(stage, stage, false, "sample_too_small");
        if (health.Unhealthy)
            return new AcqRampDecision(stage, stage, false, health.Reason);
        if (sendingDaysAtStage < SendingDaysBeforeRamp)
            return new AcqRampDecision(stage, stage, false, "need_3_sending_days");
        var next = Stages.First(s => s > stage);
        next = Math.Min(next, maxLimit);
        return new AcqRampDecision(stage, next, next > stage, "healthy_ramp");
    }

    public static bool InCooldown(DateTimeOffset? lastContacted, DateTimeOffset nowUtc, int cooldownDays)
    {
        if (lastContacted is null) return false;
        var days = cooldownDays <= 0 ? 36500 : cooldownDays;
        return (nowUtc - lastContacted.Value).TotalDays < days;
    }

    /// <summary>
    /// Maps internal gate/SES reason strings to stable report codes.
    /// </summary>
    public static string NormalizeSkipReason(string? raw)
    {
        var r = (raw ?? "").Trim().ToLowerInvariant();
        if (r.StartsWith("ses:", StringComparison.Ordinal))
            return r.Contains("reject", StringComparison.Ordinal) ? "SES_REJECTED" : "SES_ERROR";
        return r switch
        {
            "cooldown" => "COOLDOWN",
            "already_contacted" => "ALREADY_CONTACTED",
            "already_processing" => "ALREADY_CONTACTED",
            "already_sent_follow_up" => "ALREADY_CONTACTED",
            "duplicate_email" => "ALREADY_CONTACTED",
            "idempotency" => "ALREADY_CONTACTED",
            "replied" => "REPLIED",
            "converted" => "CONVERTED",
            "global_suppression_unsubscribed" => "GLOBAL_SUPPRESSION_UNSUBSCRIBED",
            "global_suppression_bounced" => "GLOBAL_SUPPRESSION_BOUNCED",
            "global_suppression_complaint" => "GLOBAL_SUPPRESSION_COMPLAINT",
            "global_suppression_manual_suppression" => "GLOBAL_SUPPRESSION_MANUAL_SUPPRESSION",
            "global_suppression_invalid_address" => "GLOBAL_SUPPRESSION_INVALID_ADDRESS",
            "public_email_unverified" => "INVALID_EMAIL",
            "invalid_or_spamtrap" => "INVALID_EMAIL",
            "suppressed" => "SUPPRESSED",
            "unsubscribed" => "SUPPRESSED",
            "hard_bounce" => "SUPPRESSED",
            "existing_customer" => "SUPPRESSED",
            "not_approved" => "NOT_APPROVED",
            "approval_expired" => "NOT_APPROVED",
            "approval_cap" => "NOT_APPROVED",
            "approval_invalidated" => "NOT_APPROVED",
            "daily_limit_reached" => "DAILY_LIMIT_REACHED",
            "strategic_manual_only" => "STRATEGIC_MANUAL",
            "china_not_a_priority" => "NOT_QUALIFIED",
            "marketing_sending_disabled" => "MISSING_CONFIG",
            "postal_address_missing" => "MISSING_CONFIG",
            "from_email_unconfigured" => "MISSING_CONFIG",
            "unsubscribe_signing_missing" => "MISSING_CONFIG",
            "weekend_eastern" => "MISSING_CONFIG",
            "score_below_70" => "NOT_QUALIFIED",
            "stale_upload" => "NOT_QUALIFIED",
            "subscriber_out_of_band" => "NOT_QUALIFIED",
            "inspection_incomplete" => "NOT_QUALIFIED",
            "preview_placeholder" => "NOT_QUALIFIED",
            "draft_incomplete" => "NOT_QUALIFIED",
            "content_hash_changed" => "NOT_QUALIFIED",
            "pii_in_tags" => "NOT_QUALIFIED",
            "complaint_pause" => "SUPPRESSED",
            _ when r.StartsWith("health_stop", StringComparison.Ordinal) => "SUPPRESSED",
            _ when r.StartsWith("global_suppression", StringComparison.Ordinal) => r.ToUpperInvariant(),
            _ when string.IsNullOrEmpty(r) => "NOT_QUALIFIED",
            _ => "NOT_QUALIFIED"
        };
    }

    public static Dictionary<string, int> AggregateSkipReasons(IEnumerable<string> reasons)
    {
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var line in reasons)
        {
            var raw = line ?? "";
            var colon = raw.LastIndexOf(':');
            var codePart = colon >= 0 ? raw[(colon + 1)..] : raw;
            // prospectId:ses:message → keep ses:message
            if (colon >= 0 && raw.Contains(":ses:", StringComparison.OrdinalIgnoreCase))
            {
                var sesIdx = raw.IndexOf(":ses:", StringComparison.OrdinalIgnoreCase);
                codePart = raw[(sesIdx + 1)..];
            }
            var code = NormalizeSkipReason(codePart);
            counts[code] = counts.GetValueOrDefault(code) + 1;
        }
        return counts;
    }

    public static bool IsSpamTrapOrInvalid(string? email)
    {
        if (!EmailAddressHelpers.LooksLikeEmail(email)) return true;
        var e = email!.Trim().ToLowerInvariant();
        var at = e.IndexOf('@');
        var local = at > 0 ? e[..at] : e;
        var host = at > 0 ? e[(at + 1)..] : "";
        if (local is "noreply" or "no-reply" or "donotreply" or "do-not-reply" or "mailer-daemon"
            or "abuse" or "postmaster" or "spam")
            return true;
        if (host.Contains("mailinator") || host.Contains("guerrillamail") || host.Contains("tempmail")
            || host is "example.com" or "example.org" or "test")
            return true;
        return false;
    }

    public static string AssignVariant(string prospectId)
    {
        var hex = AcqIds.Sha256Hex(prospectId ?? "");
        var n = Convert.ToInt32(hex[..2], 16);
        return n < 128 ? "A" : "B";
    }

    public static string PersistVariant(string? existing, string prospectId) =>
        existing is "A" or "B" ? existing : AssignVariant(prospectId);

    public static string BuildTrackedUrl(
        string site,
        string opaqueToken,
        string prospectId,
        string variant,
        string runYmd,
        string segment = "cooking")
    {
        var root = (site ?? "https://youtubeboosterai.com").TrimEnd('/');
        var token = string.IsNullOrWhiteSpace(opaqueToken) ? "x" : opaqueToken;
        return $"{root}/api/public/acq/go/{Uri.EscapeDataString(token)}"
            + $"?utm_source=outreach&utm_medium=email&utm_campaign=COOK-001"
            + $"&utm_content={Uri.EscapeDataString(variant)}"
            + $"&utm_id={Uri.EscapeDataString(runYmd)}"
            + $"&yb_oid={Uri.EscapeDataString(token)}"
            + $"&exp=004&seg={Uri.EscapeDataString(segment)}";
    }

    public static string? ConversionRate(int numerator, int denominator)
    {
        if (denominator <= 0) return null;
        return (100.0 * numerator / denominator).ToString("0.0", CultureInfo.InvariantCulture) + "%";
    }

    public static string RateOrNa(int numerator, int denominator) =>
        ConversionRate(numerator, denominator) ?? "N/A";

    public static string RevenuePer100(double revenueUsd, int sent)
    {
        if (sent <= 0) return "N/A";
        return "$" + (revenueUsd * 100.0 / sent).ToString("0.00", CultureInfo.InvariantCulture);
    }

    public static string EvaluateOutreach(
        int qualifiedSends,
        int calendarDays,
        AcqDeliveryHealth health,
        int clicks,
        int auditStarts,
        int checkouts,
        int verifiedCustomers)
    {
        if (health.Unhealthy && health.EnoughSample) return "STOP";
        if (qualifiedSends < EvalMinSends && calendarDays < EvalMinDays) return "COLLECTING";
        if (verifiedCustomers > 0 || checkouts > 0) return "KEEP";
        if (clicks == 0 && auditStarts == 0 && qualifiedSends >= EvalMinSends) return "ITERATE";
        if (qualifiedSends >= EvalMinSends || calendarDays >= EvalMinDays) return "INCONCLUSIVE";
        return "COLLECTING";
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}

public sealed record AcqDeliveryHealth(
    int Sent,
    int Bounced,
    int Complaints,
    int Unsubscribes,
    double? BounceRate,
    double? ComplaintRate,
    double? UnsubscribeRate,
    bool EnoughSample,
    bool Unhealthy,
    string Reason);

public sealed record AcqRampDecision(int CurrentStage, int NextStage, bool Advance, string Reason);

public sealed record AcqRampPersist(
    int Stage,
    int SendingDaysAtStage,
    string? LastSendYmdEt,
    string? BlockReason);
