using Amazon.DynamoDBv2;
using Amazon.SimpleEmail;
using Amazon.SimpleSystemsManagement;

namespace YouTubeBoosterAi.Api;

public static class Infrastructure
{
    public static IServiceCollection AddApplicationInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDataProtection();
        services.AddHttpClient();

        services.AddSingleton<IAmazonDynamoDB>(_ => new AmazonDynamoDBClient());
        services.AddSingleton<IAmazonSimpleEmailService>(_ => new AmazonSimpleEmailServiceClient());
        services.AddSingleton<IAmazonSimpleSystemsManagement>(_ => new AmazonSimpleSystemsManagementClient());

        services.AddSingleton<IAppSettingsProvider, ParameterStoreAppSettingsProvider>();
        services.AddSingleton<ISecretValueProvider, SsmSecretValueProvider>();
        services.AddSingleton<IAdminYouTubeOAuthSettingsProvider, AdminYouTubeOAuthSettingsProvider>();
        services.AddScoped<SessionCookieService>();
        services.AddScoped<IMagicLinkNotificationService, SesMagicLinkNotificationService>();

        var storageProvider = configuration["Storage:Provider"] ?? configuration["Storage__Provider"] ?? "InMemory";
        if (string.Equals(storageProvider, "DynamoDb", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IAppDataStore, DynamoDbAppDataStore>();
        }
        else
        {
            services.AddSingleton<IAppDataStore, InMemoryAppDataStore>();
        }

        services.AddScoped<IDemoAnalysisService, YouTubePublicDemoAnalysisService>();
        services.AddScoped<IPublicDashboardService, YouTubePublicDashboardService>();
        services.AddScoped<ICheckoutService, StripeCheckoutService>();
        services.AddScoped<IUserDashboardService, SampleUserDashboardService>();
        services.AddScoped<IAdminDashboardService, AdminDashboardService>();
        services.AddScoped<ISupportService, SupportService>();
        services.AddScoped<ISupportNotificationService, SesSupportNotificationService>();

        return services;
    }
}

public sealed class ParameterStoreAppSettingsProvider : IAppSettingsProvider
{
    private readonly IConfiguration _configuration;
    private readonly ISecretValueProvider _secretValueProvider;

    public ParameterStoreAppSettingsProvider(IConfiguration configuration, ISecretValueProvider secretValueProvider)
    {
        _configuration = configuration;
        _secretValueProvider = secretValueProvider;
    }

    public async Task<AppSettings> GetSettingsAsync(CancellationToken cancellationToken)
    {
        var oneTimePriceRaw = await _secretValueProvider.GetValueAsync("pricing/one-time-price", secure: false, cancellationToken)
            ?? _configuration["Pricing:OneTimePrice"];
        var currency = await _secretValueProvider.GetValueAsync("pricing/currency", secure: false, cancellationToken)
            ?? _configuration["Pricing:Currency"]
            ?? "USD";
        var priceLookupKey = await _secretValueProvider.GetValueAsync("stripe/price-lookup-key", secure: false, cancellationToken)
            ?? _configuration["Stripe:PriceLookupKey"]
            ?? "ytboosterai_default";
        var publishableKey = await _secretValueProvider.GetValueAsync("stripe/publishable-key", secure: false, cancellationToken)
            ?? _configuration["Stripe:PublishableKey"]
            ?? "pk_test_placeholder";

        var supportEmail = await _secretValueProvider.GetValueAsync("ses/admin-email", secure: false, cancellationToken)
            ?? _configuration["Support:Email"]
            ?? "support@example.com";

        var enablePublicDemoRaw = await _secretValueProvider.GetValueAsync("features/enable-public-demo", secure: false, cancellationToken)
            ?? _configuration["Features:EnablePublicDemo"]
            ?? "true";

        var demoRateLimitRaw = await _secretValueProvider.GetValueAsync("features/demo-rate-limit-per-hour", secure: false, cancellationToken)
            ?? _configuration["Features:DemoRateLimitPerHour"];

        var settings = new AppSettings(
            OneTimePrice: decimal.TryParse(oneTimePriceRaw, out var price) ? price : 49.99m,
            Currency: currency,
            StripePriceLookupKey: priceLookupKey,
            StripePublishableKey: publishableKey,
            SupportEmail: supportEmail,
            EnablePublicDemo: enablePublicDemoRaw.Equals("true", StringComparison.OrdinalIgnoreCase),
            DemoRateLimitPerHour: int.TryParse(demoRateLimitRaw, out var rateLimit) ? rateLimit : 10
        );

        return settings;
    }
}
