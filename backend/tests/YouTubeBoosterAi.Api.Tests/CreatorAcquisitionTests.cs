using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class CreatorAcquisitionTests
{
    private static AcqProspectRecord Prospect(
        string id = "COOK-001-P001",
        long subs = 12000,
        DateTimeOffset? recent = null,
        string? email = "hello@example-creator.test",
        string contactType = "business",
        string inspection = "completed",
        int score = 80,
        string? observation = "12 of your last 20 public videos have very short descriptions for search.",
        string? subject = "One idea for Example Cook's YouTube channel",
        string suppression = "none",
        DateTimeOffset? lastContacted = null,
        bool placeholder = false,
        string? approvalId = "APR-1",
        string handle = "@examplecook")
    {
        recent ??= DateTimeOffset.UtcNow.AddDays(-7);
        var p = new AcqProspectRecord(
            id, "Example Cook", handle, "https://www.youtube.com/@examplecook", "UCexample",
            "cooking", "en", "US", subs, 100, recent, 5, "8k-20k", "https://example-creator.test",
            email, "https://example-creator.test/contact", DateTimeOffset.UtcNow, contactType,
            25, 25, 20, score, inspection, "approved", lastContacted, suppression,
            CreatorAcquisitionCampaigns.Cook001, "/api/public/acq/go/tok", "tok",
            "https://www.youtube.com/@examplecook", DateTimeOffset.UtcNow, observation,
            "For example, on \"Chicken stew,\" we'd test putting the dish and main benefit earlier in the title and adding a short search-focused description.",
            "thin descriptions",
            subject, "body", null, approvalId, null, null,
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, placeholder);
        return p with
        {
            ContentHash = CreatorAcquisitionScoring.ContentHash(p with { ContentHash = null }),
            SampleSize = 20,
            WeakDescriptionCount = 12,
            TitleIssueCount = 2,
            ExampleVideoTitle = "Chicken stew",
            FindingType = "DESCRIPTION_DEPTH",
            TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
            SubjectVariant = "A",
            MessageVariant = "brand_audit_v1",
            Body = CreatorAcquisitionCopy.Build(
                "A", "Example Cook", "Example Cook", observation ?? "",
                "For example, on \"Chicken stew,\" we'd test putting the dish and main benefit earlier in the title and adding a short search-focused description.",
                "https://youtubeboosterai.com/api/public/acq/go/tok").Body
        };
    }

    private static AcqCampaignState State(bool sending = true) => new(
        sending, false, 5, null, 0,
        "123 Example St, Wilmington, DE 19801",
        "hello@youtubeboosterai.com",
        "YouTubeBooster AI",
        "hello@youtubeboosterai.com",
        "yb-creator-acquisition");

    [Fact]
    public void TargetRange_ScoresInBandOnly()
    {
        var now = DateTimeOffset.UtcNow;
        var inBand = CreatorAcquisitionScoring.Score(new AcqScoreInput(5000, now, now, 12, 8, 20, true, true, "en", true, false, false, false, false));
        var tiny = CreatorAcquisitionScoring.Score(new AcqScoreInput(200, now, now, 12, 8, 20, true, true, "en", true, false, false, false, false));
        var celeb = CreatorAcquisitionScoring.Score(new AcqScoreInput(2_000_000, now, now, 12, 8, 20, true, true, "en", true, false, true, false, false));
        Assert.Equal(18, inBand.TargetRange);
        Assert.Equal(0, tiny.TargetRange);
        Assert.Equal(0, celeb.Total);
        Assert.True(inBand.Total >= 70);
    }

    [Fact]
    public void PackagingScore_DifferentiatesByRatio()
    {
        var now = DateTimeOffset.UtcNow;
        var weak = CreatorAcquisitionScoring.Score(new AcqScoreInput(8000, now, now, 18, 10, 20, true, true, "en", true, false, false, false, false));
        var mild = CreatorAcquisitionScoring.Score(new AcqScoreInput(8000, now, now, 4, 2, 20, true, true, "en", true, false, false, false, false));
        Assert.True(weak.PackagingOpportunity > mild.PackagingOpportunity);
        Assert.NotEqual(weak.Total, mild.Total);
    }

    [Fact]
    public void FollowUpDue_BypassesCooldownGate()
    {
        var now = DateTimeOffset.UtcNow;
        var p = Prospect(lastContacted: now.AddDays(-4), score: 85) with
        {
            FollowUpStep = 0,
            NextFollowUpAt = now.AddHours(-1),
            OutreachStatus = "sent"
        };
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, now, State(), alreadyContacted: true);
        Assert.True(gate.Ok);
        Assert.Equal("ok_follow_up", gate.Reason);
    }

    [Fact]
    public void InitialSend_RequiresApprovalWhenStandingOff()
    {
        var p = Prospect(approvalId: null, score: 85) with { ContentHash = null };
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, State(), false);
        Assert.False(gate.Ok);
        Assert.Equal("not_approved", gate.Reason);
    }

    [Fact]
    public void IsReadyForApproval_RequiresVerifiedDraftNotApproved()
    {
        var ready = Prospect(approvalId: null, score: 85) with
        {
            OutreachStatus = "draft_ready",
            ContentHash = null,
            ContactVerifiedAt = DateTimeOffset.UtcNow
        };
        Assert.True(CreatorAcquisitionScoring.IsReadyForApproval(ready));

        var approved = ready with { OutreachStatus = "approved", ApprovalId = "APR-1" };
        Assert.False(CreatorAcquisitionScoring.IsReadyForApproval(approved));

        var noBody = ready with { Body = null };
        Assert.False(CreatorAcquisitionScoring.IsReadyForApproval(noBody));
    }

    [Fact]
    public void NextWeekdaySendEastern_IsAfterNowOnWeekdayMorning()
    {
        // Wednesday 10:00 ET → Thursday 08:00 ET
        var wed = new DateTimeOffset(2026, 9, 16, 14, 0, 0, TimeSpan.Zero); // ~10am ET
        var next = CreatorAcquisitionScoring.NextWeekdaySendEastern(wed);
        Assert.True(next > CreatorAcquisitionScoring.EasternDate(wed));
        Assert.Equal(8, next.Hour);
        Assert.NotEqual(DayOfWeek.Saturday, next.DayOfWeek);
        Assert.NotEqual(DayOfWeek.Sunday, next.DayOfWeek);
    }

    [Fact]
    public void RecentActivity_RequiresUploadWithin60DaysForEligibility()
    {
        var fresh = Prospect(recent: DateTimeOffset.UtcNow.AddDays(-10));
        var stale = Prospect(recent: DateTimeOffset.UtcNow.AddDays(-90));
        Assert.True(CreatorAcquisitionScoring.ExplainSendEligibility(fresh, DateTimeOffset.UtcNow, State(), false).Ok);
        Assert.Equal("stale_upload", CreatorAcquisitionScoring.ExplainSendEligibility(stale, DateTimeOffset.UtcNow, State(), false).Reason);
    }

    [Fact]
    public async Task Dedup_ByHandleAndUrl()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var a = Prospect();
        await store.UpsertProspectAsync(a, CancellationToken.None);
        var dup = await store.FindDuplicateAsync(null, a.ChannelUrl, a.Handle, null, CancellationToken.None);
        Assert.NotNull(dup);
        Assert.Equal(a.ProspectId, dup!.ProspectId);
    }

    [Fact]
    public void GuessedEmail_IsRejected()
    {
        Assert.True(CreatorAcquisitionContact.IsGuessed("chef@gmail.com", null));
        Assert.False(CreatorAcquisitionContact.IsGuessed("chef@gmail.com", "https://example-creator.test/contact"));
        Assert.Empty(CreatorAcquisitionContact.ExtractVisibleEmails("mail me at a@b.com", "https://socialblade.com/youtube"));
        var allowed = CreatorAcquisitionContact.ExtractVisibleEmails("Contact: <a href='mailto:hello@brand.test'>hello@brand.test</a>", "https://brand.test/contact");
        Assert.Contains("hello@brand.test", allowed);
    }

    [Fact]
    public void Observation_IsEvidenceBackedAndNotInsulting()
    {
        var obs = CreatorAcquisitionScoring.BuildObservation(2, 14, 20, "Chicken stew");
        Assert.Contains("14 of your last 20", obs);
        Assert.DoesNotContain("failing", obs, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("terrible", obs, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("guarantee", obs, StringComparison.OrdinalIgnoreCase);
        var fix = CreatorAcquisitionScoring.BuildImprovement(2, 14, "Chicken stew");
        Assert.Contains("For example, on \"Chicken stew,\"", fix);
    }

    [Fact]
    public void BrandCopy_HasNoPersonalSender()
    {
        var (subject, body) = CreatorAcquisitionCopy.Build(
            "A", "Pinch of Yum", "Pinch of Yum",
            "20 of your last 20 public videos have very short descriptions for search.",
            "For example, on \"Chipotle Salmon with Orange Salsa and Aji Verde,\" we'd test putting the dish and main benefit earlier in the title and adding a short search-focused description.",
            "https://youtubeboosterai.com/api/public/acq/go/tok");
        Assert.Equal("One idea for Pinch of Yum's YouTube channel", subject);
        Assert.Contains("We analyzed", body);
        Assert.Contains("YouTubeBooster AI", body);
        Assert.DoesNotContain("Max", body);
        Assert.DoesNotContain("Founder", body);
        Assert.DoesNotContain("I ran", body);
        Assert.True(CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(
            "x", "Hi,\n\nI ran Foo through YouTubeBooster\n\nMax\nFounder, YouTubeBooster AI"));
    }

    [Fact]
    public void Approval_InvalidatesWhenObservationChanges()
    {
        var p = Prospect();
        var hash = p.ContentHash;
        var edited = p with
        {
            Observation = "18 of your last 20 public videos have very short descriptions for search."
        };
        Assert.NotEqual(hash, CreatorAcquisitionScoring.ContentHash(edited));
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
            edited with { ContentHash = hash }, DateTimeOffset.UtcNow, State(), false);
        Assert.Equal("content_hash_changed", gate.Reason);
    }

    [Fact]
    public async Task Idempotency_SecondClaimFails()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        Assert.True(await store.TryClaimIdempotencyAsync("k1", CancellationToken.None));
        Assert.False(await store.TryClaimIdempotencyAsync("k1", CancellationToken.None));
    }

    [Fact]
    public void SuppressionAndUnsubscribe_BlockSend()
    {
        var unsub = Prospect(suppression: "unsubscribed");
        Assert.Equal("suppressed", CreatorAcquisitionScoring.ExplainSendEligibility(unsub, DateTimeOffset.UtcNow, State(), false).Reason);
        var bounce = Prospect(suppression: "bounced");
        Assert.False(CreatorAcquisitionScoring.ExplainSendEligibility(bounce, DateTimeOffset.UtcNow, State(), false).Ok);
    }

    [Fact]
    public void ComplaintPause_BlocksCampaign()
    {
        var paused = State() with { ComplaintPause = true };
        Assert.Equal("complaint_pause", CreatorAcquisitionScoring.ExplainSendEligibility(Prospect(), DateTimeOffset.UtcNow, paused, false).Reason);
    }

    [Fact]
    public void SendingDisabled_NeverSends()
    {
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(Prospect(), DateTimeOffset.UtcNow, State(false), false);
        Assert.Equal("marketing_sending_disabled", gate.Reason);
    }

    [Fact]
    public void AlreadyContacted_UsesCooldownWindow()
    {
        var p = Prospect(lastContacted: DateTimeOffset.UtcNow.AddDays(-2));
        Assert.Equal("cooldown", CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, State(), true).Reason);
        var cooled = Prospect(lastContacted: DateTimeOffset.UtcNow.AddDays(-15));
        Assert.True(CreatorAcquisitionScoring.ExplainSendEligibility(cooled, DateTimeOffset.UtcNow, State(), true).Ok);
    }

    [Fact]
    public void Mime_IsUtf8AndHasUnsubscribeWithoutPiiTags()
    {
        var mime = CreatorAcquisitionMail.Build(
            Prospect(observation: "12 of your last 20 public videos have very short descriptions for search."),
            State(),
            "https://youtubeboosterai.com",
            "https://youtubeboosterai.com/api/public/acq/unsubscribe?token=abc",
            "https://youtubeboosterai.com/api/public/acq/go/tok");
        Assert.Contains("charset=UTF-8", mime.RawRfc822);
        Assert.Contains("List-Unsubscribe:", mime.RawRfc822);
        Assert.Contains("List-Unsubscribe-Post:", mime.RawRfc822);
        Assert.Contains("Hi Example Cook", mime.TextBody);
        Assert.Contains("We analyzed", mime.TextBody);
        Assert.Contains("YouTubeBooster AI", mime.TextBody);
        Assert.DoesNotContain("I ran", mime.TextBody);
        Assert.DoesNotContain("Max", mime.TextBody);
        Assert.DoesNotContain("Founder", mime.TextBody);
        Assert.Contains("VIEW YOUR FREE YOUTUBE AUDIT", mime.HtmlBody);
        Assert.DoesNotContain(">https://youtubeboosterai.com/api/public/acq/go/tok<", mime.HtmlBody);
        Assert.Contains("href=\"https://youtubeboosterai.com/api/public/acq/go/tok\"", mime.HtmlBody);
        Assert.Contains("View your free YouTube audit:", mime.TextBody);
        Assert.DoesNotContain("<script", mime.HtmlBody, StringComparison.OrdinalIgnoreCase);
        Assert.False(CreatorAcquisitionMail.TagsContainPii(mime.SesTags));
        Assert.DoesNotContain("hello@example-creator.test", string.Join(',', mime.SesTags.Select(kv => kv.Key + kv.Value)));
        Assert.Equal("YouTubeBooster AI <hello@youtubeboosterai.com>", mime.FromHeader);
        Assert.Equal("hello@youtubeboosterai.com", mime.ReplyTo);
        Assert.Equal(CreatorAcquisitionMail.DefaultFromName, CreatorAcquisitionMail.ResolveFromName("Max from YouTubeBooster"));
    }

    [Fact]
    public void Html_EscapesChannelName()
    {
        var html = CreatorAcquisitionMail.BuildHtml(
            "A <b>x</b>", "Cook & Co", "obs", "fix", "https://x.test/api/public/acq/go/t", "Cook & Co", "https://u.test", "Addr");
        Assert.Contains("Cook &amp; Co", html);
        Assert.Contains("A &lt;b&gt;x&lt;/b&gt;", html);
        Assert.DoesNotContain("<b>x</b>", html);
        Assert.Contains("VIEW YOUR FREE YOUTUBE AUDIT", html);
    }

    [Fact]
    public void Mojibake_NeedlesIncludeCommonSequences()
    {
        Assert.Contains("â€™", CreatorAcquisitionMail.MojibakeNeedles);
        Assert.Contains("Â", CreatorAcquisitionMail.MojibakeNeedles);
    }

    [Fact]
    public void Csv_ExcludesEmails()
    {
        var csv = CreatorAcquisitionScoring.SanitizedCsvHeader() + "\n" + CreatorAcquisitionScoring.SanitizedCsvRow(Prospect());
        Assert.False(CreatorAcquisitionScoring.CsvContainsEmail(csv));
        Assert.Equal("verified_public", CreatorAcquisitionScoring.ContactStatusLabel(Prospect()));
        Assert.Contains("Contact route available", CreatorAcquisitionScoring.ContactStatusLabel(Prospect(email: null, contactType: "form_only")));
    }

    [Fact]
    public void TagsSanitize_StripsEmailShapedValues()
    {
        Assert.True(CreatorAcquisitionMail.TagsContainPii(new Dictionary<string, string> { ["to"] = "a@b.com" }));
        Assert.False(CreatorAcquisitionMail.TagsContainPii(new Dictionary<string, string> { ["campaign"] = "COOK-001", ["purpose"] = "creator_acquisition" }));
        Assert.Equal("COOK-001", CreatorAcquisitionMail.SanitizeTag("COOK-001"));
    }

    [Fact]
    public void PlaceholderAndMissingPostal_BlockSend()
    {
        Assert.Equal("preview_placeholder", CreatorAcquisitionScoring.ExplainSendEligibility(Prospect(placeholder: true), DateTimeOffset.UtcNow, State(), false).Reason);
        var noPostal = State() with { PostalAddress = null };
        Assert.Equal("postal_address_missing", CreatorAcquisitionScoring.ExplainSendEligibility(Prospect(), DateTimeOffset.UtcNow, noPostal, false).Reason);
    }

    [Fact]
    public void ParseDemoFindings_ReadsTitleDescriptionCadence()
    {
        var (titles, descriptions, cadence) = CreatorAcquisitionScoring.ParseDemoFindings(
        [
            "8 of the last 20 videos have titles that are likely under-optimized for click-through because they are too short or too long.",
            "14 recent videos have weak descriptions, which is limiting discoverability and clarity for both viewers and search.",
            "The current upload rhythm averages one video every 5.2 days, which supports momentum."
        ]);
        Assert.Equal(8, titles);
        Assert.Equal(14, descriptions);
        Assert.Equal(5.2, cadence);
    }
}

public class OutreachPolicyTests
{
    [Fact]
    public void DailyLimit_DefaultsToTenAndCapsAtThirty()
    {
        Assert.Equal(10, OutreachPolicy.ClampDailyLimit(10));
        Assert.Equal(30, OutreachPolicy.ClampDailyLimit(99));
        Assert.Equal(10, OutreachPolicy.ResolveDailyLimit(null, null, null, 30));
    }

    [Fact]
    public void Ramp_AdvancesAfterThreeHealthyDays()
    {
        var health = OutreachPolicy.HealthFromCounts(30, 0, 0, 0);
        var d = OutreachPolicy.DecideRamp(10, 3, health, true, 30);
        Assert.True(d.Advance);
        Assert.Equal(20, d.NextStage);
        var d2 = OutreachPolicy.DecideRamp(20, 3, health, true, 30);
        Assert.Equal(30, d2.NextStage);
        var d3 = OutreachPolicy.DecideRamp(30, 3, health, true, 30);
        Assert.False(d3.Advance);
    }

    [Fact]
    public void Ramp_BlockedByBounceAndComplaint()
    {
        var bounce = OutreachPolicy.HealthFromCounts(100, 3, 0, 0);
        Assert.True(bounce.Unhealthy);
        Assert.Equal("bounce_rate", bounce.Reason);
        Assert.False(OutreachPolicy.DecideRamp(10, 3, bounce, true, 30).Advance);
        var complaint = OutreachPolicy.HealthFromCounts(1000, 0, 1, 0);
        Assert.Equal("complaint_rate", complaint.Reason);
        Assert.False(OutreachPolicy.DecideRamp(10, 3, complaint, true, 30).Advance);
    }

    [Fact]
    public void SmallSample_DoesNotRamp()
    {
        var health = OutreachPolicy.HealthFromCounts(2, 0, 0, 0);
        Assert.False(health.EnoughSample);
        Assert.False(OutreachPolicy.DecideRamp(10, 3, health, true, 30).Advance);
        Assert.Equal("sample_too_small", OutreachPolicy.DecideRamp(10, 3, health, true, 30).Reason);
    }

    [Fact]
    public void Variant_PersistsAndIsDeterministic()
    {
        var a = OutreachPolicy.AssignVariant("COOK-001-P001");
        Assert.Equal(a, OutreachPolicy.AssignVariant("COOK-001-P001"));
        Assert.Equal("A", OutreachPolicy.PersistVariant("A", "COOK-001-P099"));
        Assert.Equal("B", OutreachPolicy.PersistVariant("B", "COOK-001-P001"));
        Assert.Contains(a, new[] { "A", "B" });
    }

    [Fact]
    public void TrackedUrl_HasFounderAttribution()
    {
        var url = OutreachPolicy.BuildTrackedUrl("https://youtubeboosterai.com", "tok", "COOK-001-P001", "A", "2026-08-19");
        Assert.Contains("utm_source=founder_outreach", url);
        Assert.Contains("utm_medium=email", url);
        Assert.Contains("utm_campaign=cook_001", url);
        Assert.Contains("utm_content=A", url);
        Assert.Contains("utm_id=2026-08-19", url);
        Assert.Contains("/api/public/acq/go/tok", url);
    }

    [Fact]
    public void ConversionRates_ZeroDenominatorIsNa()
    {
        Assert.Equal("N/A", OutreachPolicy.RateOrNa(1, 0));
        Assert.Equal("50.0%", OutreachPolicy.RateOrNa(1, 2));
        Assert.Equal("N/A", OutreachPolicy.RevenuePer100(10, 0));
        Assert.Equal("$10.00", OutreachPolicy.RevenuePer100(1, 10));
    }

    [Fact]
    public void EvaluateOutreach_StaysCollectingUntilEvidence()
    {
        var ok = OutreachPolicy.HealthFromCounts(30, 0, 0, 0);
        Assert.Equal("COLLECTING", OutreachPolicy.EvaluateOutreach(10, 6, ok, 1, 1, 0, 0));
        Assert.Equal("INCONCLUSIVE", OutreachPolicy.EvaluateOutreach(100, 14, ok, 2, 1, 0, 0));
        Assert.Equal("KEEP", OutreachPolicy.EvaluateOutreach(100, 14, ok, 5, 3, 1, 1));
        var bad = OutreachPolicy.HealthFromCounts(100, 5, 0, 0);
        Assert.Equal("STOP", OutreachPolicy.EvaluateOutreach(100, 14, bad, 0, 0, 0, 0));
    }

    [Fact]
    public void SpamTrap_AndCustomerLikeInvalid()
    {
        Assert.True(OutreachPolicy.IsSpamTrapOrInvalid("noreply@brand.com"));
        Assert.False(OutreachPolicy.IsSpamTrapOrInvalid("hello@example-creator.test"));
    }

    [Fact]
    public void Subject_EncodesUtf8Middot()
    {
        var encoded = CreatorAcquisitionMail.EncodeSubject("YouTubeBooster Growth · Distribution executed");
        Assert.StartsWith("=?UTF-8?B?", encoded);
        var b64 = encoded["=?UTF-8?B?".Length..^2];
        var decoded = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(b64));
        Assert.Contains("·", decoded);
        Assert.DoesNotContain("Â", decoded);
    }

    [Fact]
    public void NormalizeSkipReason_MapsGateCodes()
    {
        Assert.Equal("COOLDOWN", OutreachPolicy.NormalizeSkipReason("cooldown"));
        Assert.Equal("INVALID_EMAIL", OutreachPolicy.NormalizeSkipReason("public_email_unverified"));
        Assert.Equal("NOT_APPROVED", OutreachPolicy.NormalizeSkipReason("approval_expired"));
        Assert.Equal("SES_ERROR", OutreachPolicy.NormalizeSkipReason("ses:Timeout"));
        Assert.Equal("DAILY_LIMIT_REACHED", OutreachPolicy.NormalizeSkipReason("daily_limit_reached"));
        Assert.Equal("ALREADY_CONTACTED", OutreachPolicy.NormalizeSkipReason("idempotency"));
        Assert.Equal("NOT_QUALIFIED", OutreachPolicy.NormalizeSkipReason("score_below_70"));
    }

    [Fact]
    public void AggregateSkipReasons_GroupsByCode()
    {
        var counts = OutreachPolicy.AggregateSkipReasons([
            "COOK-001-a:cooldown",
            "COOK-001-b:cooldown",
            "COOK-001-c:public_email_unverified",
            "COOK-001-d:ses:MessageRejected"
        ]);
        Assert.Equal(2, counts["COOLDOWN"]);
        Assert.Equal(1, counts["INVALID_EMAIL"]);
        Assert.Equal(1, counts["SES_REJECTED"]);
    }

    [Fact]
    public void DailyLimit_ClampStaysAt10UntilRamp()
    {
        Assert.Equal(10, OutreachPolicy.ClampDailyLimit(10, 30));
        Assert.Equal(10, OutreachPolicy.ClampDailyLimit(999, 10));
        Assert.Equal(20, OutreachPolicy.ClampDailyLimit(20, 30));
        Assert.Equal(30, OutreachPolicy.ClampDailyLimit(30, 30));
    }

    [Fact]
    public void InCooldown_UsesExclusiveDayBoundary()
    {
        var now = DateTimeOffset.Parse("2026-09-14T12:00:00Z");
        Assert.True(OutreachPolicy.InCooldown(now.AddDays(-13.9), now, 14));
        Assert.False(OutreachPolicy.InCooldown(now.AddDays(-14.1), now, 14));
    }
}
