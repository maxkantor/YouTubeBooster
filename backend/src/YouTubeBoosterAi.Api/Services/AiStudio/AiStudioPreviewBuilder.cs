namespace YouTubeBoosterAi.Api.Services.AiStudio;

/// <summary>
/// Deterministic, channel-aware teaser content for logged-in users without premium.
/// Does not call Bedrock — mirrors product positioning (CTR, retention, search).
/// </summary>
public static class AiStudioPreviewBuilder
{
    public static (string Notes, List<string> Items) Build(string action, AiGenerateInput input)
    {
        var niche = (input.Niche ?? "Your channel").Trim();
        if (string.IsNullOrWhiteSpace(niche)) niche = "Your channel";

        var primaryTitle = input.Titles?.FirstOrDefault(t => !string.IsNullOrWhiteSpace(t))?.Trim() ?? "your latest video";
        var topic = ExtractTopic(primaryTitle, niche);

        return action switch
        {
            "rewrite_titles" => (
                "Preview: title angles optimized for CTR — unlock for a full personalized set powered by Bedrock.",
                [
                    $"{topic}: The 20-Minute Method Viewers Actually Finish",
                    $"I Stopped Doing {topic} Wrong — Views Doubled",
                    $"{topic} Mistakes That Quietly Kill Your Click-Through Rate",
                    $"The {topic} Recipe My Subscribers Ask For Every Week"
                ]),
            "improve_description" => (
                "Preview: description structure for search + session time — unlock for full blocks.",
                [
                    $"Open with the exact search phrase viewers type for “{topic}” in the first 140 characters.",
                    "Add 4–6 timestamp chapters; retention often beats raw keyword stuffing.",
                    "Close with one strong CTA + two internal links to related uploads.",
                    "Pin a comment with the primary keyword + a question to drive replies."
                ]),
            "keywords" => (
                "Preview: intent-led keyword phrases — unlock for the full list.",
                [
                    $"{topic} tutorial for beginners",
                    $"easy {topic} recipe fast",
                    $"{topic} tips no one talks about",
                    $"cheap {topic} at home"
                ]),
            "pattern" => (
                "Preview: repeatable packaging patterns — unlock for full analysis.",
                [
                    "Hook pattern: show the payoff in the first 3 seconds, then explain the constraint (time/budget/gear).",
                    "Thumbnail pattern: one focal object + 3–5 word outcome (no clutter).",
                    "Cadence: publish on a predictable weekday slot your audience can anticipate.",
                    "Series pattern: numbered parts reduce decision fatigue and lift returning viewers."
                ]),
            "ideas" => (
                "Preview: video ideas with hooks — unlock for the full run.",
                [
                    $"{topic}: I Tried the #1 Mistake for 7 Days (Real Results)",
                    $"The Only {topic} Framework You Need (Works for Faceless Too)",
                    $"{topic} in Under 15 Minutes — Budget + Taste Test",
                    $"What I’d Do Differently After 100 {topic} Videos"
                ]),
            _ => (
                "Preview mode — upgrade for full AI generation.",
                ["Unlock to run live AI on your channel context."])
        };
    }

    private static string ExtractTopic(string title, string niche)
    {
        var t = title.Trim();
        if (t.Length > 48) t = t[..48].TrimEnd() + "…";
        if (!string.IsNullOrWhiteSpace(t) && t.Length < 80) return t;

        var n = niche.TrimStart('@');
        return string.IsNullOrWhiteSpace(n) ? "your niche" : n;
    }
}
