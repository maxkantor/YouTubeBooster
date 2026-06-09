using System.Text;
using Amazon.Lambda.APIGatewayEvents;

namespace YouTubeBoosterAi.Api;

/// <summary>
/// Stripe signs payloads with a header like "t=...,v1=...,v0=...".
/// ASP.NET may split that into multiple header values when commas are present;
/// using FirstOrDefault() drops v1= and breaks verification.
/// </summary>
public static class StripeWebhookHttp
{
    public const string SignatureHeaderName = "Stripe-Signature";

    public static async Task<StripeWebhookRequest> ReadAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        var fromLambda = TryReadFromApiGatewayV2(request);
        if (fromLambda is not null)
        {
            return fromLambda;
        }

        var signature = ResolveStripeSignature(request);
        var payload = await ReadBodyAsync(request, cancellationToken);
        return new StripeWebhookRequest(payload, signature);
    }

    public static string? ResolveStripeSignature(HttpRequest request)
    {
        foreach (var header in request.Headers)
        {
            if (!header.Key.Equals(SignatureHeaderName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var joined = string.Join(",", header.Value.Where(v => !string.IsNullOrWhiteSpace(v)));
            if (!string.IsNullOrWhiteSpace(joined))
            {
                return joined.Trim();
            }
        }

        return null;
    }

    private static StripeWebhookRequest? TryReadFromApiGatewayV2(HttpRequest request)
    {
        if (!TryGetApiGatewayV2Request(request.HttpContext, out var apiRequest))
        {
            return null;
        }

        string? signature = null;
        if (apiRequest.Headers is not null)
        {
            foreach (var (key, value) in apiRequest.Headers)
            {
                if (key.Equals(SignatureHeaderName, StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(value))
                {
                    signature = value.Trim();
                    break;
                }
            }
        }

        var body = apiRequest.Body ?? string.Empty;
        if (apiRequest.IsBase64Encoded && !string.IsNullOrEmpty(body))
        {
            body = Encoding.UTF8.GetString(Convert.FromBase64String(body));
        }

        return new StripeWebhookRequest(body, signature);
    }

    private static bool TryGetApiGatewayV2Request(HttpContext context, out APIGatewayHttpApiV2ProxyRequest apiRequest)
    {
        foreach (var key in new[] { nameof(APIGatewayHttpApiV2ProxyRequest), "Amazon.Lambda.AspNetCoreServer.APIGatewayHttpApiV2ProxyRequest" })
        {
            if (context.Items.TryGetValue(key, out var raw) && raw is APIGatewayHttpApiV2ProxyRequest typed)
            {
                apiRequest = typed;
                return true;
            }
        }

        apiRequest = null!;
        return false;
    }

    private static async Task<string> ReadBodyAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        request.EnableBuffering();
        request.Body.Position = 0;
        using var reader = new StreamReader(request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        request.Body.Position = 0;
        return payload;
    }
}

public sealed record StripeWebhookRequest(string Payload, string? SignatureHeader);
