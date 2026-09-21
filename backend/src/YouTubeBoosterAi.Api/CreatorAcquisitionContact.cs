using System.Net;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

public sealed record AcqContactResearchResult(
    string? Email,
    string? SourceUrl,
    string ContactType,
    string Status,
    string? OfficialWebsite,
    string Detail
);

public static class CreatorAcquisitionContact
{
    private static readonly Regex EmailRegex = new(
        @"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex HrefRegex = new(
        @"href\s*=\s*[""'](https?://[^""'#\s]+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] BlockedHosts =
    [
        "socialblade.com", "playboard.co", "reachranking.com", "scoutyhub.com",
        "maxoteka.ru", "tydyvy.com", "facebook.com", "instagram.com", "tiktok.com",
        "linkedin.com", "vk.com", "ok.ru", "twitter.com", "x.com", "youtube.com",
        "youtu.be", "google.com", "bit.ly"
        // linktr.ee allowed — common public business contact page for creators
    ];

    private static readonly string[] ContactPathHints =
    [
        "/contact", "/contact-us", "/contactus", "/about", "/about-us", "/work-with-me",
        "/collaborate", "/collab", "/press", "/media", "/business", "/partnerships"
    ];

    /// <summary>Backoff days after failed contact research attempts (1-indexed attempt count).</summary>
    public static int BackoffDays(int attemptCount) => attemptCount switch
    {
        <= 1 => 3,
        2 => 7,
        3 => 14,
        _ => 30
    };

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
            if (email.Contains("noreply", StringComparison.OrdinalIgnoreCase) ||
                email.Contains("no-reply", StringComparison.OrdinalIgnoreCase) ||
                email.Contains("donotreply", StringComparison.OrdinalIgnoreCase))
                continue;
            found.Add(email);
        }

        return found.ToArray();
    }

    public static IReadOnlyList<string> ExtractCandidateSiteUrls(string? htmlOrText, string? seedWebsite)
    {
        var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(seedWebsite) && IsAllowedSource(seedWebsite))
            urls.Add(NormalizeUrl(seedWebsite!));

        if (!string.IsNullOrWhiteSpace(htmlOrText))
        {
            foreach (Match m in HrefRegex.Matches(htmlOrText))
            {
                var u = WebUtility.HtmlDecode(m.Groups[1].Value).Trim();
                if (IsAllowedSource(u)) urls.Add(NormalizeUrl(u));
            }

            foreach (Match m in Regex.Matches(htmlOrText, @"https?://[^\s<>""']+", RegexOptions.IgnoreCase))
            {
                var u = m.Value.TrimEnd('.', ',', ')', ']');
                if (IsAllowedSource(u)) urls.Add(NormalizeUrl(u));
            }
        }

        return urls.Take(8).ToArray();
    }

    public static IReadOnlyList<string> ExpandContactCandidateUrls(IReadOnlyList<string> siteRoots)
    {
        var expanded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in siteRoots)
        {
            if (!Uri.TryCreate(root, UriKind.Absolute, out var uri)) continue;
            expanded.Add(uri.GetLeftPart(UriPartial.Path).TrimEnd('/'));
            var origin = uri.GetLeftPart(UriPartial.Authority);
            foreach (var path in ContactPathHints)
                expanded.Add(origin + path);
        }
        return expanded.Take(16).ToArray();
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

    public static bool LooksLikeContactFormOnly(string html)
    {
        var lower = html.ToLowerInvariant();
        var hasForm = lower.Contains("<form") && (lower.Contains("contact") || lower.Contains("message"));
        var hasMailto = lower.Contains("mailto:");
        var hasVisibleEmail = EmailRegex.IsMatch(html);
        return hasForm && !hasMailto && !hasVisibleEmail;
    }

    public static async Task<AcqContactResearchResult> ResearchPublicContactAsync(
        HttpClient http,
        string? officialWebsite,
        IEnumerable<string>? descriptionTexts,
        CancellationToken cancellationToken)
    {
        var seedText = string.Join('\n', (descriptionTexts ?? []).Where(t => !string.IsNullOrWhiteSpace(t)).Take(12));
        var siteRoots = ExtractCandidateSiteUrls(seedText, officialWebsite);
        if (siteRoots.Count == 0)
        {
            return new AcqContactResearchResult(null, null, "none", "contact_needed", officialWebsite,
                "No public website or allowed business URL found in channel/video metadata.");
        }

        var candidates = ExpandContactCandidateUrls(siteRoots);
        string? formOnlyUrl = null;

        foreach (var url in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.TryAddWithoutValidation("User-Agent", "YouTubeBoosterAI-ContactResearch/1.0 (+https://youtubeboosterai.com)");
                using var resp = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                if (!resp.IsSuccessStatusCode) continue;
                var media = resp.Content.Headers.ContentType?.MediaType ?? "";
                if (media.Contains("image", StringComparison.OrdinalIgnoreCase) ||
                    media.Contains("video", StringComparison.OrdinalIgnoreCase))
                    continue;

                var html = await resp.Content.ReadAsStringAsync(cancellationToken);
                if (html.Length > 1_500_000) html = html[..1_500_000];

                var emails = ExtractVisibleEmails(html, url);
                if (emails.Count > 0)
                {
                    var email = PreferBusinessEmail(emails);
                    return new AcqContactResearchResult(
                        email,
                        url,
                        ClassifyContactType(url, html),
                        "verified_public",
                        siteRoots[0],
                        "Extracted visible mailto/email from public page.");
                }

                if (LooksLikeContactFormOnly(html) && formOnlyUrl is null)
                    formOnlyUrl = url;
            }
            catch (Exception)
            {
                // Continue candidates; never invent an address.
            }
        }

        if (formOnlyUrl is not null)
        {
            return new AcqContactResearchResult(null, formOnlyUrl, "form_only", "form_only", siteRoots[0],
                "Public contact form found; automated email unavailable.");
        }

        return new AcqContactResearchResult(null, siteRoots[0], "source_recorded_unverified", "contact_needed", siteRoots[0],
            "Website found but no visible public business email.");
    }

    private static string PreferBusinessEmail(IReadOnlyList<string> emails)
    {
        var preferred = emails.FirstOrDefault(e =>
            e.Contains("hello@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("contact@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("biz@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("business@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("collab@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("partnerships@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("press@", StringComparison.OrdinalIgnoreCase));
        return preferred ?? emails[0];
    }

    private static string NormalizeUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return url.Trim();
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }
}
