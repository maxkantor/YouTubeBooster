using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class StripeCheckoutIdentityTests
{
    [Fact]
    public void CheckoutIconUrl_UsesPublicSiteAndStaticPath()
    {
        Assert.Equal(
            "https://youtubeboosterai.com/stripe-checkout-icon.png",
            StripeCheckoutIdentity.CheckoutIconUrl("https://youtubeboosterai.com"));
        Assert.Equal(
            "https://youtubeboosterai.com/stripe-checkout-icon.png",
            StripeCheckoutIdentity.CheckoutIconUrl("https://youtubeboosterai.com/"));
    }

    [Fact]
    public void DisplayName_IsYouTubeBoosterAI()
    {
        Assert.Equal("YouTubeBoosterAI", StripeCheckoutIdentity.DisplayName);
        Assert.StartsWith("YouTubeBoosterAI —", StripeCheckoutIdentity.ProductName);
        Assert.DoesNotContain("Images", StripeCheckoutIdentity.ProductDescription);
    }

    [Fact]
    public void SessionMetadata_IncludesAppIsolationFields()
    {
        var meta = StripeCheckoutIdentity.BuildSessionMetadata(
            isLiveSecretLikely: true,
            planCode: "premium",
            userId: "user_1",
            cognitoSub: "sub_1",
            channelInput: "@cook",
            priceVersion: "ytboosterai_default",
            utmSource: null,
            utmMedium: null,
            utmCampaign: null,
            referrer: null,
            ybOid: "oid123");
        Assert.Equal("youtubeboosterai", meta["app"]);
        Assert.Equal("YouTubeBoosterAI", meta["brand"]);
        Assert.Equal("production", meta["environment"]);
        Assert.Equal("one_time", meta["purchaseType"]);
        Assert.Equal("premium", meta["internalProductId"]);
        Assert.True(StripeCheckoutIdentity.IsThisApp(meta));
        Assert.False(StripeCheckoutIdentity.IsThisApp(new Dictionary<string, string> { ["app"] = "luckynumberslab" }));
    }
}
