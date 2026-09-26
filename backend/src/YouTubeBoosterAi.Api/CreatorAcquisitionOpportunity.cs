using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

/// <summary>One evidence-backed contribution to opportunity scoring (not an LLM invent).</summary>
public sealed record AcqOpportunityComponent(
    string Type,
    string Evidence,
    double Confidence,
    int Points
);

public sealed record AcqOpportunityEvidence(
    int Score,
    string? PrimaryOpportunity,
    double PersonalizationConfidence,
    IReadOnlyList<AcqOpportunityComponent> Components,
    string AnalysisVersion = CreatorAcquisitionOpportunity.AnalysisVersion
);

/// <summary>
/// Deterministic opportunity scoring from public YouTube metadata already collected at inspect time.
/// Does not invent private Studio metrics.
/// </summary>
public static class CreatorAcquisitionOpportunity
{
    public const string AnalysisVersion = "opp-v1";
    public const double MinPersonalizationConfidence = 0.72;
    public const int MinOpportunityScoreForAutoSend = 70;

    public static AcqOpportunityEvidence Build(
        AcqScoreBreakdown baseScore,
        int weakDescriptions,
        int titleIssues,
        int sampleSize,
        string? exampleTitle,
        string? findingType,
        string language,
        IEnumerable<string>? videoTitles = null,
        IEnumerable<string>? videoDescriptions = null)
    {
        var components = new List<AcqOpportunityComponent>();
        var n = Math.Max(1, sampleSize);

        if (weakDescriptions >= Math.Max(3, n / 2))
        {
            var pts = Math.Clamp(8 + weakDescriptions, 8, 22);
            components.Add(new AcqOpportunityComponent(
                "WEAK_DESCRIPTIONS",
                $"{weakDescriptions} of the last {n} public videos have very short descriptions for search.",
                Confidence: Math.Clamp(0.55 + weakDescriptions / (double)(n * 2), 0.55, 0.95),
                Points: pts));
        }

        if (titleIssues >= Math.Max(3, n / 4))
        {
            var pts = Math.Clamp(8 + titleIssues / 2, 8, 20);
            var evidence = string.IsNullOrWhiteSpace(exampleTitle)
                ? $"{titleIssues} of the last {n} public titles bury the dish or benefit later than they should."
                : $"{titleIssues} of the last {n} public titles bury the dish or benefit later than they should (e.g. \"{TrimTitle(exampleTitle)}\").";
            components.Add(new AcqOpportunityComponent(
                "WEAK_TITLE_PACKAGING",
                evidence,
                Confidence: Math.Clamp(0.55 + titleIssues / (double)(n * 2), 0.55, 0.94),
                Points: pts));
        }

        if (!string.IsNullOrWhiteSpace(exampleTitle)
            && (findingType is "DESCRIPTION_DEPTH" or "TITLE_OPPORTUNITY" or "DESCRIPTION_OPPORTUNITY" or "TITLE_CLARITY"))
        {
            components.Add(new AcqOpportunityComponent(
                "ANALYZED_RECENT_VIDEO",
                $"Public sample includes \"{TrimTitle(exampleTitle)}\" as a concrete packaging example.",
                Confidence: 0.88,
                Points: 8));
        }

        var mixed = DetectMixedLanguage(language, videoTitles, videoDescriptions);
        if (mixed is not null)
            components.Add(mixed);

        // Fold base packaging points so total stays comparable to PriorityScore scale.
        if (baseScore.PackagingOpportunity > 0 && components.Count == 0)
        {
            components.Add(new AcqOpportunityComponent(
                "PACKAGING_SIGNAL",
                "Public titles/descriptions show inconsistent packaging for search and browse.",
                Confidence: 0.5,
                Points: Math.Min(12, baseScore.PackagingOpportunity)));
        }

        var opportunityPoints = components.Sum(c => c.Points);
        // Blend packaging base with evidence points. Strong public packaging evidence must
        // clear MinOpportunityScoreForAutoSend when components are present.
        var score = components.Count == 0
            ? Math.Clamp(baseScore.Total, 0, 100)
            : Math.Clamp(
                (int)Math.Round(baseScore.Total * 0.7 + opportunityPoints * 0.5 + baseScore.PackagingOpportunity * 0.2),
                0,
                100);

        var primary = components
            .OrderByDescending(c => c.Points)
            .ThenByDescending(c => c.Confidence)
            .Select(c => c.Type)
            .FirstOrDefault();

        var personalization = ComputePersonalizationConfidence(components, exampleTitle, findingType, sampleSize, weakDescriptions, titleIssues);

        return new AcqOpportunityEvidence(
            Score: score,
            PrimaryOpportunity: primary,
            PersonalizationConfidence: personalization,
            Components: components);
    }

    public static string ToJson(AcqOpportunityEvidence evidence) =>
        JsonSerializer.Serialize(evidence, AcqJson.Options);

    public static AcqOpportunityEvidence? TryParse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<AcqOpportunityEvidence>(json, AcqJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public static bool MeetsAutoSendThreshold(AcqProspectRecord p)
    {
        if (!CreatorAcquisitionScoring.HasStrongPersonalization(p)) return false;
        if (p.AuditGeneratedAt is null) return false;
        var evidence = TryParse(p.OpportunityEvidenceJson);
        if (evidence is null)
        {
            // Backward compatible for drafts stamped before opp-v1 JSON: still require audit + score.
            return p.PriorityScore >= MinOpportunityScoreForAutoSend
                   && !string.IsNullOrWhiteSpace(p.ExampleVideoTitle);
        }
        return evidence.Score >= MinOpportunityScoreForAutoSend
               && evidence.PersonalizationConfidence >= MinPersonalizationConfidence
               && evidence.Components.Count > 0
               && CreatorAcquisitionScoring.HasStrongPersonalization(p);
    }

    public static bool LooksLikeUnsupportedPrivateClaim(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var t = text.ToLowerInvariant();
        return t.Contains("youtube studio")
               || t.Contains("impressions")
               || t.Contains("click-through rate")
               || t.Contains(" ctr ")
               || t.Contains("your ctr")
               || t.Contains("retention graph")
               || t.Contains("audience retention")
               || t.Contains("traffic source")
               || t.Contains("private analytics");
    }

    private static double ComputePersonalizationConfidence(
        IReadOnlyList<AcqOpportunityComponent> components,
        string? exampleTitle,
        string? findingType,
        int sampleSize,
        int weakDescriptions,
        int titleIssues)
    {
        if (components.Count == 0) return 0.2;
        var avg = components.Average(c => c.Confidence);
        var boost = 0.0;
        if (!string.IsNullOrWhiteSpace(exampleTitle)) boost += 0.08;
        if (sampleSize >= 10) boost += 0.05;
        if (weakDescriptions >= 5 || titleIssues >= 5) boost += 0.04;
        if (!string.IsNullOrWhiteSpace(findingType)
            && findingType is "DESCRIPTION_DEPTH" or "TITLE_OPPORTUNITY")
            boost += 0.05;
        return Math.Clamp(avg + boost, 0, 0.99);
    }

    private static AcqOpportunityComponent? DetectMixedLanguage(
        string channelLanguage,
        IEnumerable<string>? titles,
        IEnumerable<string>? descriptions)
    {
        var blob = string.Join('\n', (titles ?? []).Take(12).Concat((descriptions ?? []).Take(12)));
        if (blob.Length < 40) return null;
        var hasLatin = Regex.IsMatch(blob, @"[A-Za-z]{3,}");
        var hasCyrillic = Regex.IsMatch(blob, @"[\u0400-\u04FF]{3,}");
        var hasCjk = Regex.IsMatch(blob, @"[\u3040-\u30ff\u3400-\u9fff]{2,}");
        var scripts = (hasLatin ? 1 : 0) + (hasCyrillic ? 1 : 0) + (hasCjk ? 1 : 0);
        if (scripts < 2) return null;
        var lang = string.IsNullOrWhiteSpace(channelLanguage) ? "unspecified" : channelLanguage;
        return new AcqOpportunityComponent(
            "MIXED_LANGUAGE_METADATA",
            $"Public titles/descriptions mix multiple scripts while the channel language is recorded as {lang} — localization packaging may be limiting discovery.",
            Confidence: 0.8,
            Points: 14);
    }

    private static string TrimTitle(string? title)
    {
        var t = (title ?? "").Trim();
        if (t.Length <= 80) return t;
        return t[..77] + "...";
    }
}
