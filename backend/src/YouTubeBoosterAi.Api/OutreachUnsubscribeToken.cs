using System.Security.Cryptography;
using System.Text;

namespace YouTubeBoosterAi.Api;

public sealed record OutreachContactRecord(
    string Email,
    string? Name,
    string? ProspectId,
    string? ChannelUrl,
    string? Handle,
    string Status,
    DateTimeOffset? LastSentAt,
    DateTimeOffset? UnsubscribedAt,
    DateTimeOffset UpdatedAt
);

public sealed record OutreachSeedContact(
    string Email,
    string? Name = null,
    string? ProspectId = null,
    string? ChannelUrl = null,
    string? Handle = null,
    string? Subject = null,
    string? Body = null
);

public sealed record DailyOutreachRequest(int? Count, IReadOnlyList<OutreachSeedContact>? Contacts);

public static class OutreachUnsubscribeToken
{
    public static string Create(string email, string secret)
    {
        var normalized = email.Trim().ToLowerInvariant();
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes(normalized))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var mac = Convert.ToBase64String(Hmac(normalized, secret))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return $"{payload}.{mac}";
    }

    public static bool TryValidate(string token, string secret, out string email)
    {
        email = "";
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(secret)) return false;
        var parts = token.Trim().Split('.');
        if (parts.Length != 2) return false;
        try
        {
            var payload = Encoding.UTF8.GetString(FromBase64Url(parts[0])).Trim().ToLowerInvariant();
            if (!EmailAddressHelpers.LooksLikeEmail(payload)) return false;
            var expected = Hmac(payload, secret);
            var actual = FromBase64Url(parts[1]);
            if (!CryptographicOperations.FixedTimeEquals(expected, actual)) return false;
            email = payload;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static byte[] Hmac(string normalizedEmail, string secret) =>
        HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(normalizedEmail));

    private static byte[] FromBase64Url(string s)
    {
        var padded = s.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }
        return Convert.FromBase64String(padded);
    }
}
