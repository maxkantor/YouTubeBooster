namespace YouTubeBoosterAi.Api;

public sealed class PaymentBackfillService
{
    private readonly IAppDataStore _appDataStore;
    private readonly ISecretValueProvider _secretValueProvider;

    public PaymentBackfillService(IAppDataStore appDataStore, ISecretValueProvider secretValueProvider)
    {
        _appDataStore = appDataStore;
        _secretValueProvider = secretValueProvider;
    }

    /// <summary>
    /// Backfills payment.mode from Stripe Checkout Session livemode. Does not delete records.
    /// Unknown sessions are marked test with statusNote legacy_unverified_test_assumed.
    /// </summary>
    public async Task<PaymentBackfillResultDto> BackfillPaymentLiveModesAsync(CancellationToken cancellationToken)
    {
        var payments = await _appDataStore.ListAllPaymentRecordsAsync(5000, cancellationToken);
        var notes = new List<string>();
        var updated = 0;
        var assumedTest = 0;
        var confirmedLive = 0;
        var confirmedTest = 0;

        var stripeSecret = await _secretValueProvider.GetValueAsync("stripe/secret-key", secure: true, cancellationToken);
        Stripe.Checkout.SessionService? sessionService = null;
        if (!string.IsNullOrWhiteSpace(stripeSecret))
        {
            Stripe.StripeConfiguration.ApiKey = stripeSecret;
            sessionService = new Stripe.Checkout.SessionService();
        }

        foreach (var payment in payments)
        {
            var sessionId = payment.StripeCheckoutSessionId;
            if (string.IsNullOrWhiteSpace(sessionId))
            {
                continue;
            }

            string mode;
            string? statusNote = payment.StatusNote;

            if (sessionService is not null)
            {
                try
                {
                    var session = await sessionService.GetAsync(sessionId, cancellationToken: cancellationToken);
                    mode = session.Livemode ? "live" : "test";
                    statusNote = null;
                    if (session.Livemode) confirmedLive++;
                    else confirmedTest++;
                }
                catch (Exception ex)
                {
                    mode = "test";
                    statusNote = BusinessAnalytics.LegacyUnverifiedNote;
                    assumedTest++;
                    notes.Add($"Session {sessionId}: Stripe lookup failed ({ex.Message}); assumed test.");
                }
            }
            else
            {
                mode = "test";
                statusNote = BusinessAnalytics.LegacyUnverifiedNote;
                assumedTest++;
            }

            var normalizedExisting = BusinessAnalytics.NormalizePaymentMode(payment.Mode);
            if (string.Equals(normalizedExisting, mode, StringComparison.Ordinal)
                && string.Equals(payment.StatusNote ?? string.Empty, statusNote ?? string.Empty, StringComparison.Ordinal))
            {
                continue;
            }

            var next = payment with
            {
                Mode = mode,
                StatusNote = statusNote,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            await _appDataStore.SavePaymentAsync(next, cancellationToken);
            updated++;
        }

        return new PaymentBackfillResultDto(
            payments.Count,
            updated,
            assumedTest,
            confirmedLive,
            confirmedTest,
            notes);
    }
}
