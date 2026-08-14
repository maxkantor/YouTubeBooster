using System.Net;
using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public sealed record SupportCrmSendResult(bool Ok, string? SesMessageId, string? Error);

/// <summary>
/// Outbound CRM mail: SES From = ses/from-email, Reply-To + BCC = admin/email.
/// Recipient replies therefore land in the Admin CRM inbox.
/// </summary>
public static class SupportCrmEmail
{
    public static async Task<(string? From, string? Admin)> LoadAddressesAsync(
        ISecretValueProvider secrets,
        CancellationToken cancellationToken)
    {
        var from = await secrets.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        var admin = await secrets.GetValueAsync("admin/email", secure: false, cancellationToken);
        if (string.IsNullOrWhiteSpace(admin))
        {
            admin = await secrets.GetValueAsync("ses/admin-email", secure: false, cancellationToken);
        }
        return (from?.Trim(), admin?.Trim());
    }

    public static async Task<SupportCrmSendResult> SendToRecipientAsync(
        IAmazonSimpleEmailService ses,
        string fromAddress,
        string adminEmail,
        string recipientEmail,
        string ticketId,
        string subject,
        string body,
        string publicSiteUrl,
        CancellationToken cancellationToken,
        string? unsubscribeUrl = null)
    {
        if (!EmailAddressHelpers.LooksLikeEmail(fromAddress))
            return new SupportCrmSendResult(false, null, "SES from-email is not configured.");
        if (!EmailAddressHelpers.LooksLikeEmail(recipientEmail))
            return new SupportCrmSendResult(false, null, "Recipient email is invalid.");

        var site = (publicSiteUrl ?? "https://youtubeboosterai.com").TrimEnd('/');
        var crmUrl = $"{site}/admin/contacts/{Uri.EscapeDataString(ticketId)}";
        var taggedSubject = subject.Contains(ticketId, StringComparison.OrdinalIgnoreCase)
            ? subject
            : $"{subject} [{ticketId}]";

        var footer = $"""

            ---
            YouTubeBooster Admin CRM thread: {crmUrl}
            Please reply to this email. Replies go to the YouTubeBooster admin inbox.
            {(string.IsNullOrWhiteSpace(unsubscribeUrl) ? "" : $"Unsubscribe: {unsubscribeUrl}")}
            """;

        var textBody = body + footer;
        var htmlBody = $"""
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>
            <body style="font-family:Segoe UI,Arial,sans-serif;color:#111827;line-height:1.5;">
            <div style="white-space:pre-wrap;">{WebUtility.HtmlEncode(body)}</div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
            <p style="font-size:12px;color:#6b7280;">YouTubeBooster Admin CRM thread: <a href="{WebUtility.HtmlEncode(crmUrl)}">{WebUtility.HtmlEncode(crmUrl)}</a><br/>Please reply to this email. Replies go to the YouTubeBooster admin inbox.{(string.IsNullOrWhiteSpace(unsubscribeUrl) ? "" : $"<br/><a href=\"{WebUtility.HtmlEncode(unsubscribeUrl)}\">Unsubscribe from YouTubeBooster outreach</a>")}</p>
            </body></html>
            """;

        var destination = new Destination { ToAddresses = [recipientEmail.Trim()] };
        if (EmailAddressHelpers.LooksLikeEmail(adminEmail)
            && !string.Equals(adminEmail.Trim(), recipientEmail.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            destination.BccAddresses = [adminEmail.Trim()];
        }

        var replyTo = EmailAddressHelpers.LooksLikeEmail(adminEmail) ? adminEmail.Trim() : fromAddress;

        try
        {
            var response = await ses.SendEmailAsync(new SendEmailRequest
            {
                Source = $"YouTubeBooster Support <{fromAddress}>",
                Destination = destination,
                ReplyToAddresses = [replyTo],
                ReturnPath = fromAddress,
                Message = new Message
                {
                    Subject = new Content(taggedSubject) { Charset = "UTF-8" },
                    Body = new Body
                    {
                        Text = new Content(textBody) { Charset = "UTF-8" },
                        Html = new Content(htmlBody) { Charset = "UTF-8" }
                    }
                }
            }, cancellationToken);
            return new SupportCrmSendResult(true, response.MessageId, null);
        }
        catch (Exception ex)
        {
            return new SupportCrmSendResult(false, null, ex.Message);
        }
    }

    public static async Task NotifyAdminInboundAsync(
        IAmazonSimpleEmailService ses,
        string fromAddress,
        string adminEmail,
        string ticketId,
        string recipientEmail,
        string subject,
        string snippet,
        string publicSiteUrl,
        CancellationToken cancellationToken)
    {
        if (!EmailAddressHelpers.LooksLikeEmail(fromAddress) || !EmailAddressHelpers.LooksLikeEmail(adminEmail))
            return;

        var site = (publicSiteUrl ?? "https://youtubeboosterai.com").TrimEnd('/');
        var crmUrl = $"{site}/admin/contacts/{Uri.EscapeDataString(ticketId)}";
        var text = $"""
            A recipient reply was recorded in Admin CRM.

            Ticket: {ticketId}
            From: {recipientEmail}
            Subject: {subject}
            CRM: {crmUrl}

            Preview:
            {snippet}

            Continue the conversation from Admin CRM (Support → this ticket), not from a personal mailbox, so the thread stays complete.
            """;

        await ses.SendEmailAsync(new SendEmailRequest
        {
            Source = $"YouTubeBooster Support <{fromAddress}>",
            Destination = new Destination { ToAddresses = [adminEmail.Trim()] },
            ReplyToAddresses = [adminEmail.Trim()],
            ReturnPath = fromAddress,
            Message = new Message
            {
                Subject = new Content($"[YouTubeBooster CRM] Recipient replied — {ticketId}") { Charset = "UTF-8" },
                Body = new Body { Text = new Content(text) { Charset = "UTF-8" } }
            }
        }, cancellationToken);
    }
}
