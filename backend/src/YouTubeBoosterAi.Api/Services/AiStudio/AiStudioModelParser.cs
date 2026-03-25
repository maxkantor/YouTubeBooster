using System.Text.Json;

namespace YouTubeBoosterAi.Api.Services.AiStudio;

/// <summary>
/// Parses Bedrock (Claude) output into structured notes + line items. Tolerates markdown fences and extra prose.
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

            var notes = root.TryGetProperty("summary", out var s) && s.ValueKind == JsonValueKind.String
                ? (s.GetString() ?? string.Empty).Trim()
                : string.Empty;

            var items = new List<string>();
            if (root.TryGetProperty("items", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in arr.EnumerateArray())
                {
                    var value = item.ValueKind == JsonValueKind.String
                        ? item.GetString()
                        : item.ToString();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        items.Add(value.Trim());
                    }
                }
            }

            if (items.Count > 0)
            {
                return (string.IsNullOrWhiteSpace(notes) ? DefaultNotes(action) : notes, items);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI studio JSON parse failed; using line fallback");
        }

        var fallback = FallbackLines(modelText);
        return (DefaultNotes(action), fallback.Count > 0 ? fallback : [DefaultFailureLine(action)]);
    }

    private static string DefaultNotes(string action) => action switch
    {
        "rewrite_titles" => "Titles tuned for CTR: specificity, curiosity, and keyword front-loading.",
        "improve_description" => "Description blocks optimized for search intent and watch-time signals.",
        "keywords" => "Keyword phrases aligned to search intent and suggested traffic.",
        "ideas" => "Video ideas balanced for reach, retention, and production effort.",
        "pattern" => "Patterns distilled from your positioning and sample titles.",
        _ => "AI results generated."
    };

    private static string DefaultFailureLine(string action) =>
        action == "rewrite_titles"
            ? "We couldn’t parse the model output. Retry, or shorten your context."
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
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(16)
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
