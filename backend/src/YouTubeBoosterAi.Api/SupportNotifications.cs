using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public interface ISupportNotificationService
{
    Task NotifyNewTicketAsync(string ticketId, SupportTicketRequest request, CancellationToken cancellationToken);
}

public sealed class NoOpSupportNotificationService : ISupportNotificationService
{
    public Task NotifyNewTicketAsync(string ticketId, SupportTicketRequest request, CancellationToken cancellationToken) => Task.CompletedTask;
}

public sealed class SesSupportNotificationService : ISupportNotificationService
{
    private readonly IAmazonSimpleEmailService _ses;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IAppDataStore _appDataStore;
    private readonly IConfiguration _configuration;

    public SesSupportNotificationService(
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore,
        IConfiguration configuration)
    {
        _ses = ses;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
        _configuration = configuration;
    }

    public async Task NotifyNewTicketAsync(string ticketId, SupportTicketRequest request, CancellationToken cancellationToken)
    {
        var eventName = AdminNotificationPrefs.IsContactLikeSource(request.Source)
            ? AdminNotificationPrefs.ContactSubmitted
            : AdminNotificationPrefs.SupportCreated;
        if (!await AdminNotificationPrefs.IsEnabledAsync(_secretValueProvider, eventName, cancellationToken))
        {
            await _appDataStore.TrackEventAsync("contact_admin_notification_skipped", ticketId, new Dictionary<string, string?>
            {
                ["reason"] = "pref_disabled",
                ["event"] = eventName
            }, cancellationToken);
            return;
        }

        var fromAddress = await _secretValueProvider.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        var adminEmail = await _secretValueProvider.GetValueAsync("admin/email", secure: false, cancellationToken);
        if (string.IsNullOrWhiteSpace(adminEmail))
            adminEmail = await _secretValueProvider.GetValueAsync("ses/admin-email", secure: false, cancellationToken);

        if (string.IsNullOrWhiteSpace(fromAddress) || string.IsNullOrWhiteSpace(adminEmail))
        {
            await _appDataStore.TrackEventAsync("contact_admin_notification_failed", ticketId, new Dictionary<string, string?>
            {
                ["reason"] = "missing_ses_or_admin_email"
            }, cancellationToken);
            return;
        }

        var baseUrl = _configuration["App:PublicSiteUrl"]
                      ?? _configuration["PUBLIC_SITE_URL"]
                      ?? "https://youtubeboosterai.com";
        baseUrl = baseUrl.TrimEnd('/');

        var fromName = _configuration["App:SupportFromName"]
                       ?? _configuration["SUPPORT_FROM_NAME"]
                       ?? "YouTubeBooster Support";
        var fromSource = $"{fromName} <{fromAddress}>";
        var subject = $"[YouTubeBooster] New contact: {request.Subject}";
        var body = $"""
            New contact / support thread

            Ticket ID: {ticketId}
            CRM: {baseUrl}/admin/contacts/{Uri.EscapeDataString(ticketId)}

            Contact name: {request.Name ?? "(not provided)"}
            Contact email: {request.Email}
            Account email (if different): {request.AccountEmail ?? "(not provided)"}
            Order reference: {request.OrderReference ?? "(not provided)"}
            Channel URL: {request.ChannelUrl ?? "(not provided)"}
            Area: {request.ProductArea}
            Source: {request.Source ?? "contact_form"}

            Subject:
            {request.Subject}

            Message:
            {request.Message}

            Created (UTC): {DateTimeOffset.UtcNow:O}
            """;

        try
        {
            var sendRequest = new SendEmailRequest
            {
                Source = fromSource,
                Destination = new Destination { ToAddresses = [adminEmail] },
                ReplyToAddresses = string.IsNullOrWhiteSpace(request.Email) ? null : [request.Email],
                ReturnPath = fromAddress,
                Message = new Message
                {
                    Subject = new Content(subject) { Charset = "UTF-8" },
                    Body = new Body { Text = new Content(body) { Charset = "UTF-8" } }
                }
            };

            await _ses.SendEmailAsync(sendRequest, cancellationToken);

            await _appDataStore.TrackEventAsync("contact_admin_notification_sent", ticketId, new Dictionary<string, string?>
            {
                ["to"] = adminEmail
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            await _appDataStore.TrackEventAsync("contact_admin_notification_failed", ticketId, new Dictionary<string, string?>
            {
                ["reason"] = ex.Message
            }, cancellationToken);
        }
    }
}
