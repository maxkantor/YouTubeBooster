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
    private readonly IAppSettingsProvider _appSettingsProvider;

    public SesSupportNotificationService(
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secretValueProvider,
        IAppSettingsProvider appSettingsProvider)
    {
        _ses = ses;
        _secretValueProvider = secretValueProvider;
        _appSettingsProvider = appSettingsProvider;
    }

    public async Task NotifyNewTicketAsync(string ticketId, SupportTicketRequest request, CancellationToken cancellationToken)
    {
        var fromAddress = await _secretValueProvider.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        var settings = await _appSettingsProvider.GetSettingsAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(fromAddress) || string.IsNullOrWhiteSpace(settings.SupportEmail))
        {
            return;
        }

        var body = $"""
        New support ticket: {ticketId}

        Email: {request.Email}
        Name: {request.Name}
        Product Area: {request.ProductArea}
        Channel URL: {request.ChannelUrl}

        Subject:
        {request.Subject}

        Message:
        {request.Message}
        """;

        await _ses.SendEmailAsync(new SendEmailRequest
        {
            Source = fromAddress,
            Destination = new Destination
            {
                ToAddresses = [settings.SupportEmail]
            },
            Message = new Message
            {
                Subject = new Content($"[YouTube Booster AI] New support ticket {ticketId}"),
                Body = new Body
                {
                    Text = new Content(body)
                }
            }
        }, cancellationToken);
    }
}
