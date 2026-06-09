using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class FunnelAnalyticsTests
{
    private static AdminActivityEventDto Evt(
        string name,
        string scope,
        string? userId = null,
        string? anonymousId = null,
        DateTimeOffset? at = null) =>
        new(name, scope, at ?? DateTimeOffset.UtcNow, new Dictionary<string, string?>
        {
            ["userId"] = userId,
            ["anonymousId"] = anonymousId
        });

    [Fact]
    public void RepeatedLoginEvents_CountAsOneUniqueActor()
    {
        var events = Enumerable.Range(0, 89)
            .Select(_ => Evt("user_login", "user_abc", userId: "user_abc"))
            .ToArray();

        var funnel = FunnelAnalytics.BuildFunnel(events, "all");
        var login = funnel.Steps.First(s => s.EventKey == "login_completed");
        Assert.Equal(1, login.UniqueActorCount);
        Assert.Equal(89, login.RawEventCount);
    }

    [Fact]
    public void RepeatedDemoCompleted_SameAnonymousId_CountsAsOneUniqueActor()
    {
        var events = Enumerable.Range(0, 10)
            .Select(_ => Evt("demo_completed", "https://youtube.com/@test", anonymousId: "anon_1"))
            .ToArray();

        var funnel = FunnelAnalytics.BuildFunnel(events, "all");
        var demo = funnel.Steps.First(s => s.EventKey == "demo_completed");
        Assert.Equal(1, demo.UniqueActorCount);
        Assert.Equal(10, demo.RawEventCount);
    }

    [Fact]
    public void Conversion_NeverExceeds100_WhenPreviousStepIsLarger()
    {
        var events = new[]
        {
            Evt("cognito_user_provisioned", "user_a", userId: "user_a"),
            Evt("user_login", "user_a", userId: "user_a"),
            Evt("user_login", "user_b", userId: "user_b")
        };

        var funnel = FunnelAnalytics.BuildFunnel(events, "all");
        var login = funnel.Steps.First(s => s.EventKey == "login_completed");
        Assert.Null(login.ConversionFromPreviousPct);
        Assert.NotNull(login.Warning);
    }

    [Fact]
    public void IdentityStitching_MergesAnonymousAndUserAcrossSteps()
    {
        var events = new[]
        {
            Evt("demo_completed", "https://youtube.com/@x", anonymousId: "anon_x"),
            Evt("signup_completed", "user_real", userId: "user_real", anonymousId: "anon_x")
        };

        var links = FunnelAnalytics.BuildIdentityLinks(events);
        Assert.Equal("user_real", links["anon_x"]);
    }

    [Fact]
    public void RangeFilter_ExcludesEventsOutsideWindow()
    {
        var now = DateTimeOffset.UtcNow;
        var events = new[]
        {
            Evt("demo_completed", "old", anonymousId: "a1", at: now.AddDays(-40)),
            Evt("demo_completed", "new", anonymousId: "a2", at: now.AddDays(-1))
        };

        var funnel = FunnelAnalytics.BuildFunnel(events, "30d");
        var demo = funnel.Steps.First(s => s.EventKey == "demo_completed");
        Assert.Equal(1, demo.UniqueActorCount);
        Assert.Equal(1, demo.RawEventCount);
    }

    [Fact]
    public void FindBiggestDropOff_PicksHighestDrop()
    {
        var events = new[]
        {
            Evt("demo_completed", "c1", anonymousId: "d1"),
            Evt("demo_completed", "c2", anonymousId: "d2"),
            Evt("cognito_user_provisioned", "user_1", userId: "user_1")
        };

        var funnel = FunnelAnalytics.BuildFunnel(events, "all");
        var insight = FunnelAnalytics.FindBiggestDropOff(funnel);
        Assert.NotNull(insight);
        Assert.True(insight!.DropOffPct >= 40);
    }
}
