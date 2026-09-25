using System.Net;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

public sealed record AcqContactResearchResult(
    string? Email,
    string? SourceUrl,
    string ContactType,
    string Status,
    string? OfficialWebsite,
    string Detail,
    string Confidence = "none",
    string SourceType = "none",
    IReadOnlyList<string>? SourcesChecked = null,
    string DiscoveryReason = "NONE",
    int FetchFailures = 0,
    int MailtoCount = 0,
    int CandidateEmailCount = 0
);

public static class CreatorAcquisitionContact
{
    private static readonly Regex EmailRegex = new(
        @"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex HrefRegex = new(
        @"href\s*=\s*[""'](https?://[^""'#\s]+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex NavHrefRegex = new(
        @"<a\s[^>]*href\s*=\s*[""']([^""'#\s]+)[""'][^>]*>(.*?)</a>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    private static readonly string[] NavLinkHints =
    [
        "contact", "about", "work with me", "work with", "collaborate", "collaboration",
        "partnership", "partnerships", "business", "media kit", "press"
    ];

    private static readonly string[] BlockedHosts =
    [
        "socialblade.com", "playboard.co", "reachranking.com", "scoutyhub.com",
        "maxoteka.ru", "tydyvy.com", "facebook.com", "instagram.com", "tiktok.com",
        "linkedin.com", "vk.com", "ok.ru", "twitter.com", "x.com", "youtube.com",
        "youtu.be", "google.com", "bit.ly"
    ];

    private static readonly string[] ContactPathHints =
    [
        "/contact", "/contact-us", "/contactus", "/about", "/about-us", "/work-with-me",
        "/workwithme", "/collaborate", "/collab", "/press", "/media", "/business",
        "/partnerships", "/partnership", "/advertising", "/advertise", "/sponsor",
        "/sponsors", "/brand", "/brands", "/inquiries", "/enquiry", "/booking"
    ];

    private static readonly string[] PreferredLocalParts =
    [
        "hello", "contact", "biz", "business", "collab", "collabs", "collaborate",
        "partnerships", "partnership", "press", "media", "creator", "team", "info"
    ];

    private static readonly string[] RejectedLocalParts =
    [
        "noreply", "no-reply", "donotreply", "do-not-reply", "privacy", "legal",
        "abuse", "webmaster", "billing", "accounts", "invoice", "support",
        "example", "test", "sample", "placeholder"
    ];

    /// <summary>Backoff days after failed contact research attempts (1-indexed attempt count).</summary>
    public static int BackoffDays(int attemptCount) => attemptCount switch
    {
        <= 1 => 3,
        2 => 7,
        3 => 14,
        _ => 30
    };

    /// <summary>Temporary fetch failures retry sooner than permanent-looking no-email results.</summary>
    public static int BackoffDaysForOutcome(string? status, int attemptCount) => (status ?? "").Trim().ToLowerInvariant() switch
    {
        "temporary_fetch_failure" => 1,
        "contact_needed" => attemptCount <= 1 ? 7 : BackoffDays(attemptCount),
        "not_found" or "form_only" or "no_public_email" => Math.Max(14, BackoffDays(attemptCount)),
        _ => BackoffDays(attemptCount)
    };

    public static bool IsGuessed(string? email, string? sourceUrl) =>
        EmailAddressHelpers.LooksLikeEmail(email) && string.IsNullOrWhiteSpace(sourceUrl);

    public static bool IsRejectedLocalPart(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return true;
        var local = email[..at].ToLowerInvariant();
        return RejectedLocalParts.Any(r => local == r || local.StartsWith(r + "+", StringComparison.Ordinal));
    }

    public static bool IsPlaceholderEmail(string email)
    {
        var e = email.ToLowerInvariant();
        return e.Contains("example.com")
            || e.Contains("example.org")
            || e.Contains("test.com")
            || e.Contains("domain.com")
            || e.Contains("email.com")
            || e.Contains("yoursite")
            || e.Contains("yourdomain")
            || e.StartsWith("user@")
            || e.StartsWith("name@")
            || e.StartsWith("email@");
    }

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
            if (IsRejectedLocalPart(email) || IsPlaceholderEmail(email))
                continue;
            found.Add(email);
        }

        return found.ToArray();
    }

    /// <summary>Emails published in YouTube/channel text. Does not invent addresses.</summary>
    public static IReadOnlyList<string> ExtractPublishedEmailsFromText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return [];
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in EmailRegex.Matches(text))
        {
            var email = WebUtility.HtmlDecode(match.Value).Trim().TrimEnd('.').ToLowerInvariant();
            if (!EmailAddressHelpers.LooksLikeEmail(email)) continue;
            if (email.EndsWith(".png", StringComparison.Ordinal) || email.EndsWith(".jpg", StringComparison.Ordinal))
                continue;
            if (IsRejectedLocalPart(email) || IsPlaceholderEmail(email))
                continue;
            found.Add(email);
        }
        return found.ToArray();
    }

    public static IReadOnlyList<string> ExtractSameDomainNavUrls(string html, string pageUrl)
    {
        if (string.IsNullOrWhiteSpace(html) || !Uri.TryCreate(pageUrl, UriKind.Absolute, out var page))
            return [];
        var origin = page.GetLeftPart(UriPartial.Authority);
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match m in NavHrefRegex.Matches(html))
        {
            var href = WebUtility.HtmlDecode(m.Groups[1].Value).Trim();
            var label = Regex.Replace(WebUtility.HtmlDecode(m.Groups[2].Value), "<.*?>", "").Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(label) || !NavLinkHints.Any(h => label.Contains(h, StringComparison.Ordinal)))
                continue;
            string? abs = null;
            if (href.StartsWith("http", StringComparison.OrdinalIgnoreCase)) abs = href;
            else if (href.StartsWith('/')) abs = origin + href;
            if (abs is null || !IsAllowedSource(abs)) continue;
            if (!Uri.TryCreate(abs, UriKind.Absolute, out var uri)) continue;
            if (!string.Equals(uri.GetLeftPart(UriPartial.Authority), origin, StringComparison.OrdinalIgnoreCase))
                continue;
            found.Add(NormalizeUrl(abs));
        }
        return found.Take(8).ToArray();
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

        return urls.Take(10).ToArray();
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
        return expanded.Take(24).ToArray();
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
        if (blob.Contains("contact") || blob.Contains("advertis") || blob.Contains("sponsor"))
            return "business";
        return "general";
    }

    public static string ClassifySourceType(string pageUrl)
    {
        var path = Uri.TryCreate(pageUrl, UriKind.Absolute, out var u) ? u.AbsolutePath.ToLowerInvariant() : pageUrl.ToLowerInvariant();
        if (path.Contains("contact")) return "contact_page";
        if (path.Contains("about")) return "about_page";
        if (path.Contains("work") || path.Contains("collab") || path.Contains("partner")) return "partnerships_page";
        if (path.Contains("press") || path.Contains("media")) return "press_page";
        if (path.Contains("advertis") || path.Contains("sponsor") || path.Contains("brand")) return "advertising_page";
        if (path is "/" or "") return "homepage";
        return "website_page";
    }

    public static string ClassifyConfidence(string email, string pageUrl, string contactType)
    {
        var sourceType = ClassifySourceType(pageUrl);
        var preferred = IsPreferredBusinessEmail(email);
        var strongPage = sourceType is "contact_page" or "about_page" or "partnerships_page" or "press_page" or "advertising_page";
        if (preferred && strongPage) return "high";
        if (preferred || strongPage) return "high";
        if (contactType is "business" or "partnership" or "media") return "medium";
        if (sourceType == "homepage") return "medium";
        return "low";
    }

    public static bool IsPreferredBusinessEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0) return false;
        var local = email[..at].ToLowerInvariant();
        return PreferredLocalParts.Any(p => local == p || local.StartsWith(p + "+", StringComparison.Ordinal));
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
        var publishedInText = ExtractPublishedEmailsFromText(seedText);
        var siteRoots = ExtractCandidateSiteUrls(seedText, officialWebsite);
        if (publishedInText.Count > 0)
        {
            var email = PreferBusinessEmail(publishedInText);
            var source = siteRoots.Count > 0
                ? siteRoots[0]
                : (!string.IsNullOrWhiteSpace(officialWebsite) && IsAllowedSource(officialWebsite)
                    ? officialWebsite
                    : null);
            var confidence = IsPreferredBusinessEmail(email) ? "high" : "medium";
            return new AcqContactResearchResult(
                email,
                source ?? "youtube-channel-metadata",
                "business",
                confidence == "high" ? "verified_public" : "review_email",
                siteRoots.Count > 0 ? siteRoots[0] : officialWebsite,
                "Published email found in creator-supplied channel/video text.",
                confidence,
                source is null ? "youtube_description" : ClassifySourceType(source),
                source is null ? new[] { "youtube-channel-metadata" } : new[] { source },
                "EMAIL_FOUND",
                0,
                0,
                publishedInText.Count);
        }

        var checkedUrls = new List<string>();
        if (siteRoots.Count == 0)
        {
            return new AcqContactResearchResult(null, null, "none", "contact_needed", officialWebsite,
                "No public website or allowed business URL found in channel/video metadata.",
                "none", "none", checkedUrls, "NO_OFFICIAL_WEBSITE");
        }

        var pending = new Queue<string>(ExpandContactCandidateUrls(siteRoots));
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string? formOnlyUrl = null;
        var fetchFailures = 0;
        var htmlSuccess = 0;
        var mailtoCount = 0;
        var navExpanded = 0;

        while (pending.Count > 0 && checkedUrls.Count < 32)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var url = pending.Dequeue();
            if (!seen.Add(url)) continue;
            checkedUrls.Add(url);
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.TryAddWithoutValidation("User-Agent", "YouTubeBoosterAI-ContactResearch/1.0 (+https://youtubeboosterai.com)");
                using var resp = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
                if (!resp.IsSuccessStatusCode)
                {
                    fetchFailures++;
                    continue;
                }
                var media = resp.Content.Headers.ContentType?.MediaType ?? "";
                if (media.Contains("image", StringComparison.OrdinalIgnoreCase) ||
                    media.Contains("video", StringComparison.OrdinalIgnoreCase))
                    continue;

                var html = await resp.Content.ReadAsStringAsync(cancellationToken);
                if (html.Length > 1_500_000) html = html[..1_500_000];
                htmlSuccess++;
                if (html.Contains("mailto:", StringComparison.OrdinalIgnoreCase)) mailtoCount++;

                var emails = ExtractVisibleEmails(html, url);
                if (emails.Count > 0)
                {
                    var email = PreferBusinessEmail(emails);
                    var contactType = ClassifyContactType(url, html);
                    var confidence = ClassifyConfidence(email, url, contactType);
                    var status = confidence switch
                    {
                        "high" => "verified_public",
                        "medium" => "review_email",
                        _ => "low_confidence"
                    };
                    return new AcqContactResearchResult(
                        email,
                        url,
                        contactType,
                        status,
                        siteRoots[0],
                        $"Extracted visible email from public page ({confidence} confidence).",
                        confidence,
                        ClassifySourceType(url),
                        checkedUrls,
                        status == "low_confidence" ? "EMAIL_FOUND_INVALID" : "EMAIL_FOUND",
                        fetchFailures,
                        mailtoCount,
                        emails.Count);
                }

                if (LooksLikeContactFormOnly(html) && formOnlyUrl is null)
                    formOnlyUrl = url;

                if (navExpanded < 2)
                {
                    navExpanded++;
                    foreach (var nav in ExtractSameDomainNavUrls(html, url))
                    {
                        if (seen.Contains(nav)) continue;
                        pending.Enqueue(nav);
                    }
                }
            }
            catch (Exception)
            {
                fetchFailures++;
            }
        }

        if (formOnlyUrl is not null)
        {
            return new AcqContactResearchResult(null, formOnlyUrl, "form_only", "form_only", siteRoots[0],
                "Public contact form found; automated email unavailable.",
                "none", "contact_form", checkedUrls, "NO_PUBLIC_EMAIL", fetchFailures, mailtoCount, 0);
        }

        if (htmlSuccess == 0)
        {
            return new AcqContactResearchResult(null, siteRoots[0], "none", "temporary_fetch_failure", siteRoots[0],
                "Official website was unreachable or returned no usable HTML.",
                "none", "website", checkedUrls, "WEBSITE_UNREACHABLE", fetchFailures, mailtoCount, 0);
        }

        return new AcqContactResearchResult(null, siteRoots[0], "source_recorded_unverified", "not_found", siteRoots[0],
            "Website found but no visible public business email.",
            "none", "website", checkedUrls, "NO_PUBLIC_EMAIL", fetchFailures, mailtoCount, 0);
    }

    public static string PreferBusinessEmail(IReadOnlyList<string> emails)
    {
        var preferred = emails.FirstOrDefault(IsPreferredBusinessEmail);
        return preferred ?? emails[0];
    }

    private static string NormalizeUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return url.Trim();
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
    }
}
