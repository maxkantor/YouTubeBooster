using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public interface IPaymentAdminNotificationService
{
    Task NotifySuccessfulPaymentAsync(
        PaymentRecord payment,
        UserAccount user,
        string? stripeSessionId,
        string? stripePaymentIntentId,
        string planCode,
        CancellationToken cancellationToken);
}

public sealed class NoOpPaymentAdminNotificationService : IPaymentAdminNotificationService
{
    public Task NotifySuccessfulPaymentAsync(
        PaymentRecord payment,
        UserAccount user,
        string? stripeSessionId,
        string? stripePaymentIntentId,
        string planCode,
        CancellationToken cancellationToken) => Task.CompletedTask;
}

public sealed class SesPaymentAdminNotificationService : IPaymentAdminNotificationService
{
    private readonly IAmazonSimpleEmailService _ses;
    private readonly ISecretValueProvider _secrets;
    private readonly IConfiguration _configuration;

    public SesPaymentAdminNotificationService(
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secrets,
        IConfiguration configuration)
    {
        _ses = ses;
        _secrets = secrets;
        _configuration = configuration;
    }

    public async Task NotifySuccessfulPaymentAsync(
        PaymentRecord payment,
        UserAccount user,
        string? stripeSessionId,
        string? stripePaymentIntentId,
        string planCode,
        CancellationToken cancellationToken)
    {
        var from = await _secrets.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        var adminTo = await _secrets.GetValueAsync("admin/email", secure: false, cancellationToken);
        if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(adminTo))
        {
            return;
        }

        if (payment.Amount <= 0m)
        {
            return;
        }

        var baseUrl = _configuration["App:PublicSiteUrl"]
                       ?? _configuration["PUBLIC_SITE_URL"]
                       ?? "https://youtubeboosterai.com";
        baseUrl = baseUrl.TrimEnd('/');

        var fromName = _configuration["App:BillingFromName"]
                       ?? _configuration["BILLING_FROM_NAME"]
                       ?? "YouTubeBoosterAI";
        var fromSource = $"{fromName} <{from}>";
        var subject = $"[YouTubeBoosterAI] New payment received — {payment.Amount:F2} {payment.Currency} ({payment.Mode})";
        var body = $"""
            A successful Stripe checkout completed.

            Amount: {payment.Amount:F2} {payment.Currency}
            Mode: {payment.Mode}
            Plan / SKU: {planCode}
            User ID: {user.UserId}
            Account email: {user.Email}
            Stripe email (checkout): {payment.StripeEmail ?? "(none)"}
            Stripe session: {stripeSessionId ?? payment.StripeCheckoutSessionId}
            Payment intent: {stripePaymentIntentId ?? payment.StripePaymentIntentId ?? "(none)"}
            Payment record: {payment.PaymentId}
            Time (UTC): {DateTimeOffset.UtcNow:O}

            Admin: {baseUrl}/admin/orders
            User: {baseUrl}/admin/user/{Uri.EscapeDataString(user.UserId)}
            """;

        try
        {
            await _ses.SendEmailAsync(new SendEmailRequest
            {
                Source = fromSource,
                Destination = new Destination { ToAddresses = [adminTo] },
                ReplyToAddresses = [from],
                ReturnPath = from,
                Message = new Message
                {
                    Subject = new Content(subject),
                    Body = new Body { Text = new Content(body) }
                }
            }, cancellationToken);
        }
        catch
        {
            // Caller may log via activity; avoid throwing from webhook
        }
    }
}
