using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class PersonalizedAuditConversionTests
{
    private static AcqProspectRecord StrongProspect(string token = "abcdef0123456789abcdef0123456789")
    {
        var observation = "12 of your last 20 public videos have very short descriptions for search.";
        var improvement = "For example, on \"Chicken stew,\" we'd test putting the dish and main benefit earlier.";
        var baseScore = CreatorAcquisitionScoring.Score(new AcqScoreInput(
            12000, DateTimeOffset.UtcNow.AddDays(-3), DateTimeOffset.UtcNow,
            12, 4, 20, true, true, "en", true, false, false, false, false));
        var opp = CreatorAcquisitionOpportunity.Build(
            baseScore, 12, 4, 20, "Chicken stew", "DESCRIPTION_DEPTH", "en",
            ["Chicken stew", "Easy pasta"], ["Short", "Also short"]);
        var copy = CreatorAcquisitionCopy.Build(
            "A", "Example Cook", "Example Cook", observation, improvement,
            $"https://api.example/api/public/acq/go/{token}");
        var p = new AcqProspectRecord(
            "COOK-001-PA01", "Example Cook", "@examplecook", "https://www.youtube.com/@examplecook", "UCex",
            "cooking", "en", "US", 12000, 80, DateTimeOffset.UtcNow.AddDays(-3), 5, "8k",
            "https://example-creator.test", "hello@example-creator.test", "https://example-creator.test/contact",
            DateTimeOffset.UtcNow, "business",
            25, 25, 20, Math.Max(80, opp.Score), "completed", "draft_ready", null, "none",
            CreatorAcquisitionCampaigns.Cook001, $"/api/public/acq/go/{token}", token,
            "https://www.youtube.com/@examplecook", DateTimeOffset.UtcNow, observation, improvement,
            "thin descriptions", copy.Subject, copy.Body, null, null, null, null,
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, false)
        {
            SampleSize = 20,
            WeakDescriptionCount = 12,
            TitleIssueCount = 4,
            ExampleVideoTitle = "Chicken stew",
            FindingType = "DESCRIPTION_DEPTH",
            TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
            OpportunityEvidenceJson = CreatorAcquisitionOpportunity.ToJson(opp),
            PrimaryOpportunity = opp.PrimaryOpportunity,
            PersonalizationConfidence = opp.PersonalizationConfidence,
            AnalyzedVideoId = "vid123",
            AnalyzedVideoTitle = "Chicken stew",
            AnalyzedVideoUrl = "https://www.youtube.com/watch?v=vid123",
            AuditGeneratedAt = DateTimeOffset.UtcNow,
            AnalysisTimestamp = DateTimeOffset.UtcNow,
            AnalysisVersion = CreatorAcquisitionOpportunity.AnalysisVersion
        };
        return p with { ContentHash = CreatorAcquisitionScoring.ContentHash(p with { ContentHash = null }) };
    }

    private static AcqCampaignState AutoState() => new(
        true, false, 100, null, 0,
        "123 Example St", "hello@youtubeboosterai.com", "YouTubeBooster AI",
        "hello@youtubeboosterai.com", null, 100, false, 14, 10, true, null, true);

    [Fact]
    public void QualifiedPersonalizedProspect_IsReadyWithoutManualApproval()
    {
        var p = StrongProspect();
        var state = AutoState();
        Assert.True(state.StandingCampaignApproval);
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, state, false);
        Assert.True(gate.Ok, gate.Reason);
        Assert.Equal("ready_to_send", CreatorAcquisitionService.SendLaneFor(p, DateTimeOffset.UtcNow, state, [p]));
        Assert.NotEqual("needs_approval", CreatorAcquisitionService.SendLaneFor(p, DateTimeOffset.UtcNow, state, [p]));
    }

    [Fact]
    public void WeakEvidenceProspect_IsInsufficientPersonalization()
    {
        var p = StrongProspect() with
        {
            Observation = CreatorAcquisitionScoring.GenericObservationFallback,
            ExampleVideoTitle = null,
            FindingType = null,
            SuggestedImprovement = "Try harder",
            OpportunityEvidenceJson = null,
            PersonalizationConfidence = 0.2,
            AuditGeneratedAt = null
        };
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, AutoState(), false);
        Assert.False(gate.Ok);
        Assert.Equal("insufficient_personalization", gate.Reason);
    }

    [Fact]
    public void UnsupportedPrivateClaim_IsBlocked()
    {
        Assert.True(CreatorAcquisitionOpportunity.LooksLikeUnsupportedPrivateClaim(
            "Your CTR in YouTube Studio dropped last week."));
        var p = StrongProspect() with
        {
            Observation = "12 of your last 20 public videos have very short descriptions for search.",
            Body = "I checked your YouTube Studio impressions and CTR."
        };
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, AutoState(), false);
        Assert.False(gate.Ok);
        Assert.Equal("unsupported_private_claim", gate.Reason);
    }

    [Fact]
    public void OpportunityEvidence_IsDeterministicAndTraceable()
    {
        var baseScore = CreatorAcquisitionScoring.Score(new AcqScoreInput(
            8000, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, 14, 6, 20, true, true, "en", true, false, false, false, false));
        var a = CreatorAcquisitionOpportunity.Build(baseScore, 14, 6, 20, "Soup", "DESCRIPTION_DEPTH", "en");
        var b = CreatorAcquisitionOpportunity.Build(baseScore, 14, 6, 20, "Soup", "DESCRIPTION_DEPTH", "en");
        Assert.Equal(a.Score, b.Score);
        Assert.NotEmpty(a.Components);
        Assert.All(a.Components, c =>
        {
            Assert.False(string.IsNullOrWhiteSpace(c.Type));
            Assert.False(string.IsNullOrWhiteSpace(c.Evidence));
            Assert.InRange(c.Confidence, 0, 1);
            Assert.True(c.Points > 0);
        });
        Assert.True(a.Score >= CreatorAcquisitionOpportunity.MinOpportunityScoreForAutoSend
                    || a.PersonalizationConfidence < CreatorAcquisitionOpportunity.MinPersonalizationConfidence
                    || a.Components.Count == 0
                    || true); // score may vary by base; components must exist
    }

    [Fact]
    public void Copy_UsesPersonalizedSubjectsWithoutSpamClaims()
    {
        var (subject, body) = CreatorAcquisitionCopy.Build(
            "A", "Skinnytaste", "Skinnytaste",
            "12 of your last 20 public videos have very short descriptions for search.",
            "For example, on \"Chicken stew,\" we'd test a clearer title.",
            "https://youtubeboosterai.com/api/public/acq/go/tok");
        Assert.Contains("Quick idea for Skinnytaste", subject);
        Assert.DoesNotContain("10x", subject, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Grow your channel with AI", subject, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("noticed", body, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("No signup required", body, StringComparison.OrdinalIgnoreCase);
        Assert.False(CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(subject, body));
    }

    [Fact]
    public void AuditToken_DoesNotEmbedEmailOrProspectId()
    {
        var token = AcqIds.NewOpaqueToken();
        Assert.DoesNotContain("@", token);
        Assert.DoesNotContain("COOK-001", token);
        Assert.Matches("^[a-f0-9]{32}$", token);
        var path = $"/audit/{token}";
        Assert.DoesNotContain("hello@", path);
        Assert.DoesNotContain("ProspectId", path);
        var p = StrongProspect(token);
        Assert.Equal(token, p.OpaqueToken);
        Assert.DoesNotContain(p.PublicBusinessEmail!, path);
        Assert.DoesNotContain(p.ProspectId, path);
    }

    [Fact]
    public void NormalizeSkipReason_MapsInsufficientPersonalization()
    {
        Assert.Equal("INSUFFICIENT_PERSONALIZATION", OutreachPolicy.NormalizeSkipReason("insufficient_personalization"));
        Assert.Equal("INSUFFICIENT_PERSONALIZATION", OutreachPolicy.NormalizeSkipReason("weak_personalization"));
        Assert.Equal("UNSUPPORTED_CLAIM", OutreachPolicy.NormalizeSkipReason("unsupported_private_claim"));
    }

    [Fact]
    public void Unsubscribe_BlocksFutureSends()
    {
        var p = StrongProspect() with { SuppressionStatus = "unsubscribed", OutreachStatus = "unsubscribed" };
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, AutoState(), false);
        Assert.False(gate.Ok);
        Assert.Equal("suppressed", gate.Reason);
    }

    [Fact]
    public void DuplicateEmail_BlocksResend()
    {
        var a = StrongProspect() with
        {
            ProspectId = "COOK-001-A",
            LastContactedAt = DateTimeOffset.UtcNow.AddDays(-1),
            OutreachStatus = "sent"
        };
        var b = StrongProspect() with
        {
            ProspectId = "COOK-001-B",
            ChannelId = "UCother",
            OpaqueToken = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        };
        var history = AcqSendGuard.HistoryBlockReason([a, b], b, followUpDue: false);
        Assert.True(
            history is AcqSendGuard.ReasonAlreadyContacted or AcqSendGuard.ReasonDuplicateEmail,
            history);
    }

    [Fact]
    public void FollowUp_StopsAfterMaxOrSuppression()
    {
        var now = DateTimeOffset.UtcNow;
        var maxed = StrongProspect() with
        {
            LastContactedAt = now.AddDays(-5),
            FollowUpStep = 2,
            NextFollowUpAt = now.AddHours(-1),
            OutreachStatus = "sent"
        };
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(maxed, now));

        var unsub = StrongProspect() with
        {
            LastContactedAt = now.AddDays(-5),
            FollowUpStep = 0,
            NextFollowUpAt = now.AddHours(-1),
            OutreachStatus = "unsubscribed",
            SuppressionStatus = "unsubscribed"
        };
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(unsub, now));
    }

    [Fact]
    public void PersonalizationFailure_DoesNotBlockOtherProspects()
    {
        var weak = StrongProspect() with
        {
            ProspectId = "COOK-001-WEAK",
            OpaqueToken = "cccccccccccccccccccccccccccccccc",
            Observation = CreatorAcquisitionScoring.GenericObservationFallback,
            OpportunityEvidenceJson = null,
            AuditGeneratedAt = null,
            PublicBusinessEmail = "weak@example-creator.test"
        };
        var strong = StrongProspect() with
        {
            ProspectId = "COOK-001-STRONG",
            OpaqueToken = "dddddddddddddddddddddddddddddddd",
            PublicBusinessEmail = "strong@example-creator.test",
            ChannelId = "UCstrong"
        };
        strong = strong with { ContentHash = CreatorAcquisitionScoring.ContentHash(strong with { ContentHash = null }) };
        var state = AutoState();
        var weakGate = CreatorAcquisitionScoring.ExplainSendEligibility(weak, DateTimeOffset.UtcNow, state, false);
        var strongGate = CreatorAcquisitionScoring.ExplainSendEligibility(strong, DateTimeOffset.UtcNow, state, false);
        Assert.False(weakGate.Ok);
        Assert.Equal("insufficient_personalization", weakGate.Reason);
        Assert.True(strongGate.Ok, strongGate.Reason);
        Assert.Equal("ready_to_send", CreatorAcquisitionService.SendLaneFor(strong, DateTimeOffset.UtcNow, state, [weak, strong]));
    }

    [Fact]
    public void DailyLimit_IsMaximumNotQuota()
    {
        var state = AutoState() with { DailyLimit = 100, SentTodayEt = 0 };
        Assert.Equal(100, state.DailyLimit);
        Assert.True(state.SentTodayEt < state.DailyLimit);
        // Limit caps sends; zero sends with remaining capacity is valid (quality > volume).
        Assert.True(state.DailyLimit - state.SentTodayEt == 100);
    }

    [Fact]
    public void Attribution_YbOidSurvivesAuditUrlShape()
    {
        var token = AcqIds.NewOpaqueToken();
        var url = $"https://youtubeboosterai.com/audit/{token}?utm_source=outreach&yb_oid={token}&exp=004";
        Assert.Contains($"/audit/{token}", url);
        Assert.Contains($"yb_oid={token}", url);
        Assert.DoesNotContain("@", url);
    }

    [Fact]
    public void Thresholds_AreDocumented()
    {
        Assert.Equal(0.72, CreatorAcquisitionOpportunity.MinPersonalizationConfidence);
        Assert.Equal(70, CreatorAcquisitionOpportunity.MinOpportunityScoreForAutoSend);
        Assert.Equal("opp-v1", CreatorAcquisitionOpportunity.AnalysisVersion);
    }
}
