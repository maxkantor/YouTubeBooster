namespace YouTubeBoosterAi.Api;

/// <summary>
/// YouTubeBoosterAI-specific Stripe Checkout copy and metadata (per-session only; never account-wide).
/// Pattern mirrored from LuckyNumbersLab StripeCheckoutIdentity.
/// </summary>
public static class StripeCheckoutIdentity
{
    public const string AppKey = "youtubeboosterai";
    public const string DisplayName = "YouTubeBoosterAI";
    public const string CheckoutIconPath = "/stripe-checkout-icon.png";

    public const string PurchaseTypeOneTime = "one_time";
    public const string InternalProductIdPremium = "premium";
    public const string PlanPremium = "premium";

    public const string ProductName = "YouTubeBoosterAI — Full Channel Audit & Growth Plan";
    public const string ProductDescription =
        "Unlock your full AI-powered YouTube channel audit, growth insights, and optimization recommendations.";

    public static string CheckoutIconUrl(string publicSiteUrl) =>
        $"{(publicSiteUrl ?? "https://youtubeboosterai.com").TrimEnd('/')}{CheckoutIconPath}";

    /// <summary>
    /// Fulfillment-critical fields plus YBAI isolation metadata. Avoids putting unnecessary PII into Stripe.
    /// </summary>
    public static Dictionary<string, string> BuildSessionMetadata(
        bool isLiveSecretLikely,
        string planCode,
        string? userId,
        string? cognitoSub,
        string? channelInput,
        string? priceVersion,
        string? utmSource,
        string? utmMedium,
        string? utmCampaign,
        string? referrer,
        string? ybOid)
    {
        var meta = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["app"] = AppKey,
            ["brand"] = DisplayName,
            ["environment"] = isLiveSecretLikely ? "production" : "test",
            ["purchaseType"] = PurchaseTypeOneTime,
            ["plan"] = string.IsNullOrWhiteSpace(planCode) ? PlanPremium : planCode.Trim(),
            ["planCode"] = string.IsNullOrWhiteSpace(planCode) ? PlanPremium : planCode.Trim(),
            ["internalProductId"] = InternalProductIdPremium,
            ["userId"] = userId ?? string.Empty,
            ["cognitoSub"] = cognitoSub ?? string.Empty,
            ["channelInput"] = channelInput ?? string.Empty,
            ["priceVersion"] = priceVersion ?? string.Empty,
            ["utmSource"] = utmSource ?? string.Empty,
            ["utmMedium"] = utmMedium ?? string.Empty,
            ["utmCampaign"] = utmCampaign ?? string.Empty,
            ["referrer"] = referrer ?? string.Empty,
            ["ybOid"] = ybOid ?? string.Empty
        };
        return meta;
    }

    public static Dictionary<string, string> BuildPaymentIntentMetadata(IReadOnlyDictionary<string, string> sessionMeta)
    {
        var keys = new[] { "app", "brand", "environment", "purchaseType", "plan", "planCode", "internalProductId", "userId", "cognitoSub", "ybOid" };
        var meta = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var key in keys)
        {
            if (sessionMeta.TryGetValue(key, out var value))
                meta[key] = value;
        }
        return meta;
    }

    public static bool IsThisApp(IDictionary<string, string>? metadata)
    {
        if (metadata is null) return false;
        if (!metadata.TryGetValue("app", out var app)) return false;
        return string.Equals(app, AppKey, StringComparison.OrdinalIgnoreCase);
    }
}
