using System.Text.Json;

namespace YouTubeBoosterAi.Api;

public sealed class AiGenerationService : IAiGenerationService
{
    private readonly IPromptBuilder _promptBuilder;
    private readonly IBedrockService _bedrockService;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IAppDataStore _appDataStore;
    private readonly ILogger<AiGenerationService> _logger;

    public AiGenerationService(
        IPromptBuilder promptBuilder,
        IBedrockService bedrockService,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore,
        ILogger<AiGenerationService> logger)
    {
        _promptBuilder = promptBuilder;
        _bedrockService = bedrockService;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
        _logger = logger;
    }

    public async Task<AiGenerateResponse> GenerateAsync(
        AiGenerateRequest request,
        UserAccount user,
        bool paidAccess,
        CancellationToken cancellationToken)
    {
        var normalizedAction = NormalizeAction(request.Action);
        var prompt = _promptBuilder.BuildPrompt(request with { Action = normalizedAction });

        var maxTokensRaw = await _secretValueProvider.GetValueAsync("bedrock/maxTokens", secure: false, cancellationToken);
        var temperatureRaw = await _secretValueProvider.GetValueAsync("bedrock/temperature", secure: false, cancellationToken);

        var maxTokens = int.TryParse(maxTokensRaw, out var parsedMax) ? parsedMax : 900;
        var temperature = double.TryParse(temperatureRaw, out var parsedTemp) ? parsedTemp : 0.7;

        var started = DateTimeOffset.UtcNow;
        var modelText = await _bedrockService.InvokeModelAsync(prompt, temperature, maxTokens, cancellationToken);

        var (summary, items) = ParseResponse(modelText, normalizedAction);

        var visibleCount = paidAccess ? items.Count : Math.Min(2, items.Count);
        var badge = paidAccess ? "Pro Feature Active" : "Preview Mode";

        await _appDataStore.TrackEventAsync("ai_generate", user.UserId, new Dictionary<string, string?>
        {
            ["action"] = normalizedAction,
            ["paid"] = paidAccess ? "true" : "false",
            ["resultCount"] = items.Count.ToString(),
            ["visibleCount"] = visibleCount.ToString(),
            ["durationMs"] = (DateTimeOffset.UtcNow - started).TotalMilliseconds.ToString("F0")
        }, cancellationToken);

        return new AiGenerateResponse(
            Action: normalizedAction,
            Results: items,
            Summary: summary,
            Paid: paidAccess,
            VisibleResults: visibleCount,
            Badge: badge,
            GeneratedAt: DateTimeOffset.UtcNow
        );
    }

    private static string NormalizeAction(string? action)
        => (action ?? string.Empty).Trim().ToLowerInvariant();

    private (string Summary, List<string> Items) ParseResponse(string modelText, string action)
    {
        try
        {
            using var doc = JsonDocument.Parse(ExtractJsonCandidate(modelText));
            var root = doc.RootElement;
            var summary = root.TryGetProperty("summary", out var s)
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
                return (string.IsNullOrWhiteSpace(summary) ? BuildDefaultSummary(action) : summary, items);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI JSON parse fallback triggered");
        }

        var fallbackItems = modelText
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(line => line.TrimStart('-', '*', ' ', '\t').Trim())
            .Where(line => !line.StartsWith("```", StringComparison.Ordinal))
            .Where(line => !string.Equals(line, "{", StringComparison.Ordinal) && !string.Equals(line, "}", StringComparison.Ordinal))
            .Where(line => !line.StartsWith("\"summary\"", StringComparison.OrdinalIgnoreCase))
            .Where(line => !line.StartsWith("\"items\"", StringComparison.OrdinalIgnoreCase))
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();

        return (BuildDefaultSummary(action), fallbackItems.Count > 0 ? fallbackItems : ["AI is busy. Try again."]);
    }

    private static string BuildDefaultSummary(string action)
        => action switch
        {
            "rewrite_titles" => "Fresh title rewrites generated for higher click-through rate.",
            "improve_description" => "Optimized description improvements generated.",
            "keywords" => "Keyword opportunities generated for search visibility.",
            "ideas" => "New video ideas generated for your niche.",
            "pattern" => "Winning content pattern insights generated.",
            _ => "AI results generated."
        };

    private static string ExtractJsonCandidate(string raw)
    {
        var text = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text)) return "{}";

        // Remove fenced markdown blocks like ```json ... ```
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
