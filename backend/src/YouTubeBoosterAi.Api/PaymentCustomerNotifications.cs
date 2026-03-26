using System.Globalization;
using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public interface IPaymentCustomerNotificationService
{
    Task NotifyCustomerPaymentAsync(
        PaymentRecord payment,
        UserAccount user,
        string? stripeSessionId,
        string? stripePaymentIntentId,
        string planCode,
        CancellationToken cancellationToken);
}

public sealed class NoOpPaymentCustomerNotificationService : IPaymentCustomerNotificationService
{
    public Task NotifyCustomerPaymentAsync(
        PaymentRecord payment,
        UserAccount user,
        string? stripeSessionId,
        string? stripePaymentIntentId,
        string planCode,
        CancellationToken cancellationToken) => Task.CompletedTask;
}

public sealed class SesPaymentCustomerNotificationService : IPaymentCustomerNotificationService
{
    private readonly IAmazonSimpleEmailService _ses;
    private readonly ISecretValueProvider _secrets;
    private readonly IConfiguration _configuration;

    public SesPaymentCustomerNotificationService(
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secrets,
        IConfiguration configuration)
    {
        _ses = ses;
        _secrets = secrets;
        _configuration = configuration;
    }

    public async Task NotifyCustomerPaymentAsync(
        PaymentRecord payment,
        UserAccount user,
        string? stripeSessionId,
        string? stripePaymentIntentId,
        string planCode,
        CancellationToken cancellationToken)
    {
        // Only send for real payments.
        if (payment.Amount <= 0m) return;

        var fromAddress = await _secrets.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(fromAddress)) return;

        var to = user.Email?.Trim();
        if (string.IsNullOrWhiteSpace(to) || !EmailAddressHelpers.LooksLikeEmail(to)) return;

        var fromName = _configuration["App:BillingFromName"]
                       ?? _configuration["BILLING_FROM_NAME"]
                       ?? "YouTubeBoosterAI";
        var fromSource = $"{fromName} <{fromAddress}>";

        var baseUrl = _configuration["App:PublicSiteUrl"]
                      ?? _configuration["PUBLIC_SITE_URL"]
                      ?? "https://youtubeboosterai.com";
        baseUrl = baseUrl.TrimEnd('/');

        var amount = payment.Amount.ToString("F2", CultureInfo.InvariantCulture);
        var subject = $"Your YouTubeBoosterAI purchase is confirmed ({amount} {payment.Currency})";

        var body = $"""
            Thanks for your purchase — your YouTubeBoosterAI access is now active.

            What you unlocked:
            - Plan: {planCode}
            - Dashboard access + premium audit modules

            Next step:
            Open the audit flow and analyze your channel:
            {baseUrl}/#audit

            Purchase details:
            - Amount: {amount} {payment.Currency}
            - Mode: {payment.Mode}
            - Stripe session: {stripeSessionId ?? payment.StripeCheckoutSessionId}
            - Payment intent: {stripePaymentIntentId ?? payment.StripePaymentIntentId ?? "(none)"}

            If you have any issues, reply to this email or contact us at {baseUrl}/contact.
            """;

        try
        {
            await _ses.SendEmailAsync(new SendEmailRequest
            {
                Source = fromSource,
                Destination = new Destination { ToAddresses = [to] },
                ReplyToAddresses = [fromAddress],
                ReturnPath = fromAddress,
                Message = new Message
                {
                    Subject = new Content(subject),
                    Body = new Body { Text = new Content(body) }
                }
            }, cancellationToken);
        }
        catch
        {
            // Avoid throwing from webhook path.
        }
    }
}

