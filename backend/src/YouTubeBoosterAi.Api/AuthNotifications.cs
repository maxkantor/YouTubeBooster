using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public interface IMagicLinkNotificationService
{
    Task<MagicLinkLoginResponse> SendMagicLinkAsync(string email, string magicLinkUrl, CancellationToken cancellationToken);
}

public sealed class SesMagicLinkNotificationService : IMagicLinkNotificationService
{
    private readonly IAmazonSimpleEmailService _ses;
    private readonly ISecretValueProvider _secretValueProvider;

    public SesMagicLinkNotificationService(IAmazonSimpleEmailService ses, ISecretValueProvider secretValueProvider)
    {
        _ses = ses;
        _secretValueProvider = secretValueProvider;
    }

    public async Task<MagicLinkLoginResponse> SendMagicLinkAsync(string email, string magicLinkUrl, CancellationToken cancellationToken)
    {
        var fromAddress = await _secretValueProvider.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            return new MagicLinkLoginResponse(
                Email: email,
                Delivery: "mock",
                Message: "Email delivery is not configured, so the magic link is returned directly for local testing.",
                MagicLinkUrl: magicLinkUrl
            );
        }

        var body = $"""
        Sign in to YouTube Booster AI

        Open this secure sign-in link:
        {magicLinkUrl}

        This link expires in 20 minutes.
        """;

        await _ses.SendEmailAsync(new SendEmailRequest
        {
            Source = fromAddress,
            Destination = new Destination
            {
                ToAddresses = [email]
            },
            Message = new Message
            {
                Subject = new Content("Your YouTube Booster AI sign-in link"),
                Body = new Body
                {
                    Text = new Content(body)
                }
            }
        }, cancellationToken);

        return new MagicLinkLoginResponse(
            Email: email,
            Delivery: "email",
            Message: "A magic link has been sent to your email.",
            MagicLinkUrl: null
        );
    }
}
