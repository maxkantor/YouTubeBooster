using System.Net.Mail;
using System.Text.RegularExpressions;

namespace YouTubeBoosterAi.Api;

internal static class ContactSubmissionValidator
{
    private static readonly Regex EmailRegex = new(
        @"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    internal const int SubjectMax = 200;
    internal const int MessageMin = 10;
    internal const int MessageMax = 12000;
    internal const int NameMax = 120;

    /// <summary>Returns null if valid; otherwise a safe, user-facing error message.</summary>
    public static string? Validate(SupportTicketRequest request)
    {
        var email = request.Email?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254)
        {
            return "A valid email is required.";
        }

        if (!LooksLikeEmail(email))
        {
            return "Email format is invalid.";
        }

        var subject = request.Subject?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(subject))
        {
            return "Subject is required.";
        }

        if (subject.Length > SubjectMax)
        {
            return $"Subject must be at most {SubjectMax} characters.";
        }

        if (subject.Contains('\r') || subject.Contains('\n'))
        {
            return "Subject cannot contain line breaks.";
        }

        var message = request.Message?.Trim() ?? string.Empty;
        if (message.Length < MessageMin)
        {
            return $"Message must be at least {MessageMin} characters.";
        }

        if (message.Length > MessageMax)
        {
            return $"Message must be at most {MessageMax} characters.";
        }

        var name = request.Name?.Trim();
        if (!string.IsNullOrEmpty(name) && name.Length > NameMax)
        {
            return $"Name must be at most {NameMax} characters.";
        }

        var accountEmail = request.AccountEmail?.Trim();
        if (!string.IsNullOrWhiteSpace(accountEmail) && !LooksLikeEmail(accountEmail))
        {
            return "Account email format is invalid.";
        }

        var orderRef = request.OrderReference?.Trim();
        if (!string.IsNullOrEmpty(orderRef) && orderRef.Length > 200)
        {
            return "Order reference is too long.";
        }

        return null;
    }

    private static bool LooksLikeEmail(string email)
    {
        try
        {
            _ = new MailAddress(email);
        }
        catch
        {
            return false;
        }

        return EmailRegex.IsMatch(email);
    }
}
