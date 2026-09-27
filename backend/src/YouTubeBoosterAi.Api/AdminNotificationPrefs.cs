namespace YouTubeBoosterAi.Api;

/// <summary>
/// Lightweight admin notification toggles. Default ON. Override via SSM:
/// admin/notify-contact, admin/notify-support, admin/notify-purchase (true/false/1/0/on/off).
/// </summary>
public static class AdminNotificationPrefs
{
    public const string ContactSubmitted = "CONTACT_SUBMITTED";
    public const string SupportCreated = "SUPPORT_CREATED";
    public const string PurchaseCompleted = "PURCHASE_COMPLETED";

    public static async Task<bool> IsEnabledAsync(
        ISecretValueProvider secrets,
        string eventName,
        CancellationToken cancellationToken)
    {
        var key = eventName.ToUpperInvariant() switch
        {
            ContactSubmitted or SupportCreated => "admin/notify-contact",
            PurchaseCompleted => "admin/notify-purchase",
            _ => null
        };
        if (key is null) return true;

        // Support-created shares contact toggle unless an explicit support key is set.
        if (string.Equals(eventName, SupportCreated, StringComparison.OrdinalIgnoreCase))
        {
            var supportOnly = await secrets.GetValueAsync("admin/notify-support", secure: false, cancellationToken);
            if (!string.IsNullOrWhiteSpace(supportOnly))
                return ParseBool(supportOnly, defaultValue: true);
        }

        var raw = await secrets.GetValueAsync(key, secure: false, cancellationToken);
        return ParseBool(raw, defaultValue: true);
    }

    public static bool IsMarketingSource(string? source) =>
        string.Equals(source, "founder_outreach", StringComparison.OrdinalIgnoreCase);

    public static bool IsContactLikeSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source)) return true;
        var s = source.Trim();
        if (IsMarketingSource(s)) return false;
        return s.Equals("contact_form", StringComparison.OrdinalIgnoreCase)
               || s.Equals("CONTACT_FORM", StringComparison.OrdinalIgnoreCase)
               || s.Equals("support", StringComparison.OrdinalIgnoreCase)
               || s.Equals("general", StringComparison.OrdinalIgnoreCase);
    }

    private static bool ParseBool(string? raw, bool defaultValue)
    {
        if (string.IsNullOrWhiteSpace(raw)) return defaultValue;
        var v = raw.Trim().ToLowerInvariant();
        return v switch
        {
            "0" or "false" or "off" or "no" or "disabled" => false,
            "1" or "true" or "on" or "yes" or "enabled" => true,
            _ => defaultValue
        };
    }
}
