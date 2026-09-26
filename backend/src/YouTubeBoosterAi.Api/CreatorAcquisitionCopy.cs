using System.Text;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

public static class CreatorAcquisitionCopy
{
    public const string TemplateVersion = "brand-v1";
    public const string CtaLabel = "VIEW YOUR FREE YOUTUBE AUDIT";
    public const string CtaPlainLeadIn = "View your free YouTube audit:";
    public const string BrandSignature = "YouTubeBooster AI";

    /// <summary>Marker paragraph replaced by the HTML CTA button (plain text keeps the URL).</summary>
    public const string CtaMarker = "{{YB_AUDIT_CTA}}";

    public static bool LooksLikeLegacyPersonalSender(string? subject, string? body)
    {
        var blob = $"{subject}\n{body}";
        if (string.IsNullOrWhiteSpace(blob)) return false;
        // Block founder-personal voice; allow brand first-person audit copy.
        if (Regex.IsMatch(blob, @"\bI'm Max\b", RegexOptions.IgnoreCase)) return true;
        if (Regex.IsMatch(blob, @"\bI am Max\b", RegexOptions.IgnoreCase)) return true;
        if (blob.Contains("Founder, YouTubeBooster", StringComparison.OrdinalIgnoreCase)) return true;
        if (blob.Contains("Max from YouTubeBooster", StringComparison.OrdinalIgnoreCase)) return true;
        if (Regex.IsMatch(blob, @"^\s*Max\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)) return true;
        return false;
    }

    public static string SubjectFor(string variant, string channelName)
    {
        var channel = string.IsNullOrWhiteSpace(channelName) ? "your channel" : channelName.Trim();
        return (variant ?? "A").Trim().ToUpperInvariant() switch
        {
            "B" => $"Found something on your YouTube channel",
            "C" => $"One thing I noticed on {channel}",
            "D" => $"Quick YouTube audit for {channel}",
            _ => $"Quick idea for {channel}"
        };
    }

    public static string SubjectVariantCode(string? emailVariant) =>
        (emailVariant ?? "A").Trim().ToUpperInvariant() switch
        {
            "B" => "B",
            "C" => "C",
            "D" => "D",
            _ => "A"
        };

    public static (string Subject, string Body) Build(
        string variant,
        string creatorName,
        string channelName,
        string observation,
        string improvement,
        string trackedUrl)
    {
        var name = string.IsNullOrWhiteSpace(creatorName) ? channelName : creatorName.Trim();
        var channel = string.IsNullOrWhiteSpace(channelName) ? name : channelName.Trim();
        var obs = (observation ?? "").Trim();
        if (string.IsNullOrWhiteSpace(obs))
            obs = "Recent public titles and descriptions are inconsistent, which makes the channel harder to scan in search.";

        var subject = SubjectFor(SubjectVariantCode(variant), channel);
        var ctaBlock = string.IsNullOrWhiteSpace(trackedUrl)
            ? CtaMarker
            : $"View your free audit:\n{trackedUrl.Trim()}";

        var body = JoinParagraphs(
            "Hi,",
            $"I was looking at {channel} and noticed {LowerFirst(obs)}",
            "I ran your channel through YouTubeBoosterAI and found a few other opportunities worth checking.",
            "I put the results here:",
            ctaBlock,
            "No signup required.",
            BrandSignature
        );
        return (subject, body);
    }

    private static string LowerFirst(string text)
    {
        var t = (text ?? "").Trim();
        if (t.Length == 0) return t;
        if (t.Length == 1) return t.ToLowerInvariant();
        return char.ToLowerInvariant(t[0]) + t[1..];
    }

    public static (string Subject, string Body) BuildFollowUp(
        int followUpStep,
        string creatorName,
        string channelName,
        string observation,
        string trackedUrl)
    {
        var name = string.IsNullOrWhiteSpace(creatorName) ? channelName : creatorName.Trim();
        var channel = string.IsNullOrWhiteSpace(channelName) ? name : channelName.Trim();
        var obs = string.IsNullOrWhiteSpace(observation)
            ? "a packaging opportunity on recent public uploads"
            : observation.Trim();
        var ctaBlock = string.IsNullOrWhiteSpace(trackedUrl)
            ? CtaMarker
            : $"{CtaPlainLeadIn}\n{trackedUrl.Trim()}";

        if (followUpStep <= 0)
        {
            return (
                $"Quick follow-up on the free audit for {channel}",
                JoinParagraphs(
                    $"Hi {name},",
                    "Following up in case this got buried — we still have a free YouTubeBooster AI audit open for your channel.",
                    $"Main finding: {obs}",
                    ctaBlock,
                    BrandSignature)
            );
        }

        return (
            $"Last note on the free audit for {channel}",
            JoinParagraphs(
                $"Hi {name},",
                "Last note on this. The free audit is still available if useful:",
                ctaBlock,
                "We'll leave it there — no more follow-ups.",
                BrandSignature)
        );
    }

    public static string WithComplianceFooter(string body, string channelForFooter, string unsubscribeUrl, string postalAddress)
    {
        var sb = new StringBuilder();
        sb.Append(StripComplianceFooter(body).TrimEnd());
        sb.Append("\n\n");
        sb.Append($"You received this one-time business email because a business contact address was publicly listed for {channelForFooter}.\n\n");
        sb.Append("YouTubeBooster AI is not affiliated with YouTube or Google.\n\n");
        sb.Append($"Unsubscribe from future emails: {unsubscribeUrl}\n\n");
        sb.Append(postalAddress.Trim());
        return sb.ToString().Replace("\r\n", "\n");
    }

    /// <summary>Remove a previously appended compliance block so re-wrapping stays clean.</summary>
    public static string StripComplianceFooter(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return "";
        var text = body.Replace("\r\n", "\n");
        var idx = text.IndexOf("You received this one-time business email", StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
            idx = text.IndexOf("YouTubeBooster AI is not affiliated with YouTube", StringComparison.OrdinalIgnoreCase);
        if (idx > 0) return text[..idx].TrimEnd();
        return text.TrimEnd();
    }

    public static string JoinParagraphs(params string[] parts)
    {
        var sb = new StringBuilder();
        foreach (var p in parts)
        {
            if (string.IsNullOrWhiteSpace(p)) continue;
            if (sb.Length > 0) sb.Append("\n\n");
            sb.Append(p.Trim());
        }
        return sb.ToString();
    }
}
