namespace YouTubeBoosterAi.Api;

public interface IDemoAnalysisService
{
    Task<DemoAnalysisResponse> RunDemoAsync(DemoAnalysisRequest request, CancellationToken cancellationToken);
}

public interface ICheckoutService
{
    Task<CheckoutSessionResponse> CreateSessionAsync(CreateCheckoutSessionRequest request, CancellationToken cancellationToken);
    Task HandleStripeWebhookAsync(string payload, string? signatureHeader, CancellationToken cancellationToken);
}

public interface IUserDashboardService
{
    Task<UserDashboardOverviewResponse> GetOverviewAsync(string userId, CancellationToken cancellationToken);
}

public interface IAdminDashboardService
{
    Task<AdminDashboardSummaryResponse> GetSummaryAsync(CancellationToken cancellationToken);
}

public interface ISupportService
{
    Task<SupportTicketResponse> CreateTicketAsync(SupportTicketRequest request, CancellationToken cancellationToken);
}

public interface IAppSettingsProvider
{
    Task<AppSettings> GetSettingsAsync(CancellationToken cancellationToken);
}

public sealed class StripeCheckoutService : ICheckoutService
{
    private readonly IAppSettingsProvider _appSettingsProvider;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IAppDataStore _appDataStore;

    public StripeCheckoutService(
        IAppSettingsProvider appSettingsProvider,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore)
    {
        _appSettingsProvider = appSettingsProvider;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
    }

    public async Task<CheckoutSessionResponse> CreateSessionAsync(CreateCheckoutSessionRequest request, CancellationToken cancellationToken)
    {
        var settings = await _appSettingsProvider.GetSettingsAsync(cancellationToken);
        var stripeSecret = await _secretValueProvider.GetValueAsync("stripe/secret-key", secure: true, cancellationToken);

        if (string.IsNullOrWhiteSpace(stripeSecret))
        {
            var mockUser = await _appDataStore.UpsertPurchasedUserAsync(request.Email, request.ChannelInput, cancellationToken);
            var mockPurchaseId = $"mock_cs_{Guid.NewGuid():N}";
            await _appDataStore.SavePurchaseAsync(new PurchaseRecord(
                PurchaseId: mockPurchaseId,
                UserId: mockUser.UserId,
                Email: mockUser.Email,
                Amount: settings.OneTimePrice,
                Currency: settings.Currency.ToUpperInvariant(),
                Status: "completed",
                PriceVersion: request.PriceKey ?? settings.StripePriceLookupKey,
                PurchasedAt: DateTimeOffset.UtcNow
            ), cancellationToken);

            await _appDataStore.TrackEventAsync("checkout_started", request.ChannelInput, new Dictionary<string, string?>
            {
                ["email"] = request.Email,
                ["mode"] = "mock"
            }, cancellationToken);

            return new CheckoutSessionResponse(
                CheckoutUrl: $"{request.SuccessUrl}?mockCheckout=true&channel={Uri.EscapeDataString(request.ChannelInput)}",
                SessionId: mockPurchaseId,
                Amount: settings.OneTimePrice,
                Currency: settings.Currency
            );
        }

        Stripe.StripeConfiguration.ApiKey = stripeSecret;

        var sessionService = new Stripe.Checkout.SessionService();
        var session = await sessionService.CreateAsync(new Stripe.Checkout.SessionCreateOptions
        {
            Mode = "payment",
            SuccessUrl = $"{request.SuccessUrl}?session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = request.CancelUrl,
            CustomerEmail = request.Email,
            AllowPromotionCodes = true,
            Metadata = new Dictionary<string, string>
            {
                ["channelInput"] = request.ChannelInput,
                ["email"] = request.Email,
                ["priceVersion"] = request.PriceKey ?? settings.StripePriceLookupKey
            },
            LineItems =
            [
                new Stripe.Checkout.SessionLineItemOptions
                {
                    Quantity = 1,
                    PriceData = new Stripe.Checkout.SessionLineItemPriceDataOptions
                    {
                        Currency = settings.Currency.ToLowerInvariant(),
                        UnitAmountDecimal = settings.OneTimePrice * 100m,
                        ProductData = new Stripe.Checkout.SessionLineItemPriceDataProductDataOptions
                        {
                            Name = "YouTube Booster AI",
                            Description = "One-time purchase for premium hosted access"
                        }
                    }
                }
            ]
        }, cancellationToken: cancellationToken);

        await _appDataStore.TrackEventAsync("checkout_started", request.ChannelInput, new Dictionary<string, string?>
        {
            ["email"] = request.Email,
            ["sessionId"] = session.Id,
            ["mode"] = "stripe"
        }, cancellationToken);

        return new CheckoutSessionResponse(
            CheckoutUrl: session.Url ?? request.CancelUrl,
            SessionId: session.Id,
            Amount: settings.OneTimePrice,
            Currency: settings.Currency
        );
    }

    public async Task HandleStripeWebhookAsync(string payload, string? signatureHeader, CancellationToken cancellationToken)
    {
        var secret = await _secretValueProvider.GetValueAsync("stripe/webhook-secret", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(signatureHeader))
        {
            return;
        }

        var stripeEvent = Stripe.EventUtility.ConstructEvent(payload, signatureHeader, secret);
        if (stripeEvent.Type != "checkout.session.completed")
        {
            return;
        }

        if (stripeEvent.Data.Object is not Stripe.Checkout.Session session)
        {
            return;
        }

        var email = session.CustomerEmail ?? session.CustomerDetails?.Email ?? string.Empty;
        if (string.IsNullOrWhiteSpace(email))
        {
            return;
        }

        var user = await _appDataStore.UpsertPurchasedUserAsync(
            email,
            session.Metadata?.GetValueOrDefault("channelInput"),
            cancellationToken);

        var record = new PurchaseRecord(
            PurchaseId: session.Id,
            UserId: user.UserId,
            Email: user.Email,
            Amount: (session.AmountTotal ?? 0) / 100m,
            Currency: (session.Currency ?? "usd").ToUpperInvariant(),
            Status: "completed",
            PriceVersion: session.Metadata?.GetValueOrDefault("priceVersion") ?? "default",
            PurchasedAt: DateTimeOffset.UtcNow
        );

        await _appDataStore.SavePurchaseAsync(record, cancellationToken);
    }
}

public sealed class SampleUserDashboardService : IUserDashboardService
{
    private readonly IAppDataStore _appDataStore;

    public SampleUserDashboardService(IAppDataStore appDataStore)
    {
        _appDataStore = appDataStore;
    }

    public async Task<UserDashboardOverviewResponse> GetOverviewAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await _appDataStore.GetUserByIdAsync(userId, cancellationToken);
        var onboarding = await _appDataStore.GetUserOnboardingStateAsync(userId, cancellationToken);
        var settings = await _appDataStore.GetUserYouTubeSettingsAsync(userId, cancellationToken);

        var channelTitle = !string.IsNullOrWhiteSpace(user?.ChannelUrl) ? user.ChannelUrl : "Channel setup pending";
        var onboardingStatus = user?.OnboardingCompleted == true ? "Complete" : "Needs attention";
        var integrationStatus = settings?.HasCredentialsJson == true || settings?.HasClientId == true
            ? "Connected"
            : "Missing";

        return new UserDashboardOverviewResponse(
            userId,
            channelTitle ?? "Channel setup pending",
            user?.OnboardingCompleted == true ? 82 : 58,
            [
                new MetricCardDto("Purchased Access", user?.Purchased == true ? "Unlocked" : "Pending", "One-time access tied to your purchase email"),
                new MetricCardDto("Onboarding", onboardingStatus, user?.OnboardingCompleted == true ? "Primary channel and preferences saved" : "Finish setup to unlock premium workflows"),
                new MetricCardDto("Google Settings", integrationStatus, integrationStatus == "Connected" ? "Per-user Google settings are stored securely" : "Add your Google settings in onboarding"),
                new MetricCardDto("Growth Goal", onboarding?.GrowthGoal ?? "Not set", "Used to personalize future recommendations")
            ],
            user?.OnboardingCompleted == true
                ? ["Title clarity still needs monitoring", "Traffic tools should be reviewed weekly", "Premium reports are ready for deeper analysis"]
                : ["Complete onboarding", "Add your primary channel URL", "Save your Google settings"],
            user?.OnboardingCompleted == true
                ? ["Refresh the top three titles this week", "Rerun the dashboard after new uploads", "Start a repeatable content series"]
                : ["Finish onboarding to unlock dashboard depth", "Connect Google settings for advanced workflows", "Set a clear growth goal"]
        );
    }
}

public sealed class AdminDashboardService : IAdminDashboardService
{
    private readonly IAppDataStore _appDataStore;

    public AdminDashboardService(IAppDataStore appDataStore)
    {
        _appDataStore = appDataStore;
    }

    public async Task<AdminDashboardSummaryResponse> GetSummaryAsync(CancellationToken cancellationToken)
    {
        var snapshot = await _appDataStore.GetAdminSnapshotAsync(cancellationToken);
        var conversionRate = snapshot.TotalDemos == 0
            ? "0%"
            : $"{(snapshot.TotalPurchases / (double)snapshot.TotalDemos * 100):F1}%";
        var revenue = snapshot.TotalPurchases * 49.99m;

        return new AdminDashboardSummaryResponse(
            snapshot.TotalUsers,
            snapshot.TotalDemos,
            snapshot.TotalPurchases,
            conversionRate,
            $"${revenue:F0}",
            snapshot.RecentActivity
        );
    }
}

public sealed class SupportService : ISupportService
{
    private readonly IAppDataStore _appDataStore;
    private readonly ISupportNotificationService _supportNotificationService;

    public SupportService(IAppDataStore appDataStore, ISupportNotificationService supportNotificationService)
    {
        _appDataStore = appDataStore;
        _supportNotificationService = supportNotificationService;
    }

    public async Task<SupportTicketResponse> CreateTicketAsync(SupportTicketRequest request, CancellationToken cancellationToken)
    {
        var ticketId = await _appDataStore.SaveSupportTicketAsync(request, cancellationToken);
        await _supportNotificationService.NotifyNewTicketAsync(ticketId, request, cancellationToken);
        return new SupportTicketResponse(ticketId, "new");
    }
}
