using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

public sealed record AcqScoreInput(
    long SubscriberCount,
    DateTimeOffset? RecentUploadAt,
    DateTimeOffset NowUtc,
    int WeakDescriptionCount,
    int TitleIssueCount,
    int SampleSize,
    bool PublicBusinessEmailVerified,
    bool IndependentCreator,
    string Language,
    bool OneTimeAuditFit,
    bool PreviewPlaceholder,
    bool CelebrityOrNetwork,
    bool ChildrenFocused,
    bool Inactive
);

public sealed record AcqScoreBreakdown(
    int TargetRange,
    int RecentActivity,
    int PackagingOpportunity,
    int PublicEmail,
    int Independent,
    int EnglishSuitability,
    int OfferFit,
    int Total
);

public static class CreatorAcquisitionScoring
{
    public static AcqScoreBreakdown Score(AcqScoreInput input)
    {
        if (input.PreviewPlaceholder || input.CelebrityOrNetwork || input.ChildrenFocused || input.Inactive)
        {
            return new AcqScoreBreakdown(0, 0, 0, 0, 0, 0, 0, 0);
        }

        // Sweet spot: 5k–50k strongest need; still score 1k–100k band.
        var range = input.SubscriberCount switch
        {
            >= 5000 and <= 50000 => 18,
            >= 1000 and < 5000 => 14,
            > 50000 and <= 100000 => 12,
            > 100000 and <= 120000 => 5,
            _ => 0
        };

        var ageDays = input.RecentUploadAt is null
            ? 999
            : (input.NowUtc - input.RecentUploadAt.Value).TotalDays;
        var activity = ageDays <= 7 ? 18
            : ageDays <= 14 ? 15
            : ageDays <= 30 ? 12
            : ageDays <= 60 ? 8
            : 0;

        var sample = Math.Max(1, input.SampleSize);
        var packRatio = Math.Clamp(
            (input.WeakDescriptionCount + input.TitleIssueCount) / (double)(sample * 2),
            0,
            1);
        // Continuous packaging points (0–25) so creators differentiate instead of clustering at 85.
        var packaging = (int)Math.Round(packRatio * 25);

        var email = input.PublicBusinessEmailVerified ? 15 : 0;
        var independent = input.IndependentCreator ? 10 : 0;
        var english = input.Language.StartsWith("en", StringComparison.OrdinalIgnoreCase) ? 10
            : input.Language is "ru" or "uk" ? 4
            : 2;
        var offer = input.OneTimeAuditFit ? 10 : 0;
        var total = Math.Clamp(range + activity + packaging + email + independent + english + offer, 0, 100);
        return new AcqScoreBreakdown(range, activity, packaging, email, independent, english, offer, total);
    }

    public static string ScoreBreakdownJson(AcqScoreBreakdown b) =>
        $"{{\"targetRange\":{b.TargetRange},\"recentActivity\":{b.RecentActivity},\"packagingOpportunity\":{b.PackagingOpportunity},\"publicEmail\":{b.PublicEmail},\"independent\":{b.Independent},\"englishSuitability\":{b.EnglishSuitability},\"offerFit\":{b.OfferFit},\"total\":{b.Total}}}";

    public static bool IsSendEligible(AcqProspectRecord p, DateTimeOffset nowUtc, AcqCampaignState state)
    {
        return ExplainSendEligibility(p, nowUtc, state, alreadyContacted: p.LastContactedAt is not null).Ok;
    }

    public static AcqSendGateResult ExplainSendEligibility(
        AcqProspectRecord p,
        DateTimeOffset nowUtc,
        AcqCampaignState state,
        bool alreadyContacted,
        AcqSendMode mode = AcqSendMode.Automated)
    {
        var manual = mode == AcqSendMode.ManualAdmin;

        // Account / SES configuration (both modes)
        if (!state.MarketingSendingEnabled)
            return new AcqSendGateResult(false, "marketing_sending_disabled");
        if (state.ComplaintPause)
            return new AcqSendGateResult(false, "complaint_pause");
        if (string.IsNullOrWhiteSpace(state.PostalAddress))
            return new AcqSendGateResult(false, "postal_address_missing");
        if (string.IsNullOrWhiteSpace(state.FromEmail) || !EmailAddressHelpers.LooksLikeEmail(state.FromEmail))
            return new AcqSendGateResult(false, "from_email_unconfigured");

        // Hard blocks (both modes)
        if (p.PreviewPlaceholder)
            return new AcqSendGateResult(false, "preview_placeholder");
        if (!IsVerifiedPublicEmail(p))
            return new AcqSendGateResult(false, "public_email_unverified");
        if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
            return new AcqSendGateResult(false, "suppressed");
        if (OutreachPolicy.IsSpamTrapOrInvalid(p.PublicBusinessEmail))
            return new AcqSendGateResult(false, "invalid_or_spamtrap");

        var followUpDue = IsFollowUpDue(p, nowUtc);
        var cooldownDays = state.CooldownDays > 0 ? state.CooldownDays : OutreachPolicy.DefaultCooldownDays;

        // Automation-only: cooldown / already-contacted pacing
        if (!manual)
        {
            if (alreadyContacted && p.LastContactedAt is null)
                return new AcqSendGateResult(false, "already_contacted");
            if (!followUpDue
                && !HasActiveCooldownOverride(p, nowUtc)
                && OutreachPolicy.InCooldown(p.LastContactedAt, nowUtc, cooldownDays))
                return new AcqSendGateResult(false, "cooldown");
        }

        // Qualification / draft quality (both modes)
        if (p.PriorityScore < 70)
            return new AcqSendGateResult(false, "score_below_70");
        if (!string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase))
            return new AcqSendGateResult(false, "inspection_incomplete");
        if (p.RecentUploadAt is null || (nowUtc - p.RecentUploadAt.Value).TotalDays > 60)
            return new AcqSendGateResult(false, "stale_upload");
        var standing = state.StandingCampaignApproval;
        // Initial send always requires recipient approval. Follow-ups reuse that approval.
        if (!standing && !followUpDue && (string.IsNullOrWhiteSpace(p.ApprovalId) || string.IsNullOrWhiteSpace(p.ContentHash)))
            return new AcqSendGateResult(false, "not_approved");
        if (string.IsNullOrWhiteSpace(p.Observation))
            return new AcqSendGateResult(false, "draft_incomplete");
        if (!HasStrongPersonalization(p))
            return new AcqSendGateResult(false, "weak_personalization");
        if (CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body))
            return new AcqSendGateResult(false, "legacy_personal_template");
        if (!followUpDue && (string.IsNullOrWhiteSpace(p.Subject) || string.IsNullOrWhiteSpace(p.Body)))
            return new AcqSendGateResult(false, "draft_incomplete");
        if (!followUpDue && !string.IsNullOrWhiteSpace(p.ContentHash)
            && !string.Equals(ContentHash(p), p.ContentHash, StringComparison.Ordinal))
            return new AcqSendGateResult(false, "content_hash_changed");
        if (p.SubscriberCount < 1000 || p.SubscriberCount > 100000)
            return new AcqSendGateResult(false, "subscriber_out_of_band");
        return new AcqSendGateResult(true, followUpDue ? "ok_follow_up" : "ok");
    }

    public static bool IsFollowUpDue(AcqProspectRecord p, DateTimeOffset nowUtc)
    {
        if (p.LastContactedAt is null) return false;
        if (p.FollowUpStep is < 0 or >= 2) return false;
        if (p.NextFollowUpAt is null || p.NextFollowUpAt > nowUtc) return false;
        var status = (p.OutreachStatus ?? "").ToLowerInvariant();
        if (status is "replied" or "interested" or "customer" or "unsubscribed"
            or "bounced" or "complained" or "rejected" or "suppressed")
            return false;
        if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
            return false;
        return true;
    }

    public static bool IsVerifiedPublicEmail(AcqProspectRecord p) =>
        EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail)
        && !string.IsNullOrWhiteSpace(p.ContactSourceUrl)
        && p.ContactVerifiedAt is not null
        && (
            p.ContactType is "business" or "partnership" or "media" or "general"
            || (p.AdminAttestedContact && string.Equals(p.ContactType, "admin_attested", StringComparison.OrdinalIgnoreCase))
        )
        && !string.Equals(p.ContactType, "guessed", StringComparison.OrdinalIgnoreCase)
        && !string.Equals(p.ContactType, "form_only", StringComparison.OrdinalIgnoreCase);

    public static bool HasActiveCooldownOverride(AcqProspectRecord p, DateTimeOffset nowUtc) =>
        p.CooldownOverrideUntil is not null && p.CooldownOverrideUntil > nowUtc;

    public static string ContentHash(AcqProspectRecord p)
    {
        var raw = string.Join('\n',
            p.ProspectId,
            p.PublicBusinessEmail?.Trim().ToLowerInvariant() ?? "",
            p.Subject ?? "",
            p.Observation ?? "",
            p.SuggestedImprovement ?? "",
            p.TrackedPath ?? "");
        return AcqIds.Sha256Hex(raw);
    }

    public const string GenericObservationFallback =
        "Recent public uploads use inconsistent title structure, which makes the channel harder to scan in search and suggested videos.";

    public static bool TryParseObservationEvidence(
        string? observation,
        out int issueCount,
        out int sampleSize,
        out string? exampleTitle,
        out bool isDescriptionFinding)
    {
        issueCount = 0;
        sampleSize = 0;
        exampleTitle = null;
        isDescriptionFinding = false;
        if (string.IsNullOrWhiteSpace(observation)) return false;

        var countMatch = Regex.Match(
            observation,
            @"(\d+)\s+of\s+(?:your\s+)?(?:the\s+)?last\s+(\d+)",
            RegexOptions.IgnoreCase);
        if (!countMatch.Success) return false;
        issueCount = int.Parse(countMatch.Groups[1].Value, CultureInfo.InvariantCulture);
        sampleSize = int.Parse(countMatch.Groups[2].Value, CultureInfo.InvariantCulture);
        isDescriptionFinding = observation.Contains("description", StringComparison.OrdinalIgnoreCase);

        var ex = Regex.Match(
            observation,
            @"(?:Example title in the sample:\s*[“""]|For example, on\s*[“""]|on\s*[“""])([^”""]+)[”""]",
            RegexOptions.IgnoreCase);
        if (ex.Success) exampleTitle = TrimTitle(ex.Groups[1].Value);
        return sampleSize > 0 && issueCount > 0;
    }

    public static string BuildObservation(int titleIssues, int weakDescriptions, int sampleSize, string? exampleTitle)
    {
        var n = Math.Max(1, sampleSize);
        if (weakDescriptions >= Math.Max(3, n / 2))
        {
            return $"{weakDescriptions} of your last {n} public videos have very short descriptions for search.";
        }
        if (titleIssues >= Math.Max(3, n / 4))
        {
            return string.IsNullOrWhiteSpace(exampleTitle)
                ? $"{titleIssues} of your last {n} public titles bury the dish or benefit later than they should."
                : $"{titleIssues} of your last {n} public titles bury the dish or benefit later than they should.";
        }
        return GenericObservationFallback;
    }

    public static string BuildImprovement(int titleIssues, int weakDescriptions, string? exampleTitle = null)
    {
        var example = TrimTitle(exampleTitle);
        if (weakDescriptions >= titleIssues)
        {
            if (!string.IsNullOrWhiteSpace(example))
            {
                return $"For example, on \"{example},\" we'd test putting the dish and main benefit earlier in the title and adding a short search-focused description.";
            }
            return "On the next recipe, we'd test a short search-focused description: dish + main ingredients + who it is for.";
        }
        if (!string.IsNullOrWhiteSpace(example))
        {
            return $"For example, on \"{example},\" we'd test putting the dish and the payoff in the first words of the title.";
        }
        return "On the next upload, we'd test putting the dish and the payoff in the first words of the title.";
    }

    public static string ResolveFindingType(int titleIssues, int weakDescriptions, int sampleSize, string? exampleTitle)
    {
        var n = Math.Max(1, sampleSize);
        if (weakDescriptions >= Math.Max(3, n / 2))
            return string.IsNullOrWhiteSpace(exampleTitle) ? "DESCRIPTION_OPPORTUNITY" : "DESCRIPTION_DEPTH";
        if (titleIssues >= Math.Max(3, n / 4))
            return string.IsNullOrWhiteSpace(exampleTitle) ? "TITLE_CLARITY" : "TITLE_OPPORTUNITY";
        return "CONTENT_POSITIONING";
    }

    public static bool HasStrongPersonalization(AcqProspectRecord p)
    {
        if (string.IsNullOrWhiteSpace(p.Observation)) return false;
        if (string.Equals(p.Observation.Trim(), GenericObservationFallback, StringComparison.Ordinal))
            return false;
        if (CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body))
            return false;

        var obs = p.Observation;
        var hasCount = System.Text.RegularExpressions.Regex.IsMatch(obs, @"\d+\s+of\s+(your\s+)?(the\s+)?last\s+\d+", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!hasCount) return false;

        var finding = (p.FindingType ?? "").ToUpperInvariant();
        if (finding is "DESCRIPTION_DEPTH" or "TITLE_OPPORTUNITY" or "DESCRIPTION_OPPORTUNITY" or "TITLE_CLARITY"
            or "SEARCH_DISCOVERABILITY" or "KEYWORD_OPPORTUNITY" or "VIDEO_METADATA" or "UPLOAD_CONSISTENCY")
        {
            if (finding is "DESCRIPTION_DEPTH" or "TITLE_OPPORTUNITY")
                return !string.IsNullOrWhiteSpace(p.ExampleVideoTitle)
                       || (!string.IsNullOrWhiteSpace(p.SuggestedImprovement)
                           && p.SuggestedImprovement.Contains("For example", StringComparison.OrdinalIgnoreCase));
            return true;
        }

        // Infer from observation when FindingType not yet stored.
        if (obs.Contains("description", StringComparison.OrdinalIgnoreCase)
            || obs.Contains("title", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrWhiteSpace(p.ExampleVideoTitle)) return true;
            if (!string.IsNullOrWhiteSpace(p.SuggestedImprovement)
                && p.SuggestedImprovement.Contains("For example", StringComparison.OrdinalIgnoreCase))
                return true;
            // Counted evidence without example is still stronger than the generic fallback.
            return p.SampleSize >= 5 && (p.WeakDescriptionCount >= 3 || p.TitleIssueCount >= 3);
        }
        return !string.IsNullOrWhiteSpace(p.SuggestedImprovement);
    }

    public static string FindingSourceSummary(AcqProspectRecord p)
    {
        var bits = new List<string>();
        if (p.SampleSize > 0) bits.Add($"sampleSize={p.SampleSize}");
        if (p.WeakDescriptionCount > 0) bits.Add($"weakDescriptions={p.WeakDescriptionCount}");
        if (p.TitleIssueCount > 0) bits.Add($"titleIssues={p.TitleIssueCount}");
        if (!string.IsNullOrWhiteSpace(p.ExampleVideoTitle)) bits.Add($"exampleVideo=\"{TrimTitle(p.ExampleVideoTitle)}\"");
        if (!string.IsNullOrWhiteSpace(p.FindingType)) bits.Add($"findingType={p.FindingType}");
        if (!string.IsNullOrWhiteSpace(p.EvidenceAt?.ToString("u"))) bits.Add($"evidenceAt={p.EvidenceAt:u}");
        return bits.Count == 0 ? "No structured evidence fields stored." : string.Join("; ", bits);
    }

    public static (int titles, int descriptions, double cadence) ParseDemoFindings(IReadOnlyList<string> findings)
    {
        var titles = 0;
        var descriptions = 0;
        var cadence = 0d;
        foreach (var f in findings ?? [])
        {
            var titleMatch = Regex.Match(f, @"(\d+)\s+of the last\s+(\d+)\s+videos have titles", RegexOptions.IgnoreCase);
            if (titleMatch.Success) titles = int.Parse(titleMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            var descMatch = Regex.Match(f, @"(\d+)\s+recent videos have weak descriptions", RegexOptions.IgnoreCase);
            if (descMatch.Success) descriptions = int.Parse(descMatch.Groups[1].Value, CultureInfo.InvariantCulture);
            var cadMatch = Regex.Match(f, @"every\s+([0-9.]+)\s+days", RegexOptions.IgnoreCase);
            if (cadMatch.Success) cadence = double.Parse(cadMatch.Groups[1].Value, CultureInfo.InvariantCulture);
        }
        return (titles, descriptions, cadence);
    }

    public static string OpportunityCategory(int titleIssues, int weakDescriptions, double cadenceDays)
    {
        if (weakDescriptions >= 8) return "weak_descriptions";
        if (titleIssues >= 6) return "title_packaging";
        if (cadenceDays > 21) return "upload_cadence";
        return "discoverability";
    }

    public static string OpportunityFromProspect(AcqProspectRecord p)
    {
        var obs = p.Observation ?? "";
        if (obs.Contains("description", StringComparison.OrdinalIgnoreCase)) return "weak_descriptions";
        if (obs.Contains("title", StringComparison.OrdinalIgnoreCase)) return "title_packaging";
        if ((p.CadenceDays ?? 0) > 21) return "upload_cadence";
        return "discoverability";
    }

    public static string MapView(AcqProspectRecord p)
    {
        var s = (p.OutreachStatus ?? "").ToLowerInvariant();
        if (s is "unsubscribed" or "bounced" or "complained" or "suppressed" or "rejected"
            or "sent" or "delivered" or "clicked" or "replied" or "interested" or "scheduled" or "approved"
            or "customer" or "audit_started" or "audit_completed" or "pricing_viewed" or "checkout_started"
            or "needs_review" or "draft_ready")
            return s;
        if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
            return p.SuppressionStatus.ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(p.ApprovalId)) return "approved";
        if (!string.IsNullOrWhiteSpace(p.Subject) && !string.IsNullOrWhiteSpace(p.Body) && !string.IsNullOrWhiteSpace(p.Observation))
            return "draft_ready";
        if (IsVerifiedPublicEmail(p)) return "contact_verified";
        if (string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase) && p.PriorityScore >= 50)
            return "qualified";
        if (string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase))
            return "needs_inspection";
        return "discovered";
    }

    public static AcqSanitizedProspectDto Sanitize(AcqProspectRecord p) => new(
        p.ProspectId,
        p.ChannelName,
        p.Handle,
        p.ChannelUrl,
        p.ChannelId,
        p.PrimaryNiche,
        p.Language,
        p.Country,
        AcqIds.SubscriberRange(p.SubscriberCount),
        p.VideoCount,
        p.RecentUploadAt,
        p.CadenceDays,
        p.OfficialWebsite,
        p.ContactSourceUrl,
        p.ContactType,
        ContactStatusLabel(p),
        p.PriorityScore,
        OpportunityFromProspect(p),
        p.InspectionStatus,
        p.OutreachStatus,
        // Approval badge is only for currently awaiting send — not retained after SES send.
        string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(p.ApprovalId)
            ? "approved"
            : "none",
        p.Campaign,
        p.TrackedPath,
        p.Observation,
        p.SuggestedImprovement,
        p.Subject,
        p.EvidenceAt,
        p.PreviewPlaceholder,
        AcquisitionScore: p.PriorityScore,
        ScoreBreakdownJson: p.ScoreBreakdownJson,
        ContactResearchStatus: p.ContactResearchStatus,
        FollowUpStep: p.FollowUpStep,
        NextFollowUpAt: p.NextFollowUpAt,
        LastContactedAtPublic: p.LastContactedAt,
        TemplateVersion: p.TemplateVersion,
        SubjectVariant: p.SubjectVariant,
        MessageVariant: p.MessageVariant,
        FindingType: p.FindingType,
        ExampleVideoTitle: p.ExampleVideoTitle,
        ContactConfidence: p.ContactConfidence,
        ContactDiscoveryResult: p.ContactDiscoveryResult,
        ContactResearchLastAt: p.ContactResearchLastAt,
        ContactResearchNextAt: p.ContactResearchNextAt
    );

    public static string ContactStatusLabel(AcqProspectRecord p)
    {
        if (p.AdminAttestedContact && string.Equals(p.ContactType, "admin_attested", StringComparison.OrdinalIgnoreCase))
            return "admin_attested";
        if (string.Equals(p.ContactResearchStatus, "review_email", StringComparison.OrdinalIgnoreCase))
            return "review_email";
        if (string.Equals(p.ContactResearchStatus, "not_found", StringComparison.OrdinalIgnoreCase)
            || string.Equals(p.ContactDiscoveryResult, "not_found", StringComparison.OrdinalIgnoreCase))
            return "not_found";
        if (string.Equals(p.ContactType, "form_only", StringComparison.OrdinalIgnoreCase))
            return "Contact route available — automated email unavailable";
        if (IsVerifiedPublicEmail(p)) return "verified_public";
        if (!string.IsNullOrWhiteSpace(p.ContactSourceUrl)) return "source_recorded_unverified";
        return "none";
    }

    public static string CsvEscape(string? value)
    {
        var v = value ?? "";
        if (v.Contains(',') || v.Contains('"') || v.Contains('\n'))
            return "\"" + v.Replace("\"", "\"\"") + "\"";
        return v;
    }

    public static string SanitizedCsvHeader() =>
        "prospect_id,channel_name,handle,channel_url,niche,subscriber_range,recent_upload_date,fit_score,opportunity_category,contact_source_url,contact_status,approval_status";

    public static string SanitizedCsvRow(AcqProspectRecord p)
    {
        var dto = Sanitize(p);
        return string.Join(',',
            CsvEscape(dto.ProspectId),
            CsvEscape(dto.ChannelName),
            CsvEscape(dto.Handle),
            CsvEscape(dto.ChannelUrl),
            CsvEscape(dto.PrimaryNiche),
            CsvEscape(dto.SubscriberRange),
            CsvEscape(dto.RecentUploadAt?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            dto.PriorityScore.ToString(CultureInfo.InvariantCulture),
            CsvEscape(dto.OpportunityCategory),
            CsvEscape(dto.ContactSourceUrl),
            CsvEscape(dto.ContactStatus),
            CsvEscape(dto.ApprovalStatus));
    }

    public static bool CsvContainsEmail(string csv) =>
        Regex.IsMatch(csv ?? "", @"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", RegexOptions.IgnoreCase);

    private static string TrimTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "";
        var t = title.Trim();
        return t.Length <= 80 ? t : t[..77] + "…";
    }

    public static DateTimeOffset EasternDate(DateTimeOffset utc)
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York"); }
        catch { tz = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time"); }
        return TimeZoneInfo.ConvertTime(utc, tz);
    }

    public static bool IsWeekdayEastern(DateTimeOffset utc)
    {
        var d = EasternDate(utc).DayOfWeek;
        return d is >= DayOfWeek.Monday and <= DayOfWeek.Friday;
    }

    /// <summary>UI/admin queue: verified contact + complete draft, not yet approved or terminal.</summary>
    public static bool IsReadyForApproval(AcqProspectRecord p)
    {
        if (p.PreviewPlaceholder) return false;
        var outreach = (p.OutreachStatus ?? "").ToLowerInvariant();
        if (outreach is "approved"
            or "rejected" or "suppressed" or "bounced" or "complained" or "unsubscribed"
            or "customer" or "sent" or "delivered" or "replied" or "interested"
            or "clicked" or "audit_started" or "audit_completed" or "pricing_viewed" or "checkout_started"
            or "needs_review")
            return false;
        if (!string.IsNullOrWhiteSpace(p.ApprovalId)
            && string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
            return false;
        if (!IsVerifiedPublicEmail(p)) return false;
        if (string.IsNullOrWhiteSpace(p.Subject)
            || string.IsNullOrWhiteSpace(p.Observation)
            || string.IsNullOrWhiteSpace(p.Body))
            return false;
        if (!HasStrongPersonalization(p)) return false;
        if (!string.Equals(p.TemplateVersion, CreatorAcquisitionCopy.TemplateVersion, StringComparison.OrdinalIgnoreCase)
            && CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body))
            return false;
        return true;
    }

    /// <summary>Next weekday 8:00 America/New_York strictly after <paramref name="utcNow"/>.</summary>
    public static DateTimeOffset NextWeekdaySendEastern(DateTimeOffset utcNow, int hourEt = 8)
    {
        var et = EasternDate(utcNow);
        var d = et.Date;
        for (var i = 0; i < 10; i++)
        {
            var day = d.AddDays(i);
            if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
            var sendAt = new DateTimeOffset(day.Year, day.Month, day.Day, hourEt, 0, 0, et.Offset);
            if (sendAt > et) return sendAt;
        }
        return et.AddDays(1);
    }
}
