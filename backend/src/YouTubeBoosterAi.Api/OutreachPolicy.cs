using System.Globalization;

namespace YouTubeBoosterAi.Api;

public static class OutreachPolicy
{
    public const int DefaultDailyLimit = 10;
    public const int DefaultMaxLimit = 30;
    public const int DefaultCooldownDays = 30;
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
        var safeProspect = (prospectId ?? "").Replace("@", "");
        if (safeProspect.Length > 40) safeProspect = safeProspect[..40];
        var token = string.IsNullOrWhiteSpace(opaqueToken) ? "x" : opaqueToken;
        return $"{root}/api/public/acq/go/{Uri.EscapeDataString(token)}"
            + $"?utm_source=founder_outreach&utm_medium=email&utm_campaign=cook_001"
            + $"&utm_content={Uri.EscapeDataString(variant)}"
            + $"&utm_term={Uri.EscapeDataString(safeProspect)}"
            + $"&utm_id={Uri.EscapeDataString(runYmd)}"
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
