using System.Text;

namespace YouTubeBoosterAi.Api;

/// <summary>
/// High-conversion Bedrock prompts for AI Growth Studio — strategist voice, no generic AI filler.
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
        var channelLabel = niche;

        var sb = new StringBuilder();
        sb.AppendLine("You are an elite YouTube growth strategist hired to lift CTR and qualified clicks. You write like a sharp operator, not a chatbot.");
        sb.AppendLine("Voice: decisive, specific, data-minded, zero filler. No phrases like “leverage”, “unlock potential”, “game-changer”, or “in today’s video”.");
        sb.AppendLine();
        sb.AppendLine("Return ONLY valid JSON (no markdown fences, no text before/after the JSON) using EXACTLY this shape:");
        sb.AppendLine("{");
        sb.AppendLine("  \"strategy\": \"2–3 short lines: what is weak in the user’s current angle + the strategic shift you are applying.\",");
        sb.AppendLine("  \"bestPick\": \"The single strongest deliverable for this task (see task rules).\",");
        sb.AppendLine("  \"whyBestWins\": [\"reason1\", \"reason2\", \"reason3\"],");
        sb.AppendLine("  \"options\": [\"...\", \"...\"],");
        sb.AppendLine("  \"whyTopOptions\": [");
        sb.AppendLine("    { \"optionIndex\": 1, \"reasons\": [\"short\", \"short\"] },");
        sb.AppendLine("    { \"optionIndex\": 2, \"reasons\": [\"short\", \"short\"] },");
        sb.AppendLine("    { \"optionIndex\": 3, \"reasons\": [\"short\", \"short\"] }");
        sb.AppendLine("  ]");
        sb.AppendLine("}");
        sb.AppendLine();
        sb.AppendLine("Rules for ALL responses:");
        sb.AppendLine("- bestPick MUST be one of the entries in options (copy exact string) — the one with the highest estimated CTR for this niche.");
        sb.AppendLine("- options: exactly 5 distinct entries for this task (unless the task below overrides). No near-duplicates.");
        sb.AppendLine("- whyBestWins: exactly 3 strings; each names a mechanism (e.g. curiosity gap, pain hook, keyword front-load, specificity, speed/benefit).");
        sb.AppendLine("- whyTopOptions: exactly 2 objects — for optionIndex 1 and 2 (1-based indices in options[]). Two short reasons each. Do not repeat whyBestWins verbatim.");
        sb.AppendLine("- Keep every line punchy. No long paragraphs.");
        sb.AppendLine("- NEVER output generic titles like \"Amazing X Recipe\" or \"Best X Ever\" without a concrete hook.");
        sb.AppendLine();
        sb.AppendLine("Context (use all of this):");
        sb.AppendLine($"- Channel / niche label: {channelLabel}");
        sb.AppendLine($"- Audience: {audience}");
        if (!string.IsNullOrWhiteSpace(description))
        {
            sb.AppendLine($"- Current description or working copy: {description}");
        }
        if (titles.Length > 0)
        {
            sb.AppendLine("- Reference titles / hooks from the user:");
            foreach (var t in titles)
            {
                sb.AppendLine($"  • {t}");
            }
        }

        sb.AppendLine();
        sb.AppendLine("--- TASK ---");
        sb.AppendLine();

        switch (action)
        {
            case "rewrite_titles":
                sb.AppendLine("Task: REWRITE TITLES for maximum CTR (browse + search).");
                sb.AppendLine("- options: exactly 5 title strings. Each ≤ 65 characters.");
                sb.AppendLine("- Titles must feel instantly usable — not “AI generated”. Vary angles: mistake, transformation, time-box, contrast, contrarian.");
                sb.AppendLine("- bestPick: the single title from options[] with the highest CTR potential for this niche (pain + curiosity + clarity).");
                sb.AppendLine("- strategy: call out what’s weak in the user’s current title patterns and what packaging rule you’re applying.");
                break;

            case "improve_description":
                sb.AppendLine("Task: IMPROVE DESCRIPTION for search + session depth.");
                sb.AppendLine("- options: exactly 5 items. Each item is ONE compact block (1–2 sentences max) the creator can paste or adapt — e.g. opening line, keyword stack, chapters line, CTA line.");
                sb.AppendLine("- bestPick: the single block that would move CTR + watch time the most if fixed first.");
                sb.AppendLine("- strategy: what’s wrong with typical descriptions in this niche + your fix (first 2 lines, intent, chapters, internal links).");
                break;

            case "keywords":
                sb.AppendLine("Task: KEYWORD PHRASES for titles, tags, and first lines.");
                sb.AppendLine("- options: exactly 5 high-intent phrases (mix head + long-tail). Each ≤ 6 words unless a natural question.");
                sb.AppendLine("- bestPick: the phrase with the best combo of search volume intent + click fit for this channel.");
                sb.AppendLine("- strategy: what search intent you’re targeting and what the channel was missing.");
                break;

            case "pattern":
                sb.AppendLine("Task: WINNING PATTERNS + next experiments.");
                sb.AppendLine("- options: exactly 5 pattern bullets — packaging, hook, structure, cadence, or thumbnail copy. Each one sentence, actionable this week.");
                sb.AppendLine("- bestPick: the single pattern that would move metrics fastest for this niche.");
                sb.AppendLine("- strategy: what the sample titles imply about what’s underperforming + the pattern you’re doubling down on.");
                break;

            case "ideas":
                sb.AppendLine("Task: VIDEO IDEAS that could win in this niche (faceless or on-camera).");
                sb.AppendLine("- options: exactly 5 video ideas. Each is a title-style line ≤ 70 characters + you may add a short angle in parentheses if under 90 chars total.");
                sb.AppendLine("- bestPick: the idea most likely to get clicks + retention for this audience.");
                sb.AppendLine("- strategy: gap in the niche + the content thesis behind these ideas.");
                break;

            default:
                throw new ArgumentOutOfRangeException(nameof(request.Action), "Unsupported AI action.");
        }

        return sb.ToString();
    }

    private static string NormalizeAction(string? action)
        => (action ?? string.Empty).Trim().ToLowerInvariant();
}
