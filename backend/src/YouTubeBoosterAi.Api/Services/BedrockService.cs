using System.Text;
using System.Text.Json;
using Amazon.BedrockRuntime;
using Amazon.BedrockRuntime.Model;
using Microsoft.Extensions.Configuration;

namespace YouTubeBoosterAi.Api;

public sealed class BedrockService : IBedrockService
{
    private readonly IAmazonBedrockRuntime _bedrock;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BedrockService> _logger;

    public BedrockService(
        IAmazonBedrockRuntime bedrock,
        ISecretValueProvider secretValueProvider,
        IConfiguration configuration,
        ILogger<BedrockService> logger)
    {
        _bedrock = bedrock;
        _secretValueProvider = secretValueProvider;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string> InvokeModelAsync(string prompt, double temperature, int maxTokens, CancellationToken cancellationToken)
    {
        var modelId = Environment.GetEnvironmentVariable("BEDROCK_MODEL_ID")?.Trim()
            ?? _configuration["BEDROCK_MODEL_ID"]?.Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            modelId = (await _secretValueProvider.GetValueAsync("bedrock/model", secure: false, cancellationToken))?.Trim();
        }

        if (string.IsNullOrWhiteSpace(modelId))
        {
            modelId = "anthropic.claude-3-sonnet-20240229-v1:0";
        }

        var effectiveMaxTokens = Math.Clamp(maxTokens, 800, 1200);
        var effectiveTemperature = Math.Clamp(temperature, 0.1, 1.0);

        var payload = new
        {
            anthropic_version = "bedrock-2023-05-31",
            max_tokens = effectiveMaxTokens,
            temperature = effectiveTemperature,
            messages = new[]
            {
                new
                {
                    role = "user",
                    content = new[]
                    {
                        new { type = "text", text = prompt }
                    }
                }
            }
        };

        var bodyJson = JsonSerializer.Serialize(payload);

        // 12s was too tight for Sonnet under load (503s + long Network waterfall). Stay under Lambda's 30s total.
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(24));

            var response = await _bedrock.InvokeModelAsync(new InvokeModelRequest
            {
                ModelId = modelId,
                ContentType = "application/json",
                Accept = "application/json",
                Body = new MemoryStream(Encoding.UTF8.GetBytes(bodyJson))
            }, timeoutCts.Token);

            using var reader = new StreamReader(response.Body);
            var responseJson = await reader.ReadToEndAsync(timeoutCts.Token);
            var text = ExtractAnthropicText(responseJson);

            if (string.IsNullOrWhiteSpace(text))
            {
                throw new InvalidOperationException("Empty response from Bedrock model.");
            }

            return text.Trim();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException oce)
        {
            _logger.LogWarning(oce, "Bedrock invoke timed out");
            throw new InvalidOperationException("AI generation failed: Bedrock invoke timed out.", oce);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bedrock invoke failed");
            throw;
        }
    }

    private static string ExtractAnthropicText(string responseJson)
    {
        using var doc = JsonDocument.Parse(responseJson);
        var root = doc.RootElement;

        if (root.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
        {
            foreach (var part in content.EnumerateArray())
            {
                if (part.TryGetProperty("type", out var type)
                    && string.Equals(type.GetString(), "text", StringComparison.OrdinalIgnoreCase)
                    && part.TryGetProperty("text", out var textEl))
                {
                    return textEl.GetString() ?? string.Empty;
                }
            }
        }

        if (root.TryGetProperty("completion", out var completion))
        {
            return completion.GetString() ?? string.Empty;
        }

        return string.Empty;
    }
}
