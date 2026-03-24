using System.Text;

namespace YouTubeBoosterAi.Api;

public sealed class PromptBuilder : IPromptBuilder
{
    public string BuildPrompt(AiGenerateRequest request)
    {
        var action = NormalizeAction(request.Action);
        var input = request.Input ?? new AiGenerateInput(null, null, null, null);

        var titles = (input.Titles ?? Array.Empty<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .Take(10)
            .ToArray();

        var description = (input.Description ?? string.Empty).Trim();
        var niche = (input.Niche ?? "General YouTube").Trim();
        var audience = (input.Audience ?? "Creators seeking growth").Trim();

        var sb = new StringBuilder();
        sb.AppendLine("You are a world-class YouTube growth strategist.");
        sb.AppendLine("Return ONLY valid JSON with this exact shape:");
        sb.AppendLine("{\"summary\":\"...\",\"items\":[\"...\",\"...\"]}");
        sb.AppendLine("No markdown. No extra keys. No prose outside JSON.");
        sb.AppendLine();
        sb.AppendLine("Context:");
        sb.AppendLine($"- Niche: {niche}");
        sb.AppendLine($"- Audience: {audience}");
        if (!string.IsNullOrWhiteSpace(description))
        {
            sb.AppendLine($"- Description: {description}");
        }
        if (titles.Length > 0)
        {
            sb.AppendLine("- Titles:");
            foreach (var t in titles)
            {
                sb.AppendLine($"  - {t}");
            }
        }
        sb.AppendLine();

        switch (action)
        {
            case "rewrite_titles":
                sb.AppendLine("Task: Rewrite titles for higher CTR and retention.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce 8 title rewrites.");
                sb.AppendLine("- Keep each under 65 characters.");
                sb.AppendLine("- Front-load the primary keyword.");
                sb.AppendLine("- Use specific outcomes and curiosity.");
                sb.AppendLine("- Avoid clickbait and all-caps.");
                break;

            case "improve_description":
                sb.AppendLine("Task: Improve the YouTube description for search + watch time.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce 6 optimized description blocks.");
                sb.AppendLine("- Each block should be 2-4 lines max.");
                sb.AppendLine("- Include keyword placement strategy, timestamps prompt, and CTA structure.");
                sb.AppendLine("- Keep language clear and practical.");
                break;

            case "keywords":
                sb.AppendLine("Task: Generate high-intent keyword opportunities.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce 12 keyword phrases.");
                sb.AppendLine("- Mix short-tail and long-tail.");
                sb.AppendLine("- Prioritize buyer/viewer intent, not vanity terms.");
                sb.AppendLine("- Keep each phrase concise.");
                break;

            case "ideas":
                sb.AppendLine("Task: Generate video ideas likely to perform in this niche.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce 10 video ideas.");
                sb.AppendLine("- Each idea should include a strong hook angle.");
                sb.AppendLine("- Balance evergreen + trend-responsive topics.");
                sb.AppendLine("- Keep ideas executable for solo creators.");
                break;

            case "pattern":
                sb.AppendLine("Task: Identify winning content patterns and next experiments.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce 8 pattern insights.");
                sb.AppendLine("- Include format, hook style, posting cadence, and packaging guidance.");
                sb.AppendLine("- Insights must be action-oriented and specific.");
                break;

            default:
                throw new ArgumentOutOfRangeException(nameof(request.Action), "Unsupported AI action.");
        }

        return sb.ToString();
    }

    private static string NormalizeAction(string? action)
        => (action ?? string.Empty).Trim().ToLowerInvariant();
}
