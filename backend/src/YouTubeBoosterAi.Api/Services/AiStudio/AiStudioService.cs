using System.Diagnostics;
using YouTubeBoosterAi.Api.Services.AiStudio;

namespace YouTubeBoosterAi.Api;

/// <summary>
/// Orchestrates AI Growth Studio: server-side preview (no Bedrock) for non-premium users; Bedrock for premium.
/// </summary>
public sealed class AiStudioService : IAiStudioService
{
    private readonly IPromptBuilder _promptBuilder;
    private readonly IBedrockService _bedrockService;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IAppDataStore _appDataStore;
    private readonly ILogger<AiStudioService> _logger;

    public AiStudioService(
        IPromptBuilder promptBuilder,
        IBedrockService bedrockService,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore,
        ILogger<AiStudioService> logger)
    {
        _promptBuilder = promptBuilder;
        _bedrockService = bedrockService;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
        _logger = logger;
    }

    public async Task<AiStudioGenerateResponse> GenerateAsync(
        AiGenerateRequest request,
        UserAccount user,
        bool hasPremium,
        CancellationToken cancellationToken)
    {
        var action = NormalizeAction(request.Action);
        var sw = Stopwatch.StartNew();

        if (!hasPremium)
        {
            var (previewNotes, previewItems) = AiStudioPreviewBuilder.Build(action, request.Input ?? new AiGenerateInput(null, null, null, null));
            sw.Stop();
            _logger.LogInformation(
                "AI studio preview user={UserId} action={Action} premium=false durationMs={Ms} model=none region=none",
                user.UserId,
                action,
                sw.ElapsedMilliseconds);

            await _appDataStore.TrackEventAsync("ai_studio", user.UserId, new Dictionary<string, string?>
            {
                ["action"] = action,
                ["mode"] = "preview",
                ["itemCount"] = previewItems.Count.ToString(),
                ["durationMs"] = sw.ElapsedMilliseconds.ToString()
            }, cancellationToken);

            return new AiStudioGenerateResponse(
                Success: true,
                Action: action,
                Preview: true,
                Locked: true,
                Items: previewItems,
                Notes: previewNotes,
                GeneratedAt: DateTimeOffset.UtcNow
            );
        }

        var prompt = _promptBuilder.BuildPrompt(request with { Action = action });

        var maxTokensRaw = await _secretValueProvider.GetValueAsync("bedrock/maxTokens", secure: false, cancellationToken);
        var temperatureRaw = await _secretValueProvider.GetValueAsync("bedrock/temperature", secure: false, cancellationToken);

        // Richer JSON (strategy + bestPick + options + why blocks) needs headroom vs plain lists.
        var maxTokens = int.TryParse(maxTokensRaw, out var parsedMax) ? parsedMax : 1100;
        var temperature = double.TryParse(temperatureRaw, out var parsedTemp) ? parsedTemp : 0.7;

        var modelId = await ResolveModelIdForLogAsync(cancellationToken);
        var region = Environment.GetEnvironmentVariable("BEDROCK_REGION")
            ?? Environment.GetEnvironmentVariable("AWS_REGION")
            ?? "configured-default";

        string modelText;
        try
        {
            modelText = await _bedrockService.InvokeModelAsync(prompt, temperature, maxTokens, cancellationToken);
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex,
                "AI studio Bedrock failure user={UserId} action={Action} model={Model} region={Region} durationMs={Ms}",
                user.UserId, action, modelId, region, sw.ElapsedMilliseconds);
            throw;
        }

        var (summary, items) = AiStudioModelParser.Parse(modelText, action, _logger);
        sw.Stop();

        _logger.LogInformation(
            "AI studio live user={UserId} action={Action} premium=true model={Model} region={Region} durationMs={Ms} itemCount={Count}",
            user.UserId,
            action,
            modelId,
            region,
            sw.ElapsedMilliseconds,
            items.Count);

        await _appDataStore.TrackEventAsync("ai_studio", user.UserId, new Dictionary<string, string?>
        {
            ["action"] = action,
            ["mode"] = "live",
            ["model"] = modelId,
            ["region"] = region,
            ["resultCount"] = items.Count.ToString(),
            ["durationMs"] = sw.ElapsedMilliseconds.ToString()
        }, cancellationToken);

        return new AiStudioGenerateResponse(
            Success: true,
            Action: action,
            Preview: false,
            Locked: false,
            Items: items,
            Notes: summary,
            GeneratedAt: DateTimeOffset.UtcNow
        );
    }

    private async Task<string> ResolveModelIdForLogAsync(CancellationToken cancellationToken)
    {
        var env = Environment.GetEnvironmentVariable("BEDROCK_MODEL_ID");
        if (!string.IsNullOrWhiteSpace(env)) return env.Trim();

        var ssm = (await _secretValueProvider.GetValueAsync("bedrock/model", secure: false, cancellationToken))?.Trim();
        return string.IsNullOrWhiteSpace(ssm) ? "anthropic.claude-3-sonnet-20240229-v1:0" : ssm;
    }

    private static string NormalizeAction(string? action)
        => (action ?? string.Empty).Trim().ToLowerInvariant();
}
