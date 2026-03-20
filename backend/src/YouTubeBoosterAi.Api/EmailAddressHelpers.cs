using System.Security.Claims;

namespace YouTubeBoosterAi.Api;

/// <summary>
/// Cognito sometimes exposes <c>cognito:username</c> / <c>username</c> as a UUID (same as <c>sub</c>).
/// Those must not be treated as an email for Stripe <see cref="Stripe.Checkout.SessionCreateOptions.CustomerEmail" />
/// or for <c>EMAIL#...</c> keys when a real email claim is missing.
/// </summary>
internal static class EmailAddressHelpers
{
    /// <summary>
    /// Minimal RFC-ish check: must contain @, a dot in the domain, and no spaces.
    /// </summary>
    public static bool LooksLikeEmail(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var v = value.Trim();
        if (v.Length > 254) return false;
        if (v.Contains(' ', StringComparison.Ordinal)) return false;
        var at = v.IndexOf('@');
        if (at <= 0 || at >= v.Length - 1) return false;
        var domain = v[(at + 1)..];
        return domain.Contains('.', StringComparison.Ordinal);
    }

    /// <summary>
    /// Best email to store on <see cref="UserAccount"/> / Dynamo mappings when signing in with Cognito.
    /// </summary>
    public static string ResolveCognitoAccountEmail(ClaimsPrincipal principal, string stableUserIdForSyntheticEmail)
    {
        foreach (var claimType in new[] { "email", "emailaddress", ClaimTypes.Email })
        {
            var v = principal.FindFirst(claimType)?.Value;
            if (LooksLikeEmail(v)) return v!.Trim();
        }

        foreach (var claimType in new[] { "cognito:username", "preferred_username", "username" })
        {
            var v = principal.FindFirst(claimType)?.Value;
            // Only use username-style claims when they are actually an email address.
            if (LooksLikeEmail(v)) return v!.Trim();
        }

        if (string.IsNullOrWhiteSpace(stableUserIdForSyntheticEmail))
        {
            throw new InvalidOperationException("Cannot synthesize email without a stable user id.");
        }

        // Deterministic, valid email shape for internal bookkeeping (not necessarily deliverable).
        return $"{stableUserIdForSyntheticEmail.Trim()}@users.id.ytbooster.internal";
    }
}
