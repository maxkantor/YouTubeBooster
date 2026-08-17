using System.Net;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

public static class CreatorAcquisitionContact
{
    private static readonly Regex EmailRegex = new(
        @"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] BlockedHosts =
    [
        "socialblade.com", "playboard.co", "reachranking.com", "scoutyhub.com",
        "maxoteka.ru", "tydyvy.com", "facebook.com", "instagram.com", "tiktok.com",
        "linkedin.com", "vk.com", "ok.ru"
    ];

    public static bool IsGuessed(string? email, string? sourceUrl) =>
        EmailAddressHelpers.LooksLikeEmail(email) && string.IsNullOrWhiteSpace(sourceUrl);

    public static IReadOnlyList<string> ExtractVisibleEmails(string html, string pageUrl)
    {
        if (string.IsNullOrWhiteSpace(html) || !IsAllowedSource(pageUrl))
            return [];

        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var match in EmailRegex.Matches(html).Cast<Match>())
        {
            var email = WebUtility.HtmlDecode(match.Value).Trim().TrimEnd('.').ToLowerInvariant();
            if (!EmailAddressHelpers.LooksLikeEmail(email)) continue;
            if (email.EndsWith(".png", StringComparison.Ordinal) || email.EndsWith(".jpg", StringComparison.Ordinal))
                continue;
            found.Add(email);
        }

        return found.ToArray();
    }

    public static bool IsAllowedSource(string? url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme is not "https" and not "http") return false;
        var host = uri.Host.ToLowerInvariant();
        if (BlockedHosts.Any(b => host == b || host.EndsWith("." + b, StringComparison.Ordinal)))
            return false;
        return true;
    }

    public static string ClassifyContactType(string pageUrl, string html)
    {
        var blob = (pageUrl + " " + html).ToLowerInvariant();
        if (blob.Contains("partnership") || blob.Contains("work with") || blob.Contains("collab"))
            return "partnership";
        if (blob.Contains("press") || blob.Contains("media"))
            return "media";
        if (blob.Contains("contact"))
            return "business";
        return "general";
    }
}
