using System.Text;
using System.Text.Json;

namespace YouTubeBoosterAi.Api.Services.AiStudio;

/// <summary>
/// Parses Bedrock JSON into strategist-style notes + flat item cards (UI unchanged — each string is one card).
/// </summary>
public static class AiStudioModelParser
{
    public static (string Notes, List<string> Items) Parse(string modelText, string action, ILogger logger)
    {
        try
        {
            var json = ExtractJsonObject(modelText);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (TryParseConversionShape(root, out var strategy, out var bestPick, out var whyBest, out var options, out var whyTop))
            {
                var items = BuildFlatItems(bestPick, whyBest, options, whyTop);
                var notes = string.IsNullOrWhiteSpace(strategy) ? DefaultStrategy(action) : strategy.Trim();
                return (notes, items);
            }

            // Legacy: { "summary": "...", "items": [...] }
            var legacySummary = root.TryGetProperty("summary", out var s) && s.ValueKind == JsonValueKind.String
                ? (s.GetString() ?? string.Empty).Trim()
                : string.Empty;

            var legacyItems = new List<string>();
            if (root.TryGetProperty("items", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in arr.EnumerateArray())
                {
                    var value = item.ValueKind == JsonValueKind.String
                        ? item.GetString()
                        : item.ToString();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        legacyItems.Add(value.Trim());
                    }
                }
            }

            if (legacyItems.Count > 0)
            {
                return (string.IsNullOrWhiteSpace(legacySummary) ? DefaultStrategy(action) : legacySummary, legacyItems);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI studio JSON parse failed; using line fallback");
        }

        var fallback = FallbackLines(modelText);
        return (DefaultStrategy(action), fallback.Count > 0 ? fallback : [DefaultFailureLine(action)]);
    }

    private static bool TryParseConversionShape(
        JsonElement root,
        out string strategy,
        out string bestPick,
        out List<string> whyBestWins,
        out List<string> options,
        out List<(int Index, List<string> Reasons)> whyTopOptions)
    {
        strategy = string.Empty;
        bestPick = string.Empty;
        whyBestWins = [];
        options = [];
        whyTopOptions = [];

        if (!TryGetString(root, "strategy", out var st) && !TryGetString(root, "Strategy", out st))
        {
            st = string.Empty;
        }

        strategy = st ?? string.Empty;

        if (!TryGetString(root, "bestPick", out var bp) && !TryGetString(root, "best_pick", out bp))
        {
            bp = string.Empty;
        }

        bestPick = bp ?? string.Empty;

        if (root.TryGetProperty("whyBestWins", out var wb) && wb.ValueKind == JsonValueKind.Array)
        {
            foreach (var el in wb.EnumerateArray())
            {
                if (el.ValueKind == JsonValueKind.String)
                {
                    var t = el.GetString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(t)) whyBestWins.Add(t!);
                }
            }
        }
        else if (root.TryGetProperty("why_best_wins", out var wb2) && wb2.ValueKind == JsonValueKind.Array)
        {
            foreach (var el in wb2.EnumerateArray())
            {
                if (el.ValueKind == JsonValueKind.String)
                {
                    var t = el.GetString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(t)) whyBestWins.Add(t!);
                }
            }
        }

        if (root.TryGetProperty("options", out var opt) && opt.ValueKind == JsonValueKind.Array)
        {
            foreach (var el in opt.EnumerateArray())
            {
                if (el.ValueKind == JsonValueKind.String)
                {
                    var t = el.GetString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(t)) options.Add(t!);
                }
            }
        }

        if (root.TryGetProperty("whyTopOptions", out var wto) && wto.ValueKind == JsonValueKind.Array)
        {
            foreach (var el in wto.EnumerateArray())
            {
                if (el.ValueKind != JsonValueKind.Object) continue;
                var idx = 0;
                if (el.TryGetProperty("optionIndex", out var oiEl))
                {
                    if (oiEl.ValueKind == JsonValueKind.Number) idx = oiEl.GetInt32();
                    else if (oiEl.ValueKind == JsonValueKind.String && int.TryParse(oiEl.GetString(), out var p)) idx = p;
                }
                else if (el.TryGetProperty("option_index", out var oi2))
                {
                    if (oi2.ValueKind == JsonValueKind.Number) idx = oi2.GetInt32();
                }

                var reasons = new List<string>();
                if (el.TryGetProperty("reasons", out var rrs) && rrs.ValueKind == JsonValueKind.Array)
                {
                    foreach (var r in rrs.EnumerateArray())
                    {
                        if (r.ValueKind == JsonValueKind.String)
                        {
                            var t = r.GetString()?.Trim();
                            if (!string.IsNullOrWhiteSpace(t)) reasons.Add(t!);
                        }
                    }
                }

                if (idx > 0 && reasons.Count > 0)
                {
                    whyTopOptions.Add((idx, reasons));
                }
            }
        }

        if (options.Count == 0)
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(bestPick))
        {
            bestPick = options[0];
        }

        return true;
    }

    private static bool TryGetString(JsonElement root, string name, out string? value)
    {
        value = null;
        if (!root.TryGetProperty(name, out var el) || el.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = el.GetString();
        return !string.IsNullOrWhiteSpace(value);
    }

    private static List<string> BuildFlatItems(
        string bestPick,
        List<string> whyBestWins,
        List<string> options,
        List<(int Index, List<string> Reasons)> whyTopOptions)
    {
        var items = new List<string>();

        items.Add($"🔥 BEST PICK: {bestPick.Trim()}");

        if (whyBestWins.Count > 0)
        {
            var joined = string.Join(" · ", whyBestWins.Select(r => r.Trim()));
            items.Add($"WHY THIS WINS: {joined}");
        }

        for (var i = 0; i < options.Count; i++)
        {
            items.Add($"{i + 1}) {options[i].Trim()}");
        }

        foreach (var (idx, reasons) in whyTopOptions.OrderBy(x => x.Index))
        {
            if (reasons.Count == 0) continue;
            var rj = string.Join("; ", reasons.Select(r => r.Trim()));
            items.Add($"WHY #{idx} WORKS: {rj}");
        }

        return items;
    }

    private static string DefaultStrategy(string action) => action switch
    {
        "rewrite_titles" => "Titles rebuilt for CTR: pain, curiosity, and keyword front-load — no generic hooks.",
        "improve_description" => "Description structured for search intent + session depth — first lines first.",
        "keywords" => "Keyword set aligned to intent and suggested traffic — not vanity phrases.",
        "ideas" => "Ideas skewed for clicks you can actually film this week.",
        "pattern" => "Patterns you can ship in the next upload — packaging + hook + cadence.",
        _ => "Strategy applied."
    };

    private static string DefaultFailureLine(string action) =>
        action == "rewrite_titles"
            ? "We couldn’t parse the model output. Retry once — if it persists, shorten your context."
            : "We couldn’t parse the model output. Please retry.";

    private static List<string> FallbackLines(string modelText)
    {
        return (modelText ?? string.Empty)
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line => line.TrimStart('-', '*', ' ', '\t').Trim())
            .Where(line => !line.StartsWith("```", StringComparison.Ordinal))
            .Where(line => line is not "{" and not "}")
            .Where(line => !line.StartsWith("\"summary\"", StringComparison.OrdinalIgnoreCase))
            .Where(line => !line.StartsWith("\"items\"", StringComparison.OrdinalIgnoreCase))
            .Where(line => !line.StartsWith("\"strategy\"", StringComparison.OrdinalIgnoreCase))
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();
    }

    private static string ExtractJsonObject(string raw)
    {
        var text = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text)) return "{}";

        if (text.StartsWith("```", StringComparison.Ordinal))
        {
            var firstNewLine = text.IndexOf('\n');
            if (firstNewLine >= 0)
            {
                text = text[(firstNewLine + 1)..];
            }

            var closingFence = text.LastIndexOf("```", StringComparison.Ordinal);
            if (closingFence >= 0)
            {
                text = text[..closingFence];
            }

            text = text.Trim();
        }

        var objectStart = text.IndexOf('{');
        var objectEnd = text.LastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart)
        {
            return text.Substring(objectStart, objectEnd - objectStart + 1);
        }

        return text;
    }
}
