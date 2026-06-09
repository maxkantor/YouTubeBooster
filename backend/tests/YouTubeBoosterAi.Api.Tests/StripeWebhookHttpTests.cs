using Microsoft.AspNetCore.Http;
using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class StripeWebhookHttpTests
{
    [Fact]
    public void ResolveStripeSignature_JoinsCommaSeparatedValues()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers[StripeWebhookHttp.SignatureHeaderName] = new Microsoft.Extensions.Primitives.StringValues(
            new[] { "t=1614555115", "v1=abc123", "v0=test" });

        var signature = StripeWebhookHttp.ResolveStripeSignature(context.Request);

        Assert.Equal("t=1614555115,v1=abc123,v0=test", signature);
    }

    [Fact]
    public void ResolveStripeSignature_ReadsLowercaseHeader()
    {
        var context = new DefaultHttpContext();
        context.Request.Headers["stripe-signature"] = "t=1,v1=signed";

        var signature = StripeWebhookHttp.ResolveStripeSignature(context.Request);

        Assert.Equal("t=1,v1=signed", signature);
    }
}
