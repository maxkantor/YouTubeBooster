using Amazon;
using Amazon.DynamoDBv2;
using Amazon.BedrockRuntime;
using Amazon.SimpleEmail;
using Amazon.SimpleSystemsManagement;
using System;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.Repositories;

namespace YouTubeBoosterAi.Api;

public static class Infrastructure
{
    public static IServiceCollection AddApplicationInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Persist ASP.NET Data Protection keys so backend session cookies remain decryptable
        // across Lambda cold starts / container recycling.
        //
        // Without this, DataProtection falls back to EphemeralXmlRepository and users can be
        // abruptly logged out (which breaks premium unlock visibility).
        var appName = "YouTubeBoosterAi.Api";
        var dynamoClient = new AmazonDynamoDBClient();
        services.AddDataProtection()
            .SetApplicationName(appName)
            .AddKeyManagementOptions(options => options.XmlRepository = new DynamoXmlRepository(dynamoClient, configuration, appName));

        // Google APIs can reject requests with no User-Agent; Lambda HttpClient defaults are minimal.
        services.AddHttpClient(string.Empty, client =>
        {
            client.DefaultRequestHeaders.UserAgent.ParseAdd("YouTubeBoosterAi/1.0 (+https://youtubeboosterai.com)");
        });

        services.AddSingleton<IAmazonDynamoDB>(_ => dynamoClient);
        services.AddSingleton<IAmazonBedrockRuntime>(sp =>
        {
            var cfg = sp.GetRequiredService<IConfiguration>();
            var region =
                Environment.GetEnvironmentVariable("BEDROCK_REGION")
                ?? cfg["BEDROCK_REGION"]
                ?? Environment.GetEnvironmentVariable("AWS_REGION")
                ?? cfg["AWS_REGION"]
                ?? "us-east-1";
            return new AmazonBedrockRuntimeClient(RegionEndpoint.GetBySystemName(region));
        });
        services.AddSingleton<IAmazonSimpleEmailService>(_ => new AmazonSimpleEmailServiceClient());
        services.AddSingleton<IAmazonSimpleSystemsManagement>(_ => new AmazonSimpleSystemsManagementClient());

        services.AddSingleton<IAppSettingsProvider, ParameterStoreAppSettingsProvider>();
        services.AddSingleton<ISecretValueProvider, SsmSecretValueProvider>();
        services.AddSingleton<IAdminYouTubeOAuthSettingsProvider, AdminYouTubeOAuthSettingsProvider>();
        services.AddScoped<SessionCookieService>();
        services.AddScoped<IMagicLinkNotificationService, SesMagicLinkNotificationService>();

        // If running in Lambda and Storage__Provider isn't explicitly configured,
        // default to DynamoDb (so cookie-backed sessions don't vanish between invocations).
        var isRunningInLambda = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AWS_LAMBDA_FUNCTION_NAME"));
        var storageProvider = configuration["Storage:Provider"]
                              ?? configuration["Storage__Provider"]
                              ?? (isRunningInLambda ? "DynamoDb" : "InMemory");
        Console.WriteLine($"[startup] Storage provider resolved to '{storageProvider}' (isRunningInLambda={isRunningInLambda}).");
        if (string.Equals(storageProvider, "DynamoDb", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IAppDataStore, DynamoDbAppDataStore>();
        }
        else
        {
            services.AddSingleton<IAppDataStore, InMemoryAppDataStore>();
        }

        services.AddScoped<IDemoAnalysisService, YouTubePublicDemoAnalysisService>();
        services.AddScoped<IYouTubeChannelSearch, YouTubeChannelSearchService>();
        services.AddScoped<IPublicDashboardService, YouTubePublicDashboardService>();
        services.AddScoped<ICheckoutService, StripeCheckoutService>();
        services.AddScoped<PaymentBackfillService>();
        services.AddScoped<IUserDashboardService, SampleUserDashboardService>();
        services.AddScoped<IAdminDashboardService, AdminDashboardService>();
        services.AddScoped<ISupportService, SupportService>();
        services.AddScoped<ISupportNotificationService, SesSupportNotificationService>();
        services.AddSingleton<IPaymentAdminNotificationService, SesPaymentAdminNotificationService>();
        services.AddSingleton<IPaymentCustomerNotificationService, SesPaymentCustomerNotificationService>();
        services.AddScoped<IPromptBuilder, PromptBuilder>();
        services.AddScoped<IBedrockService, BedrockService>();
        services.AddScoped<IAiStudioService, AiStudioService>();
        if (string.Equals(storageProvider, "DynamoDb", StringComparison.OrdinalIgnoreCase))
            services.AddSingleton<ICreatorAcquisitionStore, DynamoCreatorAcquisitionStore>();
        else
            services.AddSingleton<ICreatorAcquisitionStore, InMemoryCreatorAcquisitionStore>();
        services.AddScoped<CreatorAcquisitionService>();
        services.AddScoped<ICreatorAcquisitionService>(sp => sp.GetRequiredService<CreatorAcquisitionService>());

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

        var supportEmail = await _secretValueProvider.GetValueAsync("admin/email", secure: false, cancellationToken)
            ?? await _secretValueProvider.GetValueAsync("ses/admin-email", secure: false, cancellationToken)
            ?? _configuration["Support:Email"]
            ?? "support@example.com";

        var enablePublicDemoRaw = await _secretValueProvider.GetValueAsync("features/enable-public-demo", secure: false, cancellationToken)
            ?? _configuration["Features:EnablePublicDemo"]
            ?? "true";

        var demoRateLimitRaw = await _secretValueProvider.GetValueAsync("features/demo-rate-limit-per-hour", secure: false, cancellationToken)
            ?? _configuration["Features:DemoRateLimitPerHour"];

        var settings = new AppSettings(
            OneTimePrice: decimal.TryParse(oneTimePriceRaw, out var price) ? price : 9.99m,
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
