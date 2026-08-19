using System.Text;

namespace YouTubeBoosterAi.Api;

public static class CreatorAcquisitionCopy
{
    public static (string Subject, string Body) Build(
        string variant,
        string creatorName,
        string channelName,
        string observation,
        string improvement,
        string trackedUrl)
    {
        var name = string.IsNullOrWhiteSpace(creatorName) ? channelName : creatorName;
        var obs = (observation ?? "").Trim();
        var fix = (improvement ?? "").Trim();
        if (string.IsNullOrWhiteSpace(obs))
            obs = "Recent public titles and descriptions are inconsistent, which makes the channel harder to scan in search.";
        if (string.IsNullOrWhiteSpace(fix))
            fix = "On the next upload, put the dish and the payoff in the first words of the title and add a short description block.";

        if (string.Equals(variant, "B", StringComparison.OrdinalIgnoreCase))
        {
            var bodyB = JoinParagraphs(
                $"Hi {name},",
                obs,
                $"I'd tighten that on the next upload: {fix}",
                "I ran your channel through YouTubeBooster and found a few specific opportunities in your titles/descriptions. Your free audit is here:",
                trackedUrl,
                "Thanks,",
                "Max",
                "Founder, YouTubeBooster AI"
            );
            return ("A specific packaging note on your latest uploads", bodyB);
        }

        var bodyA = JoinParagraphs(
            $"Hi {name},",
            $"I ran {channelName} through YouTubeBooster and found a few specific opportunities in your titles/descriptions.",
            obs,
            fix,
            "Your free audit is here:",
            trackedUrl,
            "Thanks,",
            "Max",
            "Founder, YouTubeBooster AI"
        );
        return ("I ran a public-data audit of your channel", bodyA);
    }

    public static string WithComplianceFooter(string body, string channelForFooter, string unsubscribeUrl, string postalAddress)
    {
        var sb = new StringBuilder();
        sb.Append(body.TrimEnd());
        sb.Append("\n\n");
        sb.Append($"You received this one-time business email because a contact address was publicly listed for {channelForFooter}. YouTubeBooster AI is not affiliated with YouTube or Google.\n\n");
        sb.Append($"Unsubscribe: {unsubscribeUrl}\n\n");
        sb.Append(postalAddress.Trim());
        return sb.ToString().Replace("\r\n", "\n");
    }

    private static string JoinParagraphs(params string[] parts)
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
