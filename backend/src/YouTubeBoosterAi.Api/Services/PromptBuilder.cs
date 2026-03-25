using System.Text;

namespace YouTubeBoosterAi.Api;

/// <summary>
/// Production prompts for AI Growth Studio — CTR, search, and retention focused; works for faceless, cooking, and general creators.
/// </summary>
public sealed class PromptBuilder : IPromptBuilder
{
    public string BuildPrompt(AiGenerateRequest request)
    {
        var action = NormalizeAction(request.Action);
        var input = request.Input ?? new AiGenerateInput(null, null, null, null);

        var titles = (input.Titles ?? Array.Empty<string>())
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .Take(12)
            .ToArray();

        var description = (input.Description ?? string.Empty).Trim();
        var niche = (input.Niche ?? "General YouTube").Trim();
        var audience = (input.Audience ?? "YouTube viewers").Trim();

        var sb = new StringBuilder();
        sb.AppendLine("You are a senior YouTube growth lead who writes for real analytics (CTR, AVD, session depth).");
        sb.AppendLine("Return ONLY valid JSON with this exact shape (no markdown fences, no prose outside JSON):");
        sb.AppendLine("{\"summary\":\"one sentence\",\"items\":[\"...\",\"...\"]}");
        sb.AppendLine();
        sb.AppendLine("Context:");
        sb.AppendLine($"- Niche / channel: {niche}");
        sb.AppendLine($"- Target audience: {audience}");
        if (!string.IsNullOrWhiteSpace(description))
        {
            sb.AppendLine($"- Video description or notes (may be partial): {description}");
        }

        if (titles.Length > 0)
        {
            sb.AppendLine("- Sample titles / hooks to learn from:");
            foreach (var t in titles)
            {
                sb.AppendLine($"  - {t}");
            }
        }

        sb.AppendLine();
        sb.AppendLine("Constraints for all tasks:");
        sb.AppendLine("- Be specific to the niche; avoid generic platitudes.");
        sb.AppendLine("- Assume both on-camera and faceless channels; never require a face on camera.");
        sb.AppendLine("- Optimize for YouTube search + browse features + suggested traffic.");
        sb.AppendLine();

        switch (action)
        {
            case "rewrite_titles":
                sb.AppendLine("Task: Rewrite titles for higher CTR and qualified clicks.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce exactly 8 title rewrites.");
                sb.AppendLine("- Each title ≤ 65 characters.");
                sb.AppendLine("- Front-load the strongest keyword viewers actually search.");
                sb.AppendLine("- Use concrete outcomes, time bounds, or method (when it helps clarity).");
                sb.AppendLine("- Create curiosity without clickbait clichés (no ALL CAPS, no excessive punctuation).");
                sb.AppendLine("- Vary angles: how-to, mistake-fix, transformation, comparison, myth-busting.");
                break;

            case "improve_description":
                sb.AppendLine("Task: Produce optimized description blocks the creator can paste or adapt.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce exactly 6 items; each item is 1–3 short lines separated by \\n within the string.");
                sb.AppendLine("- Cover: keyword placement in first 1–2 lines, chapters/timestamps guidance, pinned comment idea, internal link strategy, CTA, and disclaimer/community note if relevant.");
                sb.AppendLine("- Optimize for search intent + watch time (session starts), not keyword stuffing.");
                break;

            case "keywords":
                sb.AppendLine("Task: Generate high-intent keyword phrases for titles, tags, and descriptions.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce exactly 12 phrases.");
                sb.AppendLine("- Mix head terms and long-tail; include problem/outcome language.");
                sb.AppendLine("- Each phrase ≤ 6 words unless a natural longer question.");
                sb.AppendLine("- Avoid duplicates and vanity terms with no search intent.");
                break;

            case "ideas":
                sb.AppendLine("Task: Generate video ideas likely to perform for this niche.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce exactly 10 ideas.");
                sb.AppendLine("- Each idea is one string: title angle + parenthetical hook or format note.");
                sb.AppendLine("- Balance evergreen + trend-responsive; include at least 2 series-style ideas.");
                sb.AppendLine("- Favor solo-creator production realism.");
                break;

            case "pattern":
                sb.AppendLine("Task: Identify winning content patterns and next experiments.");
                sb.AppendLine("Rules:");
                sb.AppendLine("- Produce exactly 8 items.");
                sb.AppendLine("- Each item: specific packaging, hook, structure, pacing, or thumbnail language.");
                sb.AppendLine("- Include posting cadence and series packaging where relevant.");
                sb.AppendLine("- Make each insight actionable in one filming session.");
                break;

            default:
                throw new ArgumentOutOfRangeException(nameof(request.Action), "Unsupported AI action.");
        }

        return sb.ToString();
    }

    private static string NormalizeAction(string? action)
        => (action ?? string.Empty).Trim().ToLowerInvariant();
}
