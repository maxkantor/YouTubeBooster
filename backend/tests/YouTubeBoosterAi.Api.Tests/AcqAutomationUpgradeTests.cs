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
        Assert.Equal("ALREADY_CONTACTED", OutreachPolicy.NormalizeSkipReason("duplicate_email"));
    }

    private static AcqProspectRecord Prospect(string id, string email, string channelId) =>
        ReadyToSend(id, email, channelId) with { OutreachStatus = "draft_ready", ApprovalId = null };

    private static AcqProspectRecord ReadyToSend(string id, string email, string channelId)
    {
        var now = DateTimeOffset.UtcNow;
        var p = new AcqProspectRecord(
            id, "Example Cook", "@examplecook", "https://www.youtube.com/@examplecook", channelId,
            "cooking", "en", "US", 12000, 100, now.AddDays(-7), 5, "8k-20k", "https://example-creator.test",
            email, "https://example-creator.test/contact", now, "business",
            25, 25, 20, 85, "completed", "approved", null, "none",
            CreatorAcquisitionCampaigns.Cook001, "/api/public/acq/go/tok", "tok" + id,
            "https://www.youtube.com/@examplecook", now, "12 of your last 20 public videos have very short descriptions for search.",
            "For example, on \"Chicken stew,\" we'd test putting the dish and main benefit earlier.",
            "thin descriptions",
            "One idea for Example Cook's YouTube channel", "body", null, "APR-1", null, null,
            now, now, false);
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
                "A", "Example Cook", "Example Cook",
                "12 of your last 20 public videos have very short descriptions for search.",
                "For example, on \"Chicken stew,\" we'd test putting the dish and main benefit earlier.",
                "https://youtubeboosterai.com/api/public/acq/go/tok").Body
        };
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
