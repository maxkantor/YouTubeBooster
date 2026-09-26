using System.Collections.Concurrent;
using System.Reflection;
using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class AcqAutomationUpgradeTests
{
    [Fact]
    public void ConfiguredDailyLimit_AllowsHundreds_WithoutChangingRampClamp()
    {
        Assert.Equal(10, OutreachPolicy.ClampDailyLimit(10));
        Assert.Equal(30, OutreachPolicy.ClampDailyLimit(99));
        Assert.Equal(200, OutreachPolicy.ClampConfiguredDailyLimit(200));
        Assert.Equal(500, OutreachPolicy.ClampConfiguredDailyLimit(900));
        Assert.Equal(1, OutreachPolicy.ClampConfiguredDailyLimit(0));
    }

    [Fact]
    public void IdempotencyKeys_AreStableAcrossManualAndScheduled()
    {
        var a = AcqSendGuard.IdempotencyKeys("COOK-001", "Same@Example.com", "UCabc", 0);
        var b = AcqSendGuard.IdempotencyKeys("cook-001", "same@example.com", "UCabc", 0);
        Assert.Equal(a, b);
        Assert.Contains("acq:initial:COOK-001:same@example.com", a);
        Assert.Contains("acq:initial:COOK-001:ch:UCabc", a);
        var fu = AcqSendGuard.IdempotencyKeys("COOK-001", "same@example.com", "UCabc", 1);
        Assert.Contains("acq:fu1:COOK-001:same@example.com", fu);
        Assert.DoesNotContain(a[0], fu);
    }

    [Fact]
    public async Task DuplicateEmail_OnlyOneIdentityClaimSucceeds()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var keys = AcqSendGuard.IdempotencyKeys("COOK-001", "same@example.com", "UCa", 0);
        Assert.True(await store.TryClaimIdempotencyAsync(keys[0], CancellationToken.None));
        var keysB = AcqSendGuard.IdempotencyKeys("COOK-001", "same@example.com", "UCb", 0);
        Assert.False(await store.TryClaimIdempotencyAsync(keysB[0], CancellationToken.None));
    }

    [Fact]
    public async Task ConcurrentClaims_OnlyOneWins()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var key = AcqSendGuard.IdempotencyKeys("COOK-001", "race@example.com", "UCrace", 0)[0];
        var results = new ConcurrentBag<bool>();
        await Task.WhenAll(
            Task.Run(async () => results.Add(await store.TryClaimIdempotencyAsync(key, CancellationToken.None))),
            Task.Run(async () => results.Add(await store.TryClaimIdempotencyAsync(key, CancellationToken.None))));
        Assert.Equal(1, results.Count(x => x));
        Assert.Equal(1, results.Count(x => !x));
    }

    [Fact]
    public void History_BlocksDuplicateEmailOnSameCampaign()
    {
        var a = Prospect("A", "same@example.com", "UCa") with { LastContactedAt = DateTimeOffset.UtcNow.AddDays(-1), OutreachStatus = "sent" };
        var b = Prospect("B", "same@example.com", "UCb");
        var reason = AcqSendGuard.HistoryBlockReason([a, b], b, followUpDue: false);
        Assert.Equal(AcqSendGuard.ReasonDuplicateEmail, reason);
    }

    [Fact]
    public async Task Unsubscribe_StopsRediscoveredAndOtherCampaigns()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var first = Prospect("COOK-001-old", "creator@channel.test", "UCold") with
        {
            LastContactedAt = DateTimeOffset.UtcNow.AddDays(-1),
            OutreachStatus = "sent"
        };
        await store.UpsertProspectAsync(first, CancellationToken.None);
        var (svc, ses) = CreateSendingService(store);
        await svc.UnsubscribeAsync("creator@channel.test", CancellationToken.None);

        var rediscovered = Prospect("TECH-RU-new", "creator@channel.test", "UCnew") with
        {
            Campaign = "RU-TECH-001",
            PrimaryNiche = "technology",
            Language = "ru"
        };
        await store.UpsertProspectAsync(rediscovered, CancellationToken.None);
        Assert.True(await svc.IsGloballyUnsubscribedAsync("creator@channel.test", CancellationToken.None));

        var preview = await svc.PreviewSendAsync(
            new AcqSendPreviewRequest("RU-TECH-001", [rediscovered.ProspectId]),
            CancellationToken.None);
        Assert.Equal(0, preview.WillSend);
        Assert.True(preview.Unsubscribed >= 1 || preview.Items.Any(i =>
            i.Reason == AcqSendGuard.ReasonGlobalUnsub));
        Assert.Equal(0, ses.SendRawCalls);
    }

    [Fact]
    public async Task DuplicateCreators_SameEmail_OneSend()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var a = ReadyToSend("A", "same@channel.test", "UCa");
        var b = ReadyToSend("B", "same@channel.test", "UCb");
        await store.UpsertProspectAsync(a, CancellationToken.None);
        await store.UpsertProspectAsync(b, CancellationToken.None);
        await store.SaveApprovalAsync(Approval(a, b), CancellationToken.None);
        var (svc, ses) = CreateSendingService(store);
        var first = await svc.SendNowAsync(a.ProspectId, "admin@test", CancellationToken.None);
        var second = await svc.SendNowAsync(b.ProspectId, "admin@test", CancellationToken.None);
        Assert.True(first.Ok, first.Error);
        Assert.False(second.Ok);
        Assert.True(second.Error is AcqSendGuard.ReasonDuplicateEmail or AcqSendGuard.ReasonAlreadyContacted or AcqSendGuard.ReasonAlreadyProcessing);
        Assert.Equal(1, ses.SendRawCalls);
    }

    [Fact]
    public async Task ConcurrentManualAndAutomatic_OneSend()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var p = ReadyToSend("race", "race@channel.test", "UCrace");
        await store.UpsertProspectAsync(p, CancellationToken.None);
        await store.SaveApprovalAsync(Approval(p), CancellationToken.None);
        var (svc, ses) = CreateSendingService(store);
        var t1 = svc.SendNowAsync(p.ProspectId, "admin@test", CancellationToken.None);
        var t2 = svc.SendNowAsync(p.ProspectId, "scheduler", CancellationToken.None);
        var r1 = await t1;
        var r2 = await t2;
        Assert.Equal(1, ses.SendRawCalls);
        Assert.True(r1.Ok ^ r2.Ok, $"r1={r1.Ok}/{r1.Error} r2={r2.Ok}/{r2.Error}");
    }

    [Fact]
    public void NewCampaigns_DefaultManualAndDryRun()
    {
        var row = new AcqCampaignConfig(
            "RU-TECH-001", "RU-TECH-001", "technology", "ru", "", null, 100, false, DateTimeOffset.UtcNow);
        Assert.Equal("manual", row.SendingMode);
        Assert.True(row.DryRun);
        Assert.False(row.AutoSend);
    }

    [Fact]
    public void NormalizeSkip_GlobalUnsubIsStable()
    {
        Assert.Equal("GLOBAL_SUPPRESSION_UNSUBSCRIBED", OutreachPolicy.NormalizeSkipReason("GLOBAL_SUPPRESSION_UNSUBSCRIBED"));
        Assert.Equal("ALREADY_CONTACTED", OutreachPolicy.NormalizeSkipReason("already_processing"));
        Assert.Equal("DUPLICATE_EMAIL", OutreachPolicy.NormalizeSkipReason("duplicate_email"));
    }

    [Fact]
    public async Task EnsureCook001_PersistsLimit100_AndAutomaticFlags()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, _) = CreateSendingService(store);
        var cfg = await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        Assert.Equal(100, cfg.DailyLimit);
        Assert.Equal("automatic", cfg.SendingMode);
        Assert.True(cfg.AutoSend);
        Assert.False(cfg.DryRun);
        Assert.True(cfg.AutoDiscover);
        Assert.True(cfg.AutoFindEmails);
        Assert.True(cfg.AutoPrepareDrafts);
        Assert.True(cfg.AutoFollowUps);
        var again = await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        Assert.Equal(100, again.DailyLimit);
        var state = await svc.LoadStateAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None);
        Assert.Equal(100, state.DailyLimit);
        Assert.True(state.StandingCampaignApproval);
        Assert.True(state.MaxDailyLimit >= 100);
    }

    [Fact]
    public async Task AutomaticProspect_BypassesApproval_InPreview()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, ses) = CreateSendingService(store);
        await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        var p = Prospect("auto-1", "auto@channel.test", "UCauto1");
        await store.UpsertProspectAsync(p, CancellationToken.None);
        var preview = await svc.PreviewSendAsync(
            new AcqSendPreviewRequest(CreatorAcquisitionCampaigns.Cook001, [p.ProspectId]),
            CancellationToken.None);
        Assert.True(preview.Eligible >= 1, string.Join(",", preview.Items.Select(i => i.Reason)));
        Assert.True(preview.WillSend >= 1);
        Assert.Equal(0, ses.SendRawCalls);
        var why = CreatorAcquisitionService.WhyNotSentCode(
            p, DateTimeOffset.UtcNow,
            await svc.LoadStateAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None));
        Assert.Equal("READY_TO_SEND", why);
    }

    [Fact]
    public async Task ManualCampaign_RequiresApproval()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, _) = CreateSendingService(store);
        await svc.UpsertCampaignConfigAsync(new AcqCampaignConfigRequest(
            Name: "RU-TECH-001",
            Category: "technology",
            Language: "ru",
            DailyLimit: 50,
            SendingEnabled: true,
            CampaignId: "RU-TECH-001",
            SendingMode: "manual",
            DryRun: true,
            AutoSend: false), CancellationToken.None);
        var p = Prospect("man-1", "manual@channel.test", "UCman1") with
        {
            Campaign = "RU-TECH-001",
            PrimaryNiche = "technology",
            Language = "ru"
        };
        await store.UpsertProspectAsync(p, CancellationToken.None);
        var preview = await svc.PreviewSendAsync(
            new AcqSendPreviewRequest("RU-TECH-001", [p.ProspectId]),
            CancellationToken.None);
        Assert.Equal(0, preview.WillSend);
        Assert.Contains(preview.Items, i =>
            i.Reason == "not_approved"
            || OutreachPolicy.NormalizeSkipReason(i.Reason) == "MANUAL_APPROVAL_REQUIRED");
        var state = await svc.LoadStateAsync("RU-TECH-001", CancellationToken.None);
        Assert.False(state.StandingCampaignApproval);
        Assert.Equal("MANUAL_APPROVAL_REQUIRED", CreatorAcquisitionService.WhyNotSentCode(p, DateTimeOffset.UtcNow, state));
    }

    [Fact]
    public async Task DryRun_SendsZero_AndCountsWouldSend()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, ses) = CreateSendingService(store);
        await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        var p = ReadyToSend("dry-1", "dry@channel.test", "UCdry1");
        await store.UpsertProspectAsync(p, CancellationToken.None);
        await store.SaveApprovalAsync(Approval(p), CancellationToken.None);
        var result = await svc.RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None, true);
        Assert.True(result.DryRun);
        Assert.Equal(0, result.Sent);
        Assert.Equal(0, result.SesAttempted);
        Assert.True(result.WouldSend >= 1);
        Assert.Equal(0, ses.SendRawCalls);
    }

    [Fact]
    public void WhyNotSent_InvalidEmail_IsPreSes()
    {
        var p = Prospect("inv", "not-an-email", "UCinv") with { PublicBusinessEmail = "not-an-email" };
        var state = new AcqCampaignState(true, false, 100, null, 0, "addr", "from@x.com", "YouTubeBooster AI", "from@x.com", null, 100, false, 14, 10, true, null, true);
        Assert.Equal("INVALID_EMAIL", CreatorAcquisitionService.WhyNotSentCode(p, DateTimeOffset.UtcNow, state));
    }

    [Fact]
    public void RediscoveredAlreadyEmailedCreator_IsNotNeedsApproval()
    {
        var sent = ReadyToSend("old", "same@channel.test", "UCsame") with
        {
            LastContactedAt = DateTimeOffset.UtcNow.AddDays(-30),
            OutreachStatus = "sent"
        };
        var rediscovered = Prospect("new", "same@channel.test", "UCsame");
        var inherited = AcqSendGuard.InheritPriorContact(rediscovered, [sent, rediscovered]);
        Assert.Equal(sent.LastContactedAt, inherited.LastContactedAt);
        Assert.False(CreatorAcquisitionScoring.IsReadyForApproval(inherited));

        var state = new AcqCampaignState(true, false, 100, null, 0, "addr", "from@x.com", "YouTubeBooster AI", "from@x.com", null, 100, false, 14, 10, true, null, true);
        var now = DateTimeOffset.UtcNow;
        Assert.Equal("sent", CreatorAcquisitionService.SendLaneFor(rediscovered, now, state, [sent, rediscovered]));
        Assert.NotEqual("needs_approval", CreatorAcquisitionService.SendLaneFor(rediscovered, now, state, [sent, rediscovered]));
        Assert.Equal("DUPLICATE_EMAIL", CreatorAcquisitionService.WhyNotSentCode(rediscovered, now, state, [sent, rediscovered]));
    }

    [Fact]
    public async Task AutomaticCook001_TenQualifiedDrafts_SendWithoutApprove()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, ses) = CreateSendingService(store);
        await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        var now = DateTimeOffset.UtcNow;
        var rows = new List<AcqProspectRecord>();
        for (var i = 1; i <= 10; i++)
        {
            var p = Prospect($"auto-{i}", $"auto{i}@channel.test", $"UCauto{i}");
            rows.Add(p);
            await store.UpsertProspectAsync(p, CancellationToken.None);
        }

        var promoted = await svc.PromoteAutomaticReadyDraftsAsync(
            CreatorAcquisitionCampaigns.Cook001, null, CancellationToken.None);
        Assert.Equal(10, promoted);

        var state = await svc.LoadStateAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None);
        Assert.True(state.StandingCampaignApproval);
        Assert.False(state.RampEnabled);
        var all = (await store.ListProspectsAsync(CancellationToken.None)).ToList();
        var needs = all.Count(p => CreatorAcquisitionService.SendLaneFor(p, now, state, all) == "needs_approval");
        var ready = all.Count(p => CreatorAcquisitionService.SendLaneFor(p, now, state, all) == "ready_to_send");
        Assert.Equal(0, needs);
        Assert.Equal(10, ready);
        Assert.All(all, p => Assert.False(CreatorAcquisitionScoring.IsReadyForApproval(p)));

        var first = await svc.RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None, false);
        Assert.Equal(10, first.SesAttempted);
        Assert.Equal(10, first.Sent);
        Assert.Equal(10, ses.SendRawCalls);
        Assert.All(await store.ListProspectsAsync(CancellationToken.None), p =>
        {
            Assert.NotNull(p.LastContactedAt);
            Assert.False(string.IsNullOrWhiteSpace(p.LastSesMessageId));
        });

        var again = await svc.RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None, false);
        Assert.Equal(0, again.SesAttempted);
        Assert.Equal(0, again.Sent);
        Assert.Equal(10, ses.SendRawCalls);
        Assert.All(await store.ListProspectsAsync(CancellationToken.None), p =>
        {
            Assert.NotNull(p.LastContactedAt);
            Assert.False(string.IsNullOrWhiteSpace(p.LastSesMessageId));
        });
    }

    [Fact]
    public async Task AutomaticCook001_DoesNotPromoteOffAudienceDrafts()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, _) = CreateSendingService(store);
        await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        var fitness = Prospect("fit-1", "fit@channel.test", "UCfit") with { PrimaryNiche = "fitness" };
        await store.UpsertProspectAsync(fitness, CancellationToken.None);
        var promoted = await svc.PromoteAutomaticReadyDraftsAsync(
            CreatorAcquisitionCampaigns.Cook001, null, CancellationToken.None);
        Assert.Equal(0, promoted);
        var after = await store.GetProspectAsync(fitness.ProspectId, CancellationToken.None);
        Assert.Equal("draft_ready", after!.OutreachStatus);
    }

    [Fact]
    public async Task AutomaticCook001_MixedEligibility_OnlyValidQualifiedReachesSes()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var (svc, ses) = CreateSendingService(store);
        await svc.EnsureCook001PersistedAsync(CancellationToken.None);
        var valid = Prospect("mix-ok", "ok@channel.test", "UCok");
        var invalid = Prospect("mix-inv", "not-an-email", "UCinv") with { PublicBusinessEmail = "not-an-email" };
        var suppressed = Prospect("mix-sup", "sup@channel.test", "UCsup") with { SuppressionStatus = "unsubscribed", OutreachStatus = "unsubscribed" };
        var already = Prospect("mix-old", "old@channel.test", "UCold") with
        {
            LastContactedAt = DateTimeOffset.UtcNow.AddDays(-20),
            OutreachStatus = "sent"
        };
        var duplicate = Prospect("mix-dup", "old@channel.test", "UCdup");
        var lowScore = Prospect("mix-low", "low@channel.test", "UClow") with { PriorityScore = 40 };
        foreach (var p in new[] { valid, invalid, suppressed, already, duplicate, lowScore })
            await store.UpsertProspectAsync(p, CancellationToken.None);

        await svc.PromoteAutomaticReadyDraftsAsync(CreatorAcquisitionCampaigns.Cook001, null, CancellationToken.None);
        var result = await svc.RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, CancellationToken.None, false);
        Assert.Equal(1, ses.SendRawCalls);
        Assert.Equal(1, result.SesAttempted);
        Assert.Equal(1, result.Sent);
        var sent = await store.GetProspectAsync(valid.ProspectId, CancellationToken.None);
        Assert.NotNull(sent!.LastSesMessageId);
        Assert.Null((await store.GetProspectAsync(invalid.ProspectId, CancellationToken.None))!.LastSesMessageId);
        Assert.Null((await store.GetProspectAsync(lowScore.ProspectId, CancellationToken.None))!.LastSesMessageId);
    }

    [Fact]
    public void FollowUpStops_OnReplyUnsubBounceComplaintAndCap()
    {
        var now = DateTimeOffset.UtcNow;
        var due = ReadyToSend("fu", "fu@channel.test", "UCfu") with
        {
            LastContactedAt = now.AddDays(-5),
            OutreachStatus = "sent",
            FollowUpStep = 0,
            NextFollowUpAt = now.AddMinutes(-1)
        };
        Assert.True(CreatorAcquisitionScoring.IsFollowUpDue(due, now));
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(due with { OutreachStatus = "replied" }, now));
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(due with { OutreachStatus = "customer" }, now));
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(due with { SuppressionStatus = "unsubscribed", OutreachStatus = "unsubscribed" }, now));
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(due with { SuppressionStatus = "bounced" }, now));
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(due with { SuppressionStatus = "complained" }, now));
        Assert.False(CreatorAcquisitionScoring.IsFollowUpDue(due with { FollowUpStep = 2 }, now));
    }

    [Fact]
    public void ReadyToSendCounters_UseSameLane()
    {
        var now = DateTimeOffset.UtcNow;
        var state = new AcqCampaignState(true, false, 100, null, 0, "addr", "from@x.com", "YouTubeBooster AI", "from@x.com", null, 100, false, 14, 10, true, null, true);
        var ready = ReadyToSend("r1", "r1@channel.test", "UCr1") with { OutreachStatus = "draft_ready", ApprovalId = null };
        var draftOther = ReadyToSend("r2", "r2@channel.test", "UCr2") with { PrimaryNiche = "fitness", OutreachStatus = "draft_ready", ApprovalId = null };
        var all = new[] { ready, draftOther };
        var cookReady = all.Count(p =>
            string.Equals(p.PrimaryNiche, "cooking", StringComparison.OrdinalIgnoreCase)
            && CreatorAcquisitionService.SendLaneFor(p, now, state, all) == "ready_to_send");
        var cookNeeds = all.Count(p =>
            string.Equals(p.PrimaryNiche, "cooking", StringComparison.OrdinalIgnoreCase)
            && CreatorAcquisitionService.SendLaneFor(p, now, state, all) == "needs_approval");
        Assert.Equal(1, cookReady);
        Assert.Equal(0, cookNeeds);
        Assert.Equal("READY_TO_SEND", CreatorAcquisitionService.WhyNotSentCode(ready, now, state, all));
    }

    [Fact]
    public void SkipAndSesCounters_DistinguishAppBlockFromSes()
    {
        var counts = OutreachPolicy.AggregateSkipReasons([
            "p1:invalid_or_spamtrap",
            "p2:already_contacted",
            "p3:ses:MessageRejected"
        ]);
        Assert.Equal(1, counts["INVALID_EMAIL"]);
        Assert.Equal(1, counts["ALREADY_CONTACTED"]);
        Assert.Equal(1, counts["SES_REJECTED"]);
        Assert.DoesNotContain("SES_ERROR", counts.Keys.Where(k => counts[k] > 0 && k == "SES_BLOCKED"));
    }

    private static AcqProspectRecord Prospect(string id, string email, string channelId) =>
        ReadyToSend(id, email, channelId) with { OutreachStatus = "draft_ready", ApprovalId = null };

    private static AcqProspectRecord ReadyToSend(string id, string email, string channelId)
    {
        var now = DateTimeOffset.UtcNow;
        var token = ("tok" + id).PadRight(32, 'a')[..32];
        var observation = "12 of your last 20 public videos have very short descriptions for search.";
        var improvement = "For example, on \"Chicken stew,\" we'd test putting the dish and main benefit earlier.";
        var copy = CreatorAcquisitionCopy.Build(
            "A", "Example Cook", "Example Cook", observation, improvement,
            $"https://youtubeboosterai.com/api/public/acq/go/{token}");
        var p = new AcqProspectRecord(
            id, "Example Cook", "@examplecook", "https://www.youtube.com/@examplecook", channelId,
            "cooking", "en", "US", 12000, 100, now.AddDays(-7), 5, "8k-20k", "https://example-creator.test",
            email, "https://example-creator.test/contact", now, "business",
            25, 25, 20, 85, "completed", "approved", null, "none",
            CreatorAcquisitionCampaigns.Cook001, $"/api/public/acq/go/{token}", token,
            "https://www.youtube.com/@examplecook", now, observation, improvement,
            "thin descriptions",
            copy.Subject, copy.Body, null, "APR-1", null, null,
            now, now, false);
        var stamped = p with
        {
            SampleSize = 20,
            WeakDescriptionCount = 12,
            TitleIssueCount = 2,
            ExampleVideoTitle = "Chicken stew",
            FindingType = "DESCRIPTION_DEPTH",
            TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
            SubjectVariant = "A",
            MessageVariant = "personalized_audit_v1",
            AuditGeneratedAt = now,
            AnalysisTimestamp = now,
            AnalysisVersion = CreatorAcquisitionOpportunity.AnalysisVersion,
            AnalyzedVideoTitle = "Chicken stew"
        };
        var baseScore = CreatorAcquisitionScoring.Score(new AcqScoreInput(
            stamped.SubscriberCount, stamped.RecentUploadAt, now,
            stamped.WeakDescriptionCount, stamped.TitleIssueCount, stamped.SampleSize,
            true, true, "en", true, false, false, false, false));
        var opp = CreatorAcquisitionOpportunity.Build(
            baseScore, stamped.WeakDescriptionCount, stamped.TitleIssueCount, stamped.SampleSize,
            stamped.ExampleVideoTitle, stamped.FindingType, "en");
        stamped = stamped with
        {
            OpportunityEvidenceJson = CreatorAcquisitionOpportunity.ToJson(opp),
            PersonalizationConfidence = opp.PersonalizationConfidence,
            PrimaryOpportunity = opp.PrimaryOpportunity,
            PriorityScore = Math.Max(85, opp.Score)
        };
        return stamped with { ContentHash = CreatorAcquisitionScoring.ContentHash(stamped with { ContentHash = null }) };
    }

    private static AcqApprovalRecord Approval(params AcqProspectRecord[] rows) =>
        new(
            "APR-1",
            "admin@test",
            DateTimeOffset.UtcNow,
            CreatorAcquisitionCampaigns.Cook001,
            rows.Select(r => r.ProspectId).ToArray(),
            rows.ToDictionary(r => r.ProspectId, r => r.ContentHash ?? CreatorAcquisitionScoring.ContentHash(r), StringComparer.OrdinalIgnoreCase),
            "v1",
            50,
            DateTimeOffset.UtcNow.AddDays(7));

    private static (CreatorAcquisitionService Svc, SesProbe Ses) CreateSendingService(ICreatorAcquisitionStore store)
    {
        store.SaveCampaignFlagsAsync(CreatorAcquisitionCampaigns.Cook001, true, false, CancellationToken.None).GetAwaiter().GetResult();
        var (sesClient, sesProbe) = SesProbe.Create();
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["App:PublicSiteUrl"] = "https://youtubeboosterai.com",
                ["App:PublicApiUrl"] = "https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com",
                ["CreatorAcquisition:MarketingSendingEnabled"] = "true"
            })
            .Build();
        var svc = new CreatorAcquisitionService(
            store,
            new InMemoryAppDataStore(new EphemeralDataProtectionProvider()),
            new FakeDemo(),
            sesClient,
            new SendingSecrets(),
            cfg,
            new FakeDashboard(),
            new FakeHttpFactory());
        return (svc, sesProbe);
    }

    private sealed class SendingSecrets : ISecretValueProvider
    {
        public Task<string?> GetValueAsync(string name, bool secure, CancellationToken cancellationToken) =>
            Task.FromResult<string?>(name switch
            {
                "outreach/marketing-sending-enabled" => "true",
                "ses/outreach-from-email" or "ses/from-email" => "hello@youtubeboosterai.com",
                "ses/outreach-from-name" => "YouTubeBooster AI",
                "ses/outreach-reply-to" => "hello@youtubeboosterai.com",
                "business/postal-address" => "123 Example St, Wilmington, DE 19801",
                "outreach/unsubscribe-hmac" => "test-hmac-key-for-unsubscribe-tokens-32b",
                _ => null
            });
    }

    private sealed class FakeDemo : IDemoAnalysisService
    {
        public Task<DemoAnalysisResponse> RunDemoAsync(DemoAnalysisRequest request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("demo_unavailable");
    }

    private sealed class FakeDashboard : IPublicDashboardService
    {
        public Task<PublicChannelAnalyzeResponse> AnalyzeChannelAsync(string channelInput, int days, CancellationToken cancellationToken) =>
            throw new NotImplementedException();
        public Task<IReadOnlyList<PublicVideoDto>> GetVideosAsync(string channelInput, int maxResults, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<PublicVideoDto>>([]);
        public Task<PublicChannelSuggestionsResponse> GetSuggestionsAsync(string channelInput, int topN, CancellationToken cancellationToken) =>
            throw new NotImplementedException();
        public Task<PublicVideoSeoResponse> GetVideoSeoAsync(string channelInput, string videoId, CancellationToken cancellationToken) =>
            throw new NotImplementedException();
        public Task<PublicChannelTrafficToolsResponse> GetTrafficToolsAsync(string channelInput, CancellationToken cancellationToken) =>
            throw new NotImplementedException();
    }

    private sealed class FakeHttpFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private class SesProbe : DispatchProxy
    {
        public int SendRawCalls { get; private set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod?.Name is "SendRawEmailAsync")
            {
                SendRawCalls++;
                return Task.FromResult(new SendRawEmailResponse { MessageId = "ses-test-" + SendRawCalls });
            }
            if (targetMethod?.Name == "GetSendQuotaAsync")
                return Task.FromResult(new GetSendQuotaResponse { Max24HourSend = 50000, MaxSendRate = 14, SentLast24Hours = 0 });
            if (targetMethod?.Name == "get_Config")
                return null;
            if (targetMethod?.ReturnType == typeof(void))
                return null;
            if (targetMethod?.ReturnType.IsGenericType == true
                && targetMethod.ReturnType.GetGenericTypeDefinition() == typeof(Task<>))
            {
                var t = targetMethod.ReturnType.GetGenericArguments()[0];
                return typeof(Task).GetMethod(nameof(Task.FromResult))!
                    .MakeGenericMethod(t)
                    .Invoke(null, [t.IsValueType ? Activator.CreateInstance(t)! : null]);
            }
            if (targetMethod?.ReturnType == typeof(Task))
                return Task.CompletedTask;
            return targetMethod?.ReturnType.IsValueType == true
                ? Activator.CreateInstance(targetMethod.ReturnType)
                : null;
        }

        public static (IAmazonSimpleEmailService Client, SesProbe Probe) Create()
        {
            var client = Create<IAmazonSimpleEmailService, SesProbe>();
            return (client, (SesProbe)(object)client);
        }
    }
}
