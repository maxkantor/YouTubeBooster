namespace YouTubeBoosterAi.Api;

/// <summary>
/// Shared normalization for channel URLs/handles. Used by both
/// <see cref="YouTubePublicDemoAnalysisService"/> (POST /api/public/demo) and
/// <see cref="YouTubePublicDashboardService"/> (GET /api/public/channel/*).
/// </summary>
internal static class YouTubeChannelInputHelpers
{
    /// <summary>
    /// Some clients pass percent-encoded channel URLs (e.g. .../%40LandsharkOutdoors or the whole URL encoded in a query string).
    /// Decode so <c>@handle</c> regex extraction works reliably.
    /// </summary>
    public static string DecodeChannelInput(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return input;

        var value = input.Trim();
        for (var i = 0; i < 3; i++)
        {
            if (!value.Contains('%', StringComparison.Ordinal)) break;
            try
            {
                var decoded = Uri.UnescapeDataString(value);
                if (string.Equals(decoded, value, StringComparison.Ordinal)) break;
                value = decoded;
            }
            catch
            {
                break;
            }
        }

        return value;
    }
}
