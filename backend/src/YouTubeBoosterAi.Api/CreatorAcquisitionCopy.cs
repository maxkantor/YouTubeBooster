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
                $"I ran {channelName} through YouTubeBooster using only public YouTube data.",
                obs,
                $"Quick win: {fix}",
                "You can see the free audit (no signup required for the preview) here:",
                trackedUrl,
                "Happy to answer anything if useful — otherwise ignore this.",
                "Max",
                "Founder, YouTubeBooster AI"
            );
            return ($"Free audit notes for {channelName}", bodyB);
        }

        var bodyA = JoinParagraphs(
            $"Hi {name},",
            $"I ran {channelName} through YouTubeBooster and found several concrete opportunities.",
            obs,
            $"Suggested first move: {fix}",
            "See the initial free audit here (preview first — no card required):",
            trackedUrl,
            "Thanks,",
            "Max",
            "Founder, YouTubeBooster AI"
        );
        return ($"I found specific growth opportunities on {channelName}", bodyA);
    }

    public static (string Subject, string Body) BuildFollowUp(
        int followUpStep,
        string creatorName,
        string channelName,
        string observation,
        string trackedUrl)
    {
        var name = string.IsNullOrWhiteSpace(creatorName) ? channelName : creatorName;
        var obs = string.IsNullOrWhiteSpace(observation)
            ? "a few packaging and discoverability opportunities on recent uploads"
            : observation.Trim();
        if (followUpStep <= 0)
        {
            return (
                $"Quick follow-up on your {channelName} audit",
                JoinParagraphs(
                    $"Hi {name},",
                    "Just bumping this in case it got buried — I left a free YouTubeBooster audit open for your channel.",
                    $"Main finding: {obs}",
                    trackedUrl,
                    "No pressure either way.",
                    "Max")
            );
        }

        return (
            $"Last note on the free audit for {channelName}",
            JoinParagraphs(
                $"Hi {name},",
                "Last note from me on this. The free audit is still available if useful:",
                trackedUrl,
                "I'll leave it there — no more follow-ups.",
                "Max")
        );
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
