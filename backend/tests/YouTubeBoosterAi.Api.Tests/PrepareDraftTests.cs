using System.Reflection;
using Amazon.SimpleEmail;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class PrepareDraftTests
{
    private static AcqProspectRecord Placeholder(
        string id,
        string handle,
        string? email,
        string? source = "https://example-creator.test/contact")
    {
        var now = DateTimeOffset.UtcNow;
        return new AcqProspectRecord(
            id, handle, handle, $"https://www.youtube.com/{handle}", null,
            "cooking", "en", null, 0, 0, null, null, null, source,
            email, source, now, "business",
            0, 0, 0, 0, "failed", "discovered", null, "none",
            CreatorAcquisitionCampaigns.Cook001, $"/api/public/acq/go/{id}", id[..Math.Min(16, id.Length)].PadRight(16, '0'),
            $"https://www.youtube.com/{handle}", null, null, null, "Public YouTube data could not be loaded.",
            null, null, null, null, null, null,
            now, now, PreviewPlaceholder: true);
    }

    private static AcqProspectRecord AnalyzedSibling(
        string id,
        string handle,
        string email,
        long subs = 69300,
        int score = 100,
        DateTimeOffset? recent = null)
    {
        recent ??= DateTimeOffset.UtcNow.AddDays(-5);
        var obs = "17 of your last 20 public videos have very short descriptions for search.";
        var improvement =
            "For example, on \"Grill Lobster Tails,\" we'd test putting the dish and main benefit earlier in the title and adding a short search-focused description.";
        var p = new AcqProspectRecord(
            id, handle.TrimStart('@'), handle, $"https://www.youtube.com/{handle}", "UCsibling",
            "cooking", "en", "US", subs, 100, recent, 5, "8k-20k", "https://example-creator.test",
            string.IsNullOrWhiteSpace(email) ? null : email, "https://example-creator.test/contact", DateTimeOffset.UtcNow, "business",
            25, 25, 20, score, "completed", "draft_ready", null, "none",
            CreatorAcquisitionCampaigns.Cook001, $"/api/public/acq/go/{id}", Guid.NewGuid().ToString("N")[..16],
            $"https://www.youtube.com/{handle}", DateTimeOffset.UtcNow, obs, improvement, "thin descriptions",
            "One idea for channel", "body", null, null, null, null,
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, false);
        return p with
        {
            SampleSize = 20,
            WeakDescriptionCount = 17,
            TitleIssueCount = 2,
            ExampleVideoTitle = "Grill Lobster Tails",
            FindingType = "DESCRIPTION_DEPTH",
            TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
            SubjectVariant = "A",
            MessageVariant = "brand_audit_v1",
            Body = CreatorAcquisitionCopy.Build("A", p.ChannelName, p.ChannelName, obs, improvement,
                "https://youtubeboosterai.com/api/public/acq/go/tok").Body
        };
    }

    private sealed class FakeDemo : IDemoAnalysisService
    {
        public Func<DemoAnalysisRequest, DemoAnalysisResponse>? Handler { get; set; }
        public int Calls { get; private set; }

        public Task<DemoAnalysisResponse> RunDemoAsync(DemoAnalysisRequest request, CancellationToken cancellationToken)
        {
            Calls++;
            if (Handler is not null) return Task.FromResult(Handler(request));
            throw new InvalidOperationException("demo_unavailable");
        }
    }

    private class SesProbe : DispatchProxy
    {
        public int SendRawCalls { get; private set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod?.Name is "SendRawEmailAsync" or "SendEmailAsync")
            {
                SendRawCalls++;
                throw new InvalidOperationException("SES must not be called during PrepareDraft");
            }
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

    private sealed class FakeSecrets : ISecretValueProvider
    {
        public Task<string?> GetValueAsync(string name, bool secure, CancellationToken cancellationToken) =>
            Task.FromResult<string?>(null);
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

    private static (CreatorAcquisitionService Svc, SesProbe Ses, FakeDemo Demo) CreateService(ICreatorAcquisitionStore store)
    {
        var demo = new FakeDemo();
        var (sesClient, sesProbe) = SesProbe.Create();
        var cfg = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["App:PublicSiteUrl"] = "https://youtubeboosterai.com",
                ["App:PublicApiUrl"] = "https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com",
                ["CreatorAcquisition:MarketingSendingEnabled"] = "false"
            })
            .Build();
        var svc = new CreatorAcquisitionService(
            store,
            new InMemoryAppDataStore(new EphemeralDataProtectionProvider()),
            demo,
            sesClient,
            new FakeSecrets(),
            cfg,
            new FakeDashboard(),
            new FakeHttpFactory());
        return (svc, sesProbe, demo);
    }

    [Fact]
    public async Task PrepareDraft_WithValidEmail_AndSiblingEvidence_CompletesOntoRequestedId()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var thin = Placeholder("COOK-001-252c430e", "@skinnytaste", "ginah2design@gmail.com", "https://www.skinnytaste.com/contact/");
        var rich = AnalyzedSibling("COOK-001-37563978", "@skinnytastegina", "ginah2design@gmail.com");
        await store.UpsertProspectAsync(thin, CancellationToken.None);
        await store.UpsertProspectAsync(rich, CancellationToken.None);

        var (svc, ses, _) = CreateService(store);
        var result = await svc.PrepareDraftAsync(thin.ProspectId, CancellationToken.None);

        Assert.True(result.DraftPrepared);
        Assert.NotNull(result.Prospect);
        Assert.Equal(thin.ProspectId, result.Prospect!.ProspectId);
        Assert.False(result.Prospect.PreviewPlaceholder);
        Assert.Equal("draft_ready", result.Prospect.OutreachStatus);
        Assert.False(string.IsNullOrWhiteSpace(result.Prospect.Subject));
        Assert.False(string.IsNullOrWhiteSpace(result.Prospect.Body));
        Assert.False(string.IsNullOrWhiteSpace(result.Prospect.Observation));
        Assert.Contains("of your last", result.Prospect.Observation!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("@skinnytaste", result.Prospect.Handle);
        Assert.True(CreatorAcquisitionScoring.IsReadyForApproval(result.Prospect));
        Assert.Equal(0, ses.SendRawCalls);
    }

    [Fact]
    public async Task PrepareDraft_PartialDraft_FillsMissingSubjectBody()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var partial = AnalyzedSibling("COOK-001-Ppartial", "@partialcook", "partial@cook.test") with
        {
            Subject = null,
            Body = null,
            OutreachStatus = "discovered",
            PreviewPlaceholder = false
        };
        await store.UpsertProspectAsync(partial, CancellationToken.None);
        var (svc, _, demo) = CreateService(store);
        var result = await svc.PrepareDraftAsync(partial.ProspectId, CancellationToken.None);
        Assert.True(result.DraftPrepared);
        Assert.False(string.IsNullOrWhiteSpace(result.Prospect!.Subject));
        Assert.False(string.IsNullOrWhiteSpace(result.Prospect.Body));
        Assert.Equal(0, demo.Calls);
    }

    [Fact]
    public async Task PrepareDraft_MissingResearch_ReturnsError()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        await store.UpsertProspectAsync(Placeholder("COOK-001-lonely", "@lonelycook", "lonely@cook.test"), CancellationToken.None);
        var (svc, _, _) = CreateService(store);
        var result = await svc.PrepareDraftAsync("COOK-001-lonely", CancellationToken.None);
        Assert.False(result.DraftPrepared);
        Assert.NotNull(result.Reason);
        Assert.True(
            result.Reason!.StartsWith("inspect_failed:", StringComparison.Ordinal)
            || result.Reason is "placeholder_inspection" or "missing_observation");
    }

    [Fact]
    public async Task PrepareDraft_MissingEmail_ReturnsMissingEmail()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        await store.UpsertProspectAsync(Placeholder("COOK-001-noemail", "@noemail", null), CancellationToken.None);
        var (svc, _, _) = CreateService(store);
        var result = await svc.PrepareDraftAsync("COOK-001-noemail", CancellationToken.None);
        Assert.False(result.DraftPrepared);
        Assert.Equal("missing_email", result.Reason);
    }

    [Fact]
    public async Task PrepareDraft_Suppressed_ReturnsSuppressed()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        await store.UpsertProspectAsync(
            Placeholder("COOK-001-supp", "@supp", "supp@cook.test") with { SuppressionStatus = "unsubscribed" },
            CancellationToken.None);
        var (svc, _, _) = CreateService(store);
        var result = await svc.PrepareDraftAsync("COOK-001-supp", CancellationToken.None);
        Assert.False(result.DraftPrepared);
        Assert.StartsWith("suppressed:", result.Reason);
    }

    [Fact]
    public async Task PrepareDraft_Idempotent_SecondClickDoesNotDuplicate()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var thin = Placeholder("COOK-001-252c430e", "@skinnytaste", "ginah2design@gmail.com");
        var rich = AnalyzedSibling("COOK-001-37563978", "@skinnytastegina", "ginah2design@gmail.com");
        await store.UpsertProspectAsync(thin, CancellationToken.None);
        await store.UpsertProspectAsync(rich, CancellationToken.None);
        var (svc, _, _) = CreateService(store);

        var first = await svc.PrepareDraftAsync(thin.ProspectId, CancellationToken.None);
        Assert.True(first.DraftPrepared);
        var subject1 = first.Prospect!.Subject;

        var second = await svc.PrepareDraftAsync(thin.ProspectId, CancellationToken.None);
        Assert.True(second.DraftPrepared);
        Assert.Equal("already_complete", second.Reason);
        Assert.Equal(subject1, second.Prospect!.Subject);
        Assert.Equal(2, (await store.ListProspectsAsync(CancellationToken.None)).Count);
    }

    [Fact]
    public async Task PrepareDraft_DoesNotMergeLooseHandleCelebritySibling()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        var thin = Placeholder("COOK-001-4a8c5701", "@detoxinista", "detoxinista@gmail.com");
        var celeb = AnalyzedSibling("COOK-001-a8a2e15b", "@detoxinistarecipes", "", subs: 113000, score: 44);
        await store.UpsertProspectAsync(thin, CancellationToken.None);
        await store.UpsertProspectAsync(celeb, CancellationToken.None);
        var (svc, _, _) = CreateService(store);
        var result = await svc.PrepareDraftAsync(thin.ProspectId, CancellationToken.None);
        Assert.False(result.DraftPrepared);
        var after = await store.GetProspectAsync(thin.ProspectId, CancellationToken.None);
        Assert.True(after!.PreviewPlaceholder);
        Assert.Equal(0, after.SubscriberCount);
    }

    [Fact]
    public async Task PrepareDraft_NeverInvokesSes()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        await store.UpsertProspectAsync(Placeholder("COOK-001-252c430e", "@skinnytaste", "ginah2design@gmail.com"), CancellationToken.None);
        await store.UpsertProspectAsync(AnalyzedSibling("COOK-001-37563978", "@skinnytastegina", "ginah2design@gmail.com"), CancellationToken.None);
        var (svc, ses, _) = CreateService(store);
        await svc.PrepareDraftAsync("COOK-001-252c430e", CancellationToken.None);
        Assert.Equal(0, ses.SendRawCalls);
    }

    [Fact]
    public async Task PrepareDraftBatch_PartialFailure_ReportsReasons()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        await store.UpsertProspectAsync(Placeholder("COOK-001-ok", "@okcook", "ok@cook.test"), CancellationToken.None);
        await store.UpsertProspectAsync(AnalyzedSibling("COOK-001-ok-sib", "@okcooksib", "ok@cook.test"), CancellationToken.None);
        await store.UpsertProspectAsync(Placeholder("COOK-001-bad", "@badcook", "bad@cook.test"), CancellationToken.None);
        var (svc, _, _) = CreateService(store);
        var batch = await svc.PrepareDraftBatchAsync(new AcqDraftPrepareBatchRequest(
            Campaign: CreatorAcquisitionCampaigns.Cook001,
            ProspectIds: ["COOK-001-ok", "COOK-001-bad"]), CancellationToken.None);
        Assert.Equal(2, batch.Attempted);
        Assert.Equal(1, batch.Prepared);
        Assert.Equal(1, batch.Failed);
        Assert.Contains(batch.Results, r => r.ProspectId == "COOK-001-ok" && r.DraftPrepared);
        Assert.Contains(batch.Results, r => r.ProspectId == "COOK-001-bad" && !r.DraftPrepared && r.Reason != null);
    }

    [Fact]
    public async Task PrepareDraft_StatusTransitionsToDraftReady_AndApprovalsReady()
    {
        var store = new InMemoryCreatorAcquisitionStore();
        await store.UpsertProspectAsync(Placeholder("COOK-001-252c430e", "@skinnytaste", "ginah2design@gmail.com"), CancellationToken.None);
        await store.UpsertProspectAsync(AnalyzedSibling("COOK-001-37563978", "@skinnytastegina", "ginah2design@gmail.com"), CancellationToken.None);
        var (svc, _, _) = CreateService(store);
        var result = await svc.PrepareDraftAsync("COOK-001-252c430e", CancellationToken.None);
        Assert.True(result.DraftPrepared);
        Assert.Equal("draft_ready", result.Prospect!.OutreachStatus);
        Assert.True(CreatorAcquisitionScoring.IsReadyForApproval(result.Prospect));
        Assert.Equal("draft_ready", CreatorAcquisitionScoring.MapView(result.Prospect));
    }
}
