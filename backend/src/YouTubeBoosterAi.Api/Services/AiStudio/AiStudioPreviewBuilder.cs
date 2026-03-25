namespace YouTubeBoosterAi.Api.Services.AiStudio;

/// <summary>
/// Free-tier preview: same “strategist” shape as live output, truncated (no Bedrock).
/// </summary>
public static class AiStudioPreviewBuilder
{
    public static (string Notes, List<string> Items) Build(string action, AiGenerateInput input)
    {
        var niche = (input.Niche ?? "Your channel").Trim();
        if (string.IsNullOrWhiteSpace(niche)) niche = "Your channel";

        var primaryTitle = input.Titles?.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t))?.Trim() ?? "your latest video";
        var descHint = (input.Description ?? string.Empty).Trim();
        var topic = ExtractTopic(primaryTitle, niche);

        var weakTitleLine = string.IsNullOrWhiteSpace(descHint)
            ? $"Your titles read generic next to high-CTR channels in {niche}."
            : $"Your current line still sounds like: “{Truncate(descHint, 110)}” — it doesn’t telegraph a sharp, clickable outcome.";

        // Preview: strategy in Notes; Items = BEST PICK + 2 option lines only (teaser — upgrade for full run).
        return action switch
        {
            "rewrite_titles" => (
                Notes: BuildStrategy(
                    weakTitleLine,
                    "We’re testing pain + outcome + specificity — the same levers the full AI uses with your full title set."),
                Items:
                [
                    $"🔥 BEST PICK: {topic}: The One Step That Stops Dry, Boring Results",
                    $"1) {topic} in 25 Minutes (No Fancy Gear)",
                    $"2) I Ruined {topic} for Years — This Fixed It"
                ]),
            "improve_description" => (
                Notes: BuildStrategy(
                    "Most descriptions bury the keyword and skip chapters — YouTube can’t match intent.",
                    "Preview shows the opening fix + structure; paid unlocks full blocks + CTAs."),
                Items:
                [
                    "🔥 BEST PICK: Open line 1 with the exact search phrase viewers type + the payoff in 12 words.",
                    "1) Chapters: 0:00 hook · 0:20 mistake · 1:10 fix · 2:30 result (retention signal).",
                    "2) Pin a comment: primary keyword + one question to force replies."
                ]),
            "keywords" => (
                Notes: BuildStrategy(
                    $"Search intent around {niche} is split between “easy” and “fix my mistake” — you need both.",
                    "Full unlock maps the full phrase grid; preview shows the top intent pulls."),
                Items:
                [
                    $"🔥 BEST PICK: easy {topic} for busy weeknights",
                    $"1) {topic} mistakes killing your views",
                    $"2) cheap {topic} at home (no restaurant shortcuts)"
                ]),
            "pattern" => (
                Notes: BuildStrategy(
                    "Your packaging probably over-explains before the payoff — viewers bounce in 3 seconds.",
                    "Winning pattern: payoff-first, then constraint (time/budget), then proof."),
                Items:
                [
                    "🔥 BEST PICK: Hook = finished result in frame 1, then “here’s the mistake everyone makes.”",
                    "1) Thumbnail: one object + 4-word outcome; no collage chaos.",
                    "2) Post same weekday + same time so browse learns when to surface you."
                ]),
            "ideas" => (
                Notes: BuildStrategy(
                    $"Ideas that win in {niche} pair a painful mistake with a fast proof window.",
                    "Paid generates the full runway + series angles; preview shows the top hooks."),
                Items:
                [
                    $"🔥 BEST PICK: I Tried the #1 {topic} Mistake for 7 Days (Real Numbers)",
                    $"1) The {topic} Shortcut That Looks Wrong But Works",
                    $"2) What I’d Change After 100 {topic} Videos (Brutal Audit)"
                ]),
            _ => (
                "Upgrade for the full strategist output powered by Bedrock.",
                ["Unlock full AI Growth Studio to generate live strategy + options."])
        };
    }

    private static string BuildStrategy(string line1, string line2)
        => $"{line1}\n{line2}";

    private static string Truncate(string s, int max)
    {
        var t = s.Trim();
        if (t.Length <= max) return t;
        return t[..(max - 1)].TrimEnd() + "…";
    }

    private static string ExtractTopic(string title, string niche)
    {
        var t = title.Trim();
        if (t.Length > 42) t = t[..42].TrimEnd() + "…";
        if (!string.IsNullOrWhiteSpace(t) && t.Length < 72) return t;

        var n = niche.TrimStart('@');
        return string.IsNullOrWhiteSpace(n) ? "this niche" : n;
    }
}
