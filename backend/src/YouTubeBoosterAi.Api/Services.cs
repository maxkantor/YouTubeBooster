using System.Globalization;

namespace YouTubeBoosterAi.Api;

public interface IDemoAnalysisService
{
    Task<DemoAnalysisResponse> RunDemoAsync(DemoAnalysisRequest request, CancellationToken cancellationToken);
}

public interface ICheckoutService
{
    Task<CheckoutSessionResponse> CreateSessionAsync(CreateCheckoutSessionRequest request, CancellationToken cancellationToken);
    Task HandleStripeWebhookAsync(string payload, string? signatureHeader, CancellationToken cancellationToken);
    Task<bool> ReconcileCheckoutSessionAsync(string sessionId, string currentUserId, string? currentCognitoSub, string currentAccountEmail, CancellationToken cancellationToken);
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
    Task<SupportTicketResponse> CreateTicketAsync(SupportTicketRequest request, string? linkedUserIdFromAuth, CancellationToken cancellationToken);
}

public interface IAppSettingsProvider
{
    Task<AppSettings> GetSettingsAsync(CancellationToken cancellationToken);
}

public interface IPromptBuilder
{
    string BuildPrompt(AiGenerateRequest request);
}

public interface IBedrockService
{
    Task<string> InvokeModelAsync(string prompt, double temperature, int maxTokens, CancellationToken cancellationToken);
}

public interface IAiStudioService
{
    Task<AiStudioGenerateResponse> GenerateAsync(AiGenerateRequest request, UserAccount user, bool hasPremium, CancellationToken cancellationToken);
}

public sealed class StripeCheckoutService : ICheckoutService
{
    private readonly IAppSettingsProvider _appSettingsProvider;
    private readonly ISecretValueProvider _secretValueProvider;
    private readonly IAppDataStore _appDataStore;
    private readonly IPaymentAdminNotificationService _paymentAdminNotifier;
    private readonly IPaymentCustomerNotificationService _paymentCustomerNotifier;

    public StripeCheckoutService(
        IAppSettingsProvider appSettingsProvider,
        ISecretValueProvider secretValueProvider,
        IAppDataStore appDataStore,
        IPaymentAdminNotificationService paymentAdminNotifier,
        IPaymentCustomerNotificationService paymentCustomerNotifier)
    {
        _appSettingsProvider = appSettingsProvider;
        _secretValueProvider = secretValueProvider;
        _appDataStore = appDataStore;
        _paymentAdminNotifier = paymentAdminNotifier;
        _paymentCustomerNotifier = paymentCustomerNotifier;
    }

    public async Task<CheckoutSessionResponse> CreateSessionAsync(CreateCheckoutSessionRequest request, CancellationToken cancellationToken)
    {
        var settings = await _appSettingsProvider.GetSettingsAsync(cancellationToken);
        var stripeSecret = await _secretValueProvider.GetValueAsync("stripe/secret-key", secure: true, cancellationToken);
        var hostedSuccessUrl = BuildHostedSuccessUrl(request.SuccessUrl, request.CancelUrl);

        if (string.IsNullOrWhiteSpace(stripeSecret))
        {
            await _appDataStore.TrackEventAsync("checkout_blocked_missing_stripe_secret", request.ChannelInput, new Dictionary<string, string?>
            {
                ["email"] = request.Email
            }, cancellationToken);
            throw new InvalidOperationException("Payments are temporarily unavailable. Please try again shortly.");
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
                // Strong app identity to prevent cross-app webhook/email confusion on shared Stripe accounts.
                ["app"] = "youtubeboosterai",
                ["brand"] = "YouTubeBoosterAI",
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
            ClientReferenceId = string.IsNullOrWhiteSpace(request.UserId) ? null : request.UserId,
            PaymentIntentData = new Stripe.Checkout.SessionPaymentIntentDataOptions
            {
                Metadata = new Dictionary<string, string>
                {
                    ["app"] = "youtubeboosterai",
                    ["brand"] = "YouTubeBoosterAI",
                    ["planCode"] = planCode,
                    ["accountEmail"] = request.AccountEmail ?? request.Email,
                    ["userId"] = request.UserId ?? string.Empty,
                    ["cognitoSub"] = request.CognitoSub ?? string.Empty
                }
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
            ["source"] = "stripe",
            ["livemode"] = session.Livemode ? "true" : "false",
            ["environment"] = session.Livemode ? "live" : "test"
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
        var webhookSecret = (await _secretValueProvider.GetValueAsync("stripe/webhook-secret", secure: true, cancellationToken))?.Trim();
        if (string.IsNullOrWhiteSpace(webhookSecret))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(signatureHeader))
        {
            await _appDataStore.TrackEventAsync("stripe_webhook_missing_signature", "n/a", new Dictionary<string, string?>
            {
                ["reason"] = "Stripe-Signature header missing after API Gateway/Lambda marshalling."
            }, cancellationToken);
            return;
        }

        Stripe.Checkout.Session? completedSession = null;
        string? stripeEventId = null;
        try
        {
            var stripeEvent = Stripe.EventUtility.ConstructEvent(
                payload,
                signatureHeader,
                webhookSecret,
                throwOnApiVersionMismatch: false);

            if (string.Equals(stripeEvent.Type, "checkout.session.expired", StringComparison.OrdinalIgnoreCase))
            {
                await _appDataStore.TrackEventAsync("checkout_abandoned", stripeEvent.Id, new Dictionary<string, string?>
                {
                    ["eventSource"] = "webhook",
                    ["eventType"] = stripeEvent.Type
                }, cancellationToken);
                return;
            }

            if (!string.Equals(stripeEvent.Type, "checkout.session.completed", StringComparison.OrdinalIgnoreCase))
            {
                await _appDataStore.TrackEventAsync("stripe_webhook_ignored_event", stripeEvent.Id, new Dictionary<string, string?>
                {
                    ["eventType"] = stripeEvent.Type
                }, cancellationToken);
                return;
            }

            if (!await _appDataStore.TryMarkStripeWebhookEventProcessedAsync(stripeEvent.Id, cancellationToken))
            {
                await _appDataStore.TrackEventAsync("stripe_webhook_duplicate_ignored", stripeEvent.Id, new Dictionary<string, string?>
                {
                    ["eventType"] = stripeEvent.Type
                }, cancellationToken);
                return;
            }

            stripeEventId = stripeEvent.Id;
            completedSession = stripeEvent.Data.Object as Stripe.Checkout.Session;
        }
        catch (Stripe.StripeException ex)
        {
            await _appDataStore.TrackEventAsync("stripe_webhook_signature_invalid", "n/a", new Dictionary<string, string?>
            {
                ["reason"] = ex.Message,
                ["signaturePresent"] = (!string.IsNullOrWhiteSpace(signatureHeader)).ToString(),
                ["signatureHasV1"] = signatureHeader.Contains("v1=", StringComparison.Ordinal).ToString()
            }, cancellationToken);
            return;
        }
        catch (Exception ex)
        {
            await _appDataStore.TrackEventAsync("stripe_webhook_processing_failed", "n/a", new Dictionary<string, string?>
            {
                ["reason"] = ex.Message
            }, cancellationToken);
            return;
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
        if (!string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        await ProcessCompletedCheckoutSessionAsync(session, stripeEventId, cancellationToken);
    }

    public async Task<bool> ReconcileCheckoutSessionAsync(
        string sessionId,
        string currentUserId,
        string? currentCognitoSub,
        string currentAccountEmail,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return false;

        var existingPayment = await _appDataStore.GetPaymentByCheckoutSessionIdAsync(sessionId, cancellationToken);
        if (existingPayment is not null)
        {
            return string.Equals(existingPayment.UserId, currentUserId, StringComparison.OrdinalIgnoreCase);
        }

        var stripeSecret = await _secretValueProvider.GetValueAsync("stripe/secret-key", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(stripeSecret))
        {
            return false;
        }

        Stripe.StripeConfiguration.ApiKey = stripeSecret;
        var sessionService = new Stripe.Checkout.SessionService();
        var session = await sessionService.GetAsync(sessionId, options: null, cancellationToken: cancellationToken);
        if (session is null)
        {
            return false;
        }

        if (!string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var metadata = new Dictionary<string, string>(session.Metadata ?? new Dictionary<string, string>(), StringComparer.OrdinalIgnoreCase);
        var mdUserId = metadata.GetValueOrDefault("userId") ?? string.Empty;
        var mdCognitoSub = metadata.GetValueOrDefault("cognitoSub") ?? string.Empty;
        var mdAccountEmail = metadata.GetValueOrDefault("accountEmail") ?? metadata.GetValueOrDefault("email") ?? string.Empty;

        var metadataMatchesCurrentUser =
            (!string.IsNullOrWhiteSpace(mdUserId) && string.Equals(mdUserId, currentUserId, StringComparison.OrdinalIgnoreCase))
            || (!string.IsNullOrWhiteSpace(mdCognitoSub)
                && !string.IsNullOrWhiteSpace(currentCognitoSub)
                && string.Equals(mdCognitoSub, currentCognitoSub, StringComparison.OrdinalIgnoreCase))
            || (!string.IsNullOrWhiteSpace(mdAccountEmail)
                && !string.IsNullOrWhiteSpace(currentAccountEmail)
                && string.Equals(mdAccountEmail.Trim(), currentAccountEmail.Trim(), StringComparison.OrdinalIgnoreCase));

        if (!metadataMatchesCurrentUser)
        {
            await _appDataStore.TrackEventAsync("stripe_reconcile_user_mismatch", sessionId, new Dictionary<string, string?>
            {
                ["currentUserId"] = currentUserId,
                ["metadataUserId"] = mdUserId,
                ["metadataCognitoSub"] = mdCognitoSub,
                ["metadataAccountEmail"] = mdAccountEmail,
                ["currentAccountEmail"] = currentAccountEmail
            }, cancellationToken);
            return false;
        }

        metadata["userId"] = currentUserId;
        metadata["cognitoSub"] = currentCognitoSub ?? string.Empty;
        metadata["accountEmail"] = currentAccountEmail;
        session.Metadata = metadata;

        await ProcessCompletedCheckoutSessionAsync(session, stripeEventId: null, cancellationToken);

        await _appDataStore.TrackEventAsync("stripe_reconcile_completed", sessionId, new Dictionary<string, string?>
        {
            ["userId"] = currentUserId
        }, cancellationToken);

        return true;
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

    private async Task ProcessCompletedCheckoutSessionAsync(Stripe.Checkout.Session session, string? stripeEventId, CancellationToken cancellationToken)
    {
        var amountDollars = (session.AmountTotal ?? 0) / 100m;
        if (amountDollars <= 0m)
        {
            await _appDataStore.TrackEventAsync("payment_checkout_zero_amount", session.Id, new Dictionary<string, string?>
            {
                ["paymentStatus"] = session.PaymentStatus ?? string.Empty,
                ["status"] = session.Status ?? string.Empty
            }, cancellationToken);
            return;
        }

        var metadata = new Dictionary<string, string>(session.Metadata ?? new Dictionary<string, string>(), StringComparer.OrdinalIgnoreCase);
        var appKey = metadata.GetValueOrDefault("app") ?? string.Empty;
        if (!string.Equals(appKey, "youtubeboosterai", StringComparison.OrdinalIgnoreCase))
        {
            // Aggressive isolation: do not grant entitlements or send emails for sessions not explicitly tagged.
            await _appDataStore.TrackEventAsync("stripe_webhook_ignored_other_app", session.Id, new Dictionary<string, string?>
            {
                ["app"] = appKey,
                ["stripeEmail"] = session.CustomerEmail ?? session.CustomerDetails?.Email,
                ["paymentIntentId"] = session.PaymentIntentId
            }, cancellationToken);
            return;
        }
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

        // Idempotency: skip entire flow if payment already recorded (prevents duplicate revenue/entitlements).
        var existingPayment = await _appDataStore.GetPaymentByCheckoutSessionIdAsync(session.Id, cancellationToken);
        if (existingPayment is not null)
        {
            return;
        }

        var isLive = session.Livemode;
        var mode = isLive ? "live" : "test";
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
            Mode: mode,
            PaidAt: DateTimeOffset.UtcNow,
            Source: "stripe",
            StripeEventId: stripeEventId,
            StatusNote: null,
            EntitlementGranted: false
        );
        await _appDataStore.SavePaymentAsync(payment, cancellationToken);

        await _appDataStore.TrackEventAsync(
            isLive ? "payment_succeeded_live" : "payment_succeeded_test",
            user.UserId,
            new Dictionary<string, string?>
            {
                ["checkoutSessionId"] = session.Id,
                ["amount"] = payment.Amount.ToString("F2", CultureInfo.InvariantCulture),
                ["livemode"] = isLive ? "true" : "false",
                ["currency"] = payment.Currency
            },
            cancellationToken);

        if (!isLive)
        {
            return;
        }

        try
        {
            await _paymentAdminNotifier.NotifySuccessfulPaymentAsync(
                payment,
                user,
                session.Id,
                session.PaymentIntentId,
                metadata.GetValueOrDefault("planCode") ?? "premium",
                cancellationToken);
            await _paymentCustomerNotifier.NotifyCustomerPaymentAsync(
                payment,
                user,
                session.Id,
                session.PaymentIntentId,
                metadata.GetValueOrDefault("planCode") ?? "premium",
                cancellationToken);
            await _appDataStore.TrackEventAsync("payment_notifications_sent", session.Id, new Dictionary<string, string?>
            {
                ["userId"] = user.UserId,
                ["amount"] = payment.Amount.ToString("F2", CultureInfo.InvariantCulture),
                ["livemode"] = "true"
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            await _appDataStore.TrackEventAsync("payment_notification_failed", session.Id, new Dictionary<string, string?>
            {
                ["error"] = ex.Message
            }, cancellationToken);
        }

        var record = new PurchaseRecord(
            PurchaseId: session.Id,
            UserId: user.UserId,
            Email: user.Email,
            Amount: payment.Amount,
            Currency: payment.Currency,
            Status: "completed",
            PriceVersion: session.Metadata?.GetValueOrDefault("priceVersion") ?? "default",
            PurchasedAt: DateTimeOffset.UtcNow
        );

        await _appDataStore.SavePurchaseAsync(record, cancellationToken);

        var entitlementSource = BusinessAnalytics.ProductionEntitlementLivePayment;
        var entitlement = new EntitlementRecord(
            EntitlementId: $"ent_{session.Id}",
            UserId: user.UserId,
            AccessType: "premium",
            Status: "active",
            Source: entitlementSource,
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

        var dashEntitlement = new EntitlementRecord(
            EntitlementId: $"ent_{session.Id}_dash",
            UserId: user.UserId,
            AccessType: "dashboard_access",
            Status: "active",
            Source: entitlementSource,
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
        await _appDataStore.SaveEntitlementAsync(dashEntitlement, cancellationToken);

        await _appDataStore.SavePaymentAsync(payment with { EntitlementGranted = true, UpdatedAt = DateTimeOffset.UtcNow }, cancellationToken);
        await _appDataStore.TrackEventAsync("entitlement_granted_live", user.UserId, new Dictionary<string, string?>
        {
            ["checkoutSessionId"] = session.Id,
            ["source"] = entitlementSource,
            ["livemode"] = "true",
            ["userId"] = user.UserId,
            ["eventSource"] = "webhook"
        }, cancellationToken);
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

    public async Task<SupportTicketResponse> CreateTicketAsync(SupportTicketRequest request, string? linkedUserIdFromAuth, CancellationToken cancellationToken)
    {
        var err = ContactSubmissionValidator.Validate(request);
        if (err is not null)
        {
            throw new InvalidOperationException(err);
        }

        string? linked = linkedUserIdFromAuth;
        if (linked is null)
        {
            var byContact = await _appDataStore.GetUserByEmailAsync(NormalizeEmail(request.Email), cancellationToken);
            linked = byContact?.UserId;
        }

        if (linked is null && !string.IsNullOrWhiteSpace(request.AccountEmail))
        {
            var byAccount = await _appDataStore.GetUserByEmailAsync(NormalizeEmail(request.AccountEmail!), cancellationToken);
            linked = byAccount?.UserId;
        }

        if (linked is null && !string.IsNullOrWhiteSpace(request.OrderReference))
        {
            var payment = await _appDataStore.GetPaymentByCheckoutSessionIdAsync(request.OrderReference.Trim(), cancellationToken);
            if (payment is not null)
            {
                linked = payment.UserId;
            }
        }

        var ticketId = await _appDataStore.SaveSupportTicketAsync(request, linked, cancellationToken);
        await _supportNotificationService.NotifyNewTicketAsync(ticketId, request, cancellationToken);
        return new SupportTicketResponse(ticketId, "open");
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}
