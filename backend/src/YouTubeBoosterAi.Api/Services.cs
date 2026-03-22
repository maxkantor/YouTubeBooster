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
        var hostedSuccessUrl = BuildHostedSuccessUrl(request.SuccessUrl, request.CancelUrl);

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

            // When Stripe is unavailable (mock mode), also grant entitlements immediately.
            // Otherwise `/api/me/access-status` never flips to premium, and the UI stays stuck
            // on "Confirming your access".
            var mockEntitlement = new EntitlementRecord(
                EntitlementId: $"ent_{mockPurchaseId}",
                UserId: mockUser.UserId,
                AccessType: "premium",
                Status: "active",
                Source: "mock",
                GrantedAt: DateTimeOffset.UtcNow,
                ExpiresAt: null,
                PaymentId: mockPurchaseId,
                Notes: "mock_checkout",
                CreatedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow,
                GrantedBy: null,
                GrantedReason: null,
                RevokedAt: null
            );
            await _appDataStore.SaveEntitlementAsync(mockEntitlement, cancellationToken);

            await _appDataStore.TrackEventAsync("checkout_started", request.ChannelInput, new Dictionary<string, string?>
            {
                ["email"] = request.Email,
                ["mode"] = "mock"
            }, cancellationToken);

            var mockSeparator = hostedSuccessUrl.Contains('?') ? '&' : '?';
            return new CheckoutSessionResponse(
                CheckoutUrl: $"{hostedSuccessUrl}{mockSeparator}mockCheckout=true&channel={Uri.EscapeDataString(request.ChannelInput)}",
                SessionId: mockPurchaseId,
                Amount: settings.OneTimePrice,
                Currency: settings.Currency
            );
        }

        Stripe.StripeConfiguration.ApiKey = stripeSecret;

        var sessionService = new Stripe.Checkout.SessionService();
        var planCode = request.PlanCode ?? request.PriceKey ?? settings.StripePriceLookupKey;
        // Stripe rejects UUIDs / non-emails here (e.g. when Cognito username was mistaken for email).
        var customerEmail = EmailAddressHelpers.LooksLikeEmail(request.Email) ? request.Email.Trim() : null;

        var session = await sessionService.CreateAsync(new Stripe.Checkout.SessionCreateOptions
        {
            Mode = "payment",
            SuccessUrl = hostedSuccessUrl.Contains('?')
                ? $"{hostedSuccessUrl}&session_id={{CHECKOUT_SESSION_ID}}"
                : $"{hostedSuccessUrl}?session_id={{CHECKOUT_SESSION_ID}}",
            CancelUrl = request.CancelUrl,
            CustomerEmail = customerEmail,
            AllowPromotionCodes = true,
            Metadata = new Dictionary<string, string>
            {
                ["channelInput"] = request.ChannelInput,
                ["email"] = request.Email,
                ["priceVersion"] = request.PriceKey ?? settings.StripePriceLookupKey,
                ["planCode"] = planCode,
                ["userId"] = request.UserId ?? string.Empty,
                ["cognitoSub"] = request.CognitoSub ?? string.Empty,
                ["accountEmail"] = request.AccountEmail ?? request.Email,
                ["utmSource"] = request.UtmSource ?? string.Empty,
                ["utmMedium"] = request.UtmMedium ?? string.Empty,
                ["utmCampaign"] = request.UtmCampaign ?? string.Empty,
                ["referrer"] = request.Referrer ?? string.Empty
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

    private static string BuildHostedSuccessUrl(string successUrl, string cancelUrl)
    {
        if (Uri.TryCreate(successUrl, UriKind.Absolute, out var successUri))
        {
            return $"{successUri.GetLeftPart(UriPartial.Authority)}/?checkout=success";
        }

        if (Uri.TryCreate(cancelUrl, UriKind.Absolute, out var cancelUri))
        {
            return $"{cancelUri.GetLeftPart(UriPartial.Authority)}/?checkout=success";
        }

        return successUrl;
    }

    public async Task HandleStripeWebhookAsync(string payload, string? signatureHeader, CancellationToken cancellationToken)
    {
        var webhookSecret = await _secretValueProvider.GetValueAsync("stripe/webhook-secret", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            return;
        }

        Stripe.Checkout.Session? completedSession = null;
        if (!string.IsNullOrWhiteSpace(signatureHeader))
        {
            try
            {
                var stripeEvent = Stripe.EventUtility.ConstructEvent(payload, signatureHeader, webhookSecret);
                if (stripeEvent.Type != "checkout.session.completed")
                {
                    return;
                }

                completedSession = stripeEvent.Data.Object as Stripe.Checkout.Session;
            }
            catch (Exception ex)
            {
                await _appDataStore.TrackEventAsync("stripe_webhook_signature_invalid", "n/a", new Dictionary<string, string?>
                {
                    ["reason"] = ex.Message
                }, cancellationToken);
            }
        }

        if (completedSession is null)
        {
            var stripeSecret = await _secretValueProvider.GetValueAsync("stripe/secret-key", secure: true, cancellationToken);
            var recoveredSession = await TryRecoverCheckoutSessionFromPayloadAsync(payload, stripeSecret, cancellationToken);
            if (recoveredSession is null)
            {
                return;
            }

            completedSession = recoveredSession;
        }

        var session = completedSession;
        if (!string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(session.Status, "complete", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        await ProcessCompletedCheckoutSessionAsync(session, cancellationToken);
    }

    private async Task<Stripe.Checkout.Session?> TryRecoverCheckoutSessionFromPayloadAsync(
        string payload,
        string? stripeSecret,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(stripeSecret))
        {
            return null;
        }

        string? eventType = null;
        string? sessionId = null;

        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(payload);
            if (document.RootElement.TryGetProperty("type", out var typeElement))
            {
                eventType = typeElement.GetString();
            }

            if (!string.Equals(eventType, "checkout.session.completed", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            if (document.RootElement.TryGetProperty("data", out var dataElement)
                && dataElement.TryGetProperty("object", out var objectElement)
                && objectElement.TryGetProperty("id", out var idElement))
            {
                sessionId = idElement.GetString();
            }
        }
        catch
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return null;
        }

        Stripe.StripeConfiguration.ApiKey = stripeSecret;
        var sessionService = new Stripe.Checkout.SessionService();
        return await sessionService.GetAsync(sessionId, options: null, cancellationToken: cancellationToken);
    }

    private async Task ProcessCompletedCheckoutSessionAsync(Stripe.Checkout.Session session, CancellationToken cancellationToken)
    {
        var metadata = session.Metadata ?? new Dictionary<string, string>();
        var userId = metadata.GetValueOrDefault("userId") ?? string.Empty;
        var cognitoSub = metadata.GetValueOrDefault("cognitoSub") ?? string.Empty;
        var accountEmail = metadata.GetValueOrDefault("accountEmail")
                           ?? metadata.GetValueOrDefault("email")
                           ?? session.CustomerEmail
                           ?? session.CustomerDetails?.Email
                           ?? string.Empty;

        UserAccount? user = null;
        if (!string.IsNullOrWhiteSpace(cognitoSub))
        {
            user = await _appDataStore.GetUserByCognitoSubAsync(cognitoSub, cancellationToken);
        }
        if (user is null && !string.IsNullOrWhiteSpace(userId))
        {
            user = await _appDataStore.GetUserByIdAsync(userId, cancellationToken);
        }
        if (user is null && !string.IsNullOrWhiteSpace(accountEmail))
        {
            // Recovery path: do NOT rely on Stripe email for entitlements in normal flow.
            user = await _appDataStore.GetUserByEmailAsync(accountEmail, cancellationToken);
        }
        if (user is null)
        {
            await _appDataStore.TrackEventAsync("stripe_webhook_user_unresolved", session.Id, new Dictionary<string, string?>
            {
                ["checkoutSessionId"] = session.Id,
                ["accountEmail"] = accountEmail,
                ["stripeEmail"] = session.CustomerEmail ?? session.CustomerDetails?.Email,
                ["userId"] = userId,
                ["cognitoSub"] = cognitoSub
            }, cancellationToken);
            return;
        }

        var stripeEmail = session.CustomerEmail ?? session.CustomerDetails?.Email;
        if (!string.IsNullOrWhiteSpace(stripeEmail) && !string.Equals(stripeEmail.Trim(), user.Email.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            await _appDataStore.TrackEventAsync("stripe_email_mismatch", user.UserId, new Dictionary<string, string?>
            {
                ["accountEmail"] = user.Email,
                ["stripeEmail"] = stripeEmail,
                ["checkoutSessionId"] = session.Id
            }, cancellationToken);
        }

        // Idempotency: skip if payment already recorded.
        var existingPayment = await _appDataStore.GetPaymentByCheckoutSessionIdAsync(session.Id, cancellationToken);
        if (existingPayment is null)
        {
            var payment = new PaymentRecord(
                PaymentId: $"pay_{Guid.NewGuid():N}",
                UserId: user.UserId,
                AccountEmail: user.Email,
                StripeCustomerId: session.CustomerId,
                StripeCheckoutSessionId: session.Id,
                StripePaymentIntentId: session.PaymentIntentId,
                StripeSubscriptionId: null,
                StripeEmail: stripeEmail,
                Amount: (session.AmountTotal ?? 0) / 100m,
                Currency: (session.Currency ?? "usd").ToUpperInvariant(),
                Status: "completed",
                PlanCode: metadata.GetValueOrDefault("planCode") ?? "premium",
                PaymentMethodBrand: null,
                PaymentMethodLast4: null,
                BillingCountry: session.CustomerDetails?.Address?.Country,
                BillingName: session.CustomerDetails?.Name,
                ReceiptUrl: null,
                CreatedAt: DateTimeOffset.UtcNow,
                UpdatedAt: DateTimeOffset.UtcNow,
                Mode: session.Livemode ? "live" : "test",
                PaidAt: DateTimeOffset.UtcNow
            );
            await _appDataStore.SavePaymentAsync(payment, cancellationToken);
        }

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

        var entitlement = new EntitlementRecord(
            EntitlementId: $"ent_{session.Id}",
            UserId: user.UserId,
            AccessType: "premium",
            Status: "active",
            Source: "stripe",
            GrantedAt: DateTimeOffset.UtcNow,
            ExpiresAt: null,
            PaymentId: session.Id,
            Notes: stripeEmail,
            CreatedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow,
            GrantedBy: null,
            GrantedReason: null,
            RevokedAt: null
        );
        await _appDataStore.SaveEntitlementAsync(entitlement, cancellationToken);
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
    private readonly IAppSettingsProvider _appSettingsProvider;

    public AdminDashboardService(IAppDataStore appDataStore, IAppSettingsProvider appSettingsProvider)
    {
        _appDataStore = appDataStore;
        _appSettingsProvider = appSettingsProvider;
    }

    public async Task<AdminDashboardSummaryResponse> GetSummaryAsync(CancellationToken cancellationToken)
    {
        var settings = await _appSettingsProvider.GetSettingsAsync(cancellationToken);
        var snapshot = await _appDataStore.GetAdminSnapshotAsync(cancellationToken);
        var conversionRate = snapshot.TotalDemos == 0
            ? "0%"
            : $"{(snapshot.TotalPurchases / (double)snapshot.TotalDemos * 100):F1}%";
        var revenue = snapshot.TotalPurchases * settings.OneTimePrice;

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
