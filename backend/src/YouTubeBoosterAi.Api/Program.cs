using System.Globalization;
using System.Text.Json;
using System.Threading.RateLimiting;
using Amazon;
using Amazon.CognitoIdentityProvider;
using Amazon.CognitoIdentityProvider.Model;
using Amazon.SimpleEmail;
using Amazon.SimpleSystemsManagement;
using Amazon.SimpleSystemsManagement.Model;
using Amazon.Lambda.AspNetCoreServer.Hosting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using YouTubeBoosterAi.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddApplicationInfrastructure(builder.Configuration);

static async Task<(string Region, string UserPoolId, string AppClientId)> LoadCognitoConfigAsync(IConfiguration configuration)
{
    // Prefer directly configured values (local dev / explicit override)
    var region = configuration["Cognito:Region"] ?? configuration["COGNITO_REGION"];
    var userPoolId = configuration["Cognito:UserPoolId"] ?? configuration["COGNITO_USER_POOL_ID"];
    var appClientId = configuration["Cognito:AppClientId"] ?? configuration["COGNITO_APP_CLIENT_ID"];

    if (!string.IsNullOrWhiteSpace(region) &&
        !string.IsNullOrWhiteSpace(userPoolId) &&
        !string.IsNullOrWhiteSpace(appClientId))
    {
        return (region, userPoolId, appClientId);
    }

    // Otherwise pull from SSM so Lambda env vars do not need to mirror Cognito config.
    var basePath = configuration["SSM:BasePath"] ?? configuration["SSM__BASEPATH"];
    if (string.IsNullOrWhiteSpace(basePath))
    {
        throw new InvalidOperationException("Cognito config missing: set Cognito:* or COGNITO_* env vars, or set SSM__BASEPATH.");
    }

    var ssm = new AmazonSimpleSystemsManagementClient();

    async Task<string> GetAsync(string relativeKey)
    {
        var fullName = $"{basePath.TrimEnd('/')}/{relativeKey}";
        try
        {
            var resp = await ssm.GetParameterAsync(new GetParameterRequest
            {
                Name = fullName,
                WithDecryption = false
            });

            return resp.Parameter?.Value ?? string.Empty;
        }
        catch (ParameterNotFoundException)
        {
            return string.Empty;
        }
    }

    region = await GetAsync("cognito/region");
    userPoolId = await GetAsync("cognito/user-pool-id");
    appClientId = await GetAsync("cognito/app-client-id");

    if (string.IsNullOrWhiteSpace(region) ||
        string.IsNullOrWhiteSpace(userPoolId) ||
        string.IsNullOrWhiteSpace(appClientId))
    {
        throw new InvalidOperationException($"Cognito config missing from SSM under base path '{basePath}'. Expected: cognito/region, cognito/user-pool-id, cognito/app-client-id.");
    }

    return (region, userPoolId, appClientId);
}

var (cognitoRegion, cognitoUserPoolId, cognitoAppClientId) = await LoadCognitoConfigAsync(builder.Configuration);
builder.Configuration["COGNITO_REGION"] = cognitoRegion;
builder.Configuration["COGNITO_USER_POOL_ID"] = cognitoUserPoolId;
builder.Configuration["COGNITO_APP_CLIENT_ID"] = cognitoAppClientId;

builder.Services.AddCognitoJwtAuth(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddPolicy("default", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrWhiteSpace(origin)) return false;

                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;

                // Common production hosts
                if (uri.Host.EndsWith(".amplifyapp.com", StringComparison.OrdinalIgnoreCase)) return true;
                if (uri.Host.Equals("youtubeboosterai.com", StringComparison.OrdinalIgnoreCase)) return true;
                if (uri.Host.Equals("www.youtubeboosterai.com", StringComparison.OrdinalIgnoreCase)) return true;

                // Optional explicit allow-list via config/env: "https://foo.com,https://bar.com"
                var configured = builder.Configuration["CORS_ALLOWED_ORIGINS"];
                if (string.IsNullOrWhiteSpace(configured)) return false;

                return configured
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Any(o => string.Equals(o, origin, StringComparison.OrdinalIgnoreCase));
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("admin-login", httpContext =>
    {
        var key = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 8,
            Window = TimeSpan.FromMinutes(5),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0
        });
    });
    options.AddPolicy("contact-form", httpContext =>
    {
        var key = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromHours(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0
        });
    });
    options.AddPolicy("ai-generate", httpContext =>
    {
        var userKey =
            httpContext.User.FindFirst("sub")?.Value
            ?? httpContext.User.FindFirst("cognito:username")?.Value
            ?? httpContext.User.FindFirst("preferred_username")?.Value
            ?? httpContext.User.FindFirst("username")?.Value
            ?? httpContext.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";

        return RateLimitPartition.GetFixedWindowLimiter(userKey, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 20,
            Window = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0
        });
    });
});

var app = builder.Build();
app.UseCors("default");
app.UseHttpsRedirection();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "youtube-booster-ai-api" }));

var publicApi = app.MapGroup("/api/public");
publicApi.MapGet("/cognito/config", () =>
{
    return Results.Ok(new
    {
        region = cognitoRegion,
        userPoolId = cognitoUserPoolId,
        appClientId = cognitoAppClientId
    });
});
publicApi.MapGet("/pricing", async (IAppSettingsProvider appSettingsProvider, CancellationToken cancellationToken) =>
{
    var s = await appSettingsProvider.GetSettingsAsync(cancellationToken);
    var amount = s.OneTimePrice.ToString("F2", CultureInfo.InvariantCulture);
    return Results.Ok(new { oneTimePrice = amount, currency = s.Currency });
});
publicApi.MapPost("/demo", async (DemoAnalysisRequest request, IDemoAnalysisService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.ChannelInput))
    {
        return Results.BadRequest(new { error = "Channel input is required." });
    }

    var result = await service.RunDemoAsync(request, cancellationToken);
    return Results.Ok(result);
});

// Public dashboard endpoints (role-model parity with the Python EB demo)
publicApi.MapGet("/channel/analyze", async (string? channel, int? days, IPublicDashboardService dashboardService, CancellationToken cancellationToken) =>
{
    var input = string.IsNullOrWhiteSpace(channel) ? "https://www.youtube.com/@maxkantorUSA" : channel;
    var result = await dashboardService.AnalyzeChannelAsync(input, days ?? 30, cancellationToken);
    return Results.Ok(result);
});

publicApi.MapGet("/channel/videos", async (string? channel, int? max_results, IPublicDashboardService dashboardService, CancellationToken cancellationToken) =>
{
    var input = string.IsNullOrWhiteSpace(channel) ? "https://www.youtube.com/@maxkantorUSA" : channel;
    var result = await dashboardService.GetVideosAsync(input, max_results ?? 50, cancellationToken);
    return Results.Ok(result);
});

publicApi.MapGet("/channel/suggestions", async (string? channel, int? top_n, IPublicDashboardService dashboardService, CancellationToken cancellationToken) =>
{
    var input = string.IsNullOrWhiteSpace(channel) ? "https://www.youtube.com/@maxkantorUSA" : channel;
    var result = await dashboardService.GetSuggestionsAsync(input, top_n ?? 5, cancellationToken);
    return Results.Ok(result);
});

publicApi.MapGet("/channel/traffic_tools", async (string? channel, IPublicDashboardService dashboardService, CancellationToken cancellationToken) =>
{
    var input = string.IsNullOrWhiteSpace(channel) ? "https://www.youtube.com/@maxkantorUSA" : channel;
    var result = await dashboardService.GetTrafficToolsAsync(input, cancellationToken);
    return Results.Ok(result);
});

publicApi.MapGet("/video/seo/{videoId}", async (string videoId, string? channel, IPublicDashboardService dashboardService, CancellationToken cancellationToken) =>
{
    var input = string.IsNullOrWhiteSpace(channel) ? "https://www.youtube.com/@maxkantorUSA" : channel;
    var result = await dashboardService.GetVideoSeoAsync(input, videoId, cancellationToken);
    return Results.Ok(result);
});

publicApi.MapGet("/runner/ping", () =>
{
    return Results.Ok(new PublicRunnerPingResponse("ok", DateTimeOffset.UtcNow.ToString("O")));
});

publicApi.MapPost("/runner/log_issue", async (PublicRunnerIssueRequest request, HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    await appDataStore.TrackEventAsync("runner_issue_logged", request.VideoId, new Dictionary<string, string?>
    {
        ["title"] = request.Title,
        ["desiredSpeed"] = request.DesiredSpeed?.ToString(),
        ["actualSpeed"] = request.ActualSpeed?.ToString(),
        ["positionSeconds"] = request.PositionSeconds?.ToString(),
        ["note"] = request.Note,
        ["remoteAddr"] = httpContext.Connection.RemoteIpAddress?.ToString(),
        ["userAgent"] = httpContext.Request.Headers.UserAgent.ToString()
    }, cancellationToken);
    return Results.Ok(new { status = "ok" });
});

async Task<IResult> HandleContactSubmission(
    SupportTicketRequest request,
    ISupportService supportService,
    SessionCookieService sessionCookieService,
    HttpContext httpContext,
    CancellationToken cancellationToken)
{
    try
    {
        var user = await sessionCookieService.GetAuthenticatedUserAsync(httpContext, cancellationToken);
        var response = await supportService.CreateTicketAsync(request, user?.UserId, cancellationToken);
        return Results.Ok(response);
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
}

publicApi.MapPost("/support/contact", HandleContactSubmission).RequireRateLimiting("contact-form");
app.MapPost("/api/contact", HandleContactSubmission).RequireRateLimiting("contact-form");

var checkoutApi = app.MapGroup("/api/checkout");
checkoutApi.MapPost("/session", async (CreateCheckoutSessionRequest request, ICheckoutService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.ChannelInput))
    {
        return Results.BadRequest(new { error = "Email and channel input are required." });
    }

    try
    {
        var response = await service.CreateSessionAsync(request, cancellationToken);
        return Results.Ok(response);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: ex.Message);
    }
});

var webhookApi = app.MapGroup("/api/webhooks");
webhookApi.MapPost("/stripe", async (HttpRequest request, ICheckoutService service, CancellationToken cancellationToken) =>
{
    using var reader = new StreamReader(request.Body);
    var payload = await reader.ReadToEndAsync(cancellationToken);
    var signature = request.Headers["Stripe-Signature"].FirstOrDefault();

    await service.HandleStripeWebhookAsync(payload, signature, cancellationToken);
    return Results.Ok(new { received = true });
});

// Authenticated account endpoints (Cognito JWT Bearer)
var meApi = app.MapGroup("/api/me").RequireAuthorization();
meApi.MapGet("", async (HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var principal = httpContext.User;
    // Cognito ID tokens should have `sub`, but claim type mapping can differ (or be remapped)
    // depending on JWT contents and middleware settings. Use the same fallbacks as our
    // `/api/auth/cognito/login` endpoint so downstream endpoints don't 401.
    var sub =
        principal.FindFirst("sub")?.Value
        ?? principal.FindFirst("cognito:username")?.Value
        ?? principal.FindFirst("preferred_username")?.Value
        ?? principal.FindFirst("username")?.Value
        ?? principal.FindFirst("email")?.Value
        ?? principal.FindFirst("emailaddress")?.Value;
    if (string.IsNullOrWhiteSpace(sub))
    {
        return Results.Unauthorized();
    }

    var email = EmailAddressHelpers.ResolveCognitoAccountEmail(principal, sub);
    var emailVerified = string.Equals(principal.FindFirst("email_verified")?.Value, "true", StringComparison.OrdinalIgnoreCase);

    var user = await appDataStore.UpsertCognitoUserAsync(sub, email, emailVerified, signupSource: "cognito", cancellationToken);
    await appDataStore.RecordUserLoginAsync(user.UserId, DateTimeOffset.UtcNow, cancellationToken);
    return Results.Ok(ToSessionUserDto(user));
});

meApi.MapGet("/entitlements", async (HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var sub =
        httpContext.User.FindFirst("sub")?.Value
        ?? httpContext.User.FindFirst("cognito:username")?.Value
        ?? httpContext.User.FindFirst("preferred_username")?.Value
        ?? httpContext.User.FindFirst("username")?.Value
        ?? httpContext.User.FindFirst("email")?.Value
        ?? httpContext.User.FindFirst("emailaddress")?.Value;
    if (string.IsNullOrWhiteSpace(sub)) return Results.Unauthorized();
    var user = await appDataStore.GetUserByCognitoSubAsync(sub, cancellationToken);
    if (user is null) return Results.NotFound();
    var entitlements = await appDataStore.ListEntitlementsByUserAsync(user.UserId, cancellationToken);
    return Results.Ok(new
    {
        userId = user.UserId,
        entitlements = entitlements.Select(e => new
        {
            entitlementId = e.EntitlementId,
            accessType = e.AccessType,
            status = e.Status,
            source = e.Source,
            grantedAt = e.GrantedAt.ToString("O"),
            expiresAt = e.ExpiresAt?.ToString("O"),
            paymentId = e.PaymentId,
            notes = e.Notes
        })
    });
});

meApi.MapGet("/access-status", async (HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var sub =
        httpContext.User.FindFirst("sub")?.Value
        ?? httpContext.User.FindFirst("cognito:username")?.Value
        ?? httpContext.User.FindFirst("preferred_username")?.Value
        ?? httpContext.User.FindFirst("username")?.Value
        ?? httpContext.User.FindFirst("email")?.Value
        ?? httpContext.User.FindFirst("emailaddress")?.Value;
    if (string.IsNullOrWhiteSpace(sub)) return Results.Unauthorized();
    var user = await appDataStore.GetUserByCognitoSubAsync(sub, cancellationToken);
    if (user is null) return Results.NotFound();

    var userStatus = string.IsNullOrWhiteSpace(user.UserStatus) ? "active" : user.UserStatus;
    var isSuspendedOrDeactivated =
        string.Equals(userStatus, "suspended", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(userStatus, "deactivated", StringComparison.OrdinalIgnoreCase);

    // Primary signal: user profile flags written by SaveEntitlementAsync
    // (Purchased + AccessStatus). This is more reliable than scanning entitlement
    // items (which can be affected by historical data shape/migrations).
    var hasPremium =
        user.Purchased
        || string.Equals(user.AccessStatus, "entitled", StringComparison.OrdinalIgnoreCase)
        || string.Equals(user.AccessStatus, "purchased", StringComparison.OrdinalIgnoreCase);

    // Secondary signal: entitlement scan (kept as a fallback for extra safety).
    if (!hasPremium)
    {
        hasPremium =
            await appDataStore.UserHasActiveEntitlementAsync(user.UserId, "premium", cancellationToken)
            || await appDataStore.UserHasActiveEntitlementAsync(user.UserId, "lifetime", cancellationToken);
    }

    // Admin "suspended/deactivated" must override purchased/entitlements.
    if (isSuspendedOrDeactivated)
    {
        return Results.Ok(new { userId = user.UserId, premium = false, accessStatus = "free" });
    }

    return Results.Ok(new { userId = user.UserId, premium = hasPremium, accessStatus = hasPremium ? "active" : "free" });
});

var billingApi = app.MapGroup("/api/billing");
billingApi.MapPost("/create-checkout-session", async (CreateCheckoutSessionRequest request, HttpContext httpContext, ICheckoutService service, IAppDataStore appDataStore, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    // Primary auth path: backend cookie session.
    var user = await sessionCookieService.GetAuthenticatedUserAsync(httpContext, cancellationToken);
    if (user is null)
    {
        // Fallback for clients that only send Cognito JWT (legacy behavior).
        var principal = httpContext.User;
        var sub =
            principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("cognito:username")?.Value
            ?? principal.FindFirst("preferred_username")?.Value
            ?? principal.FindFirst("username")?.Value
            ?? principal.FindFirst("email")?.Value
            ?? principal.FindFirst("emailaddress")?.Value;
        if (string.IsNullOrWhiteSpace(sub)) return Results.Unauthorized();

        var email = EmailAddressHelpers.ResolveCognitoAccountEmail(principal, sub);
        var emailVerified = string.Equals(principal.FindFirst("email_verified")?.Value, "true", StringComparison.OrdinalIgnoreCase);
        user = await appDataStore.UpsertCognitoUserAsync(sub, email, emailVerified, signupSource: "cognito", cancellationToken);
    }

    // Do not trust client for identity; override request email with account email for metadata.
    // Stripe prefill: only real addresses — otherwise omit CustomerEmail and let Checkout collect it.
    var stripePrefillEmail = EmailAddressHelpers.LooksLikeEmail(user.Email) && !user.Email.EndsWith("@users.id.ytbooster.internal", StringComparison.OrdinalIgnoreCase)
        ? user.Email
        : string.Empty;
    var safeReq = request with
    {
        Email = stripePrefillEmail,
        UserId = user.UserId,
        CognitoSub = user.CognitoSub,
        AccountEmail = user.Email,
        PlanCode = request.PlanCode ?? request.PriceKey ?? "premium",
        Referrer = request.Referrer ?? httpContext.Request.Headers.Referer.ToString()
    };
    try
    {
        var session = await service.CreateSessionAsync(safeReq, cancellationToken);
        return Results.Ok(session);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: ex.Message);
    }
});

billingApi.MapPost("/reconcile-checkout-session", async (ReconcileCheckoutSessionRequest request, HttpContext httpContext, ICheckoutService service, IAppDataStore appDataStore, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.SessionId))
    {
        return Results.BadRequest(new { error = "sessionId is required." });
    }

    var user = await sessionCookieService.GetAuthenticatedUserAsync(httpContext, cancellationToken);
    if (user is null)
    {
        var principal = httpContext.User;
        var sub =
            principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("cognito:username")?.Value
            ?? principal.FindFirst("preferred_username")?.Value
            ?? principal.FindFirst("username")?.Value
            ?? principal.FindFirst("email")?.Value
            ?? principal.FindFirst("emailaddress")?.Value;
        if (string.IsNullOrWhiteSpace(sub)) return Results.Unauthorized();

        var email = EmailAddressHelpers.ResolveCognitoAccountEmail(principal, sub);
        var emailVerified = string.Equals(principal.FindFirst("email_verified")?.Value, "true", StringComparison.OrdinalIgnoreCase);
        user = await appDataStore.UpsertCognitoUserAsync(sub, email, emailVerified, signupSource: "cognito", cancellationToken);
    }

    var reconciled = await service.ReconcileCheckoutSessionAsync(
        request.SessionId,
        user.UserId,
        user.CognitoSub,
        user.Email,
        cancellationToken);

    return Results.Ok(new { reconciled });
});

var premiumApi = app.MapGroup("/api/premium").RequireAuthorization();
premiumApi.AddEndpointFilter(async (context, next) =>
{
    var httpContext = context.HttpContext;
    var sub =
        httpContext.User.FindFirst("sub")?.Value
        ?? httpContext.User.FindFirst("cognito:username")?.Value
        ?? httpContext.User.FindFirst("preferred_username")?.Value
        ?? httpContext.User.FindFirst("username")?.Value
        ?? httpContext.User.FindFirst("email")?.Value
        ?? httpContext.User.FindFirst("emailaddress")?.Value;
    if (string.IsNullOrWhiteSpace(sub)) return Results.Unauthorized();
    var store = httpContext.RequestServices.GetRequiredService<IAppDataStore>();
    var user = await store.GetUserByCognitoSubAsync(sub, httpContext.RequestAborted);
    if (user is null) return Results.Unauthorized();

    var userStatus = string.IsNullOrWhiteSpace(user.UserStatus) ? "active" : user.UserStatus;
    var isSuspendedOrDeactivated =
        string.Equals(userStatus, "suspended", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(userStatus, "deactivated", StringComparison.OrdinalIgnoreCase);

    var hasPremium =
        user.Purchased
        || string.Equals(user.AccessStatus, "entitled", StringComparison.OrdinalIgnoreCase)
        || string.Equals(user.AccessStatus, "purchased", StringComparison.OrdinalIgnoreCase);

    // Admin override: suspended/deactivated users must not access premium.
    if (isSuspendedOrDeactivated) return Results.Forbid();

    if (!hasPremium)
    {
        hasPremium =
            await store.UserHasActiveEntitlementAsync(user.UserId, "premium", httpContext.RequestAborted)
            || await store.UserHasActiveEntitlementAsync(user.UserId, "lifetime", httpContext.RequestAborted);
    }
    if (!hasPremium) return Results.Forbid();
    httpContext.Items["authenticatedUser"] = user;
    return await next(context);
});

premiumApi.MapGet("/dashboard/overview", async (HttpContext httpContext, IUserDashboardService service, CancellationToken cancellationToken) =>
{
    var user = GetAuthenticatedUser(httpContext);
    var result = await service.GetOverviewAsync(user.UserId, cancellationToken);
    return Results.Ok(result);
});

var aiApi = app.MapGroup("/api/ai").RequireAuthorization().RequireRateLimiting("ai-generate");
aiApi.MapPost("/generate", async (
    AiGenerateRequest request,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    IAiStudioService aiStudioService,
    ILogger<Program> logger,
    CancellationToken cancellationToken) =>
{
    var action = (request.Action ?? string.Empty).Trim().ToLowerInvariant();
    var allowedActions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "rewrite_titles",
        "improve_description",
        "keywords",
        "ideas",
        "pattern"
    };

    if (!allowedActions.Contains(action))
    {
        return Results.BadRequest(new { error = "Unsupported action." });
    }

    var sub = ResolveCognitoSubject(httpContext.User);
    if (string.IsNullOrWhiteSpace(sub))
    {
        return Results.Unauthorized();
    }

    var user = await appDataStore.GetUserByCognitoSubAsync(sub, cancellationToken);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var hasPremium =
        user.Purchased
        || string.Equals(user.AccessStatus, "entitled", StringComparison.OrdinalIgnoreCase)
        || string.Equals(user.AccessStatus, "purchased", StringComparison.OrdinalIgnoreCase)
        || await appDataStore.UserHasActiveEntitlementAsync(user.UserId, "premium", cancellationToken)
        || await appDataStore.UserHasActiveEntitlementAsync(user.UserId, "lifetime", cancellationToken);

    try
    {
        var response = await aiStudioService.GenerateAsync(request with { Action = action }, user, hasPremium, cancellationToken);
        return Results.Ok(response);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "AI generation failed for user {UserId} action {Action}", user.UserId, action);

        var flat = ex.ToString();
        var isBedrockAccessIssue = flat.Contains("bedrock:InvokeModel", StringComparison.OrdinalIgnoreCase)
            || flat.Contains("AccessDeniedException", StringComparison.OrdinalIgnoreCase);

        if (isBedrockAccessIssue)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "AI Growth Studio is being enabled on the backend.",
                detail: "Live AI generation is temporarily unavailable while AWS Bedrock permissions are finishing setup.");
        }

        if (ExceptionLooksLikeTimeout(ex, flat))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "AI Growth Studio is temporarily unavailable.",
                detail: "The AI request took too long. Please try again in a moment.");
        }

        if (flat.Contains("ThrottlingException", StringComparison.OrdinalIgnoreCase)
            || flat.Contains("TooManyRequests", StringComparison.OrdinalIgnoreCase))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "AI Growth Studio is busy.",
                detail: "The AI service is busy. Please wait a few seconds and try again.");
        }

        if (flat.Contains("ValidationException", StringComparison.OrdinalIgnoreCase))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "AI Growth Studio configuration issue.",
                detail: "Check the Bedrock model id in Parameter Store (bedrock/model) and model access in the AWS console.");
        }

        return Results.Problem(
            statusCode: StatusCodes.Status503ServiceUnavailable,
            title: "AI Growth Studio is temporarily unavailable.",
            detail: "Please try again in a few minutes.");
    }
});

var authApi = app.MapGroup("/api/auth");
authApi.MapPost("/magic-link", async (MagicLinkLoginRequest request, HttpContext httpContext, IAppDataStore appDataStore, IMagicLinkNotificationService magicLinkNotificationService, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return Results.BadRequest(new { error = "Email is required." });
    }

    var user = await appDataStore.GetUserByEmailAsync(request.Email, cancellationToken);
    if (user is null)
    {
        return Results.BadRequest(new { error = "No account was found for that email." });
    }

    var tokenRecord = new MagicLinkTokenRecord(
        Token: Guid.NewGuid().ToString("N"),
        UserId: user.UserId,
        Email: user.Email,
        RedirectPath: NormalizeRedirectPath(request.RedirectPath),
        ExpiresAt: DateTimeOffset.UtcNow.AddMinutes(20),
        CreatedAt: DateTimeOffset.UtcNow
    );

    await appDataStore.SaveMagicLinkTokenAsync(tokenRecord, cancellationToken);
    var magicLinkUrl = BuildMagicLinkUrl(httpContext.Request, tokenRecord.RedirectPath, tokenRecord.Token);
    await appDataStore.TrackEventAsync("magic_link_requested", user.Email, new Dictionary<string, string?>
    {
        ["userId"] = user.UserId
    }, cancellationToken);

    return Results.Ok(await magicLinkNotificationService.SendMagicLinkAsync(user.Email, magicLinkUrl, cancellationToken));
});

authApi.MapPost("/magic-link/verify", async (MagicLinkVerifyRequest request, HttpContext httpContext, IAppDataStore appDataStore, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.BadRequest(new { error = "Token is required." });
    }

    var tokenRecord = await appDataStore.ConsumeMagicLinkTokenAsync(request.Token, cancellationToken);
    if (tokenRecord is null)
    {
        return Results.BadRequest(new { error = "This magic link is invalid or expired." });
    }

    var user = await appDataStore.GetUserByIdAsync(tokenRecord.UserId, cancellationToken)
        ?? await appDataStore.GetUserByEmailAsync(tokenRecord.Email, cancellationToken);
    if (user is null)
    {
        return Results.BadRequest(new { error = "This account could not be resolved." });
    }

    await sessionCookieService.SignInUserAsync(httpContext, user, cancellationToken);
    await appDataStore.TrackEventAsync("magic_link_verified", user.Email, new Dictionary<string, string?>
    {
        ["userId"] = user.UserId
    }, cancellationToken);

    return Results.Ok(new UserSessionStatusResponse(true, ToSessionUserDto(user)));
});

authApi.MapPost("/cognito/ensure", async (
    CognitoEnsureRequest request,
    IAppDataStore appDataStore,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { error = "Email and password are required." });
    }

    var user = await appDataStore.GetUserByEmailAsync(request.Email.Trim(), cancellationToken);
    if (user is null)
    {
        return Results.NotFound(new { error = "No account was found for that email." });
    }

    if (!user.EmailVerified && !user.Purchased)
    {
        return Results.Forbid();
    }

    var cognitoConfig = await LoadCognitoConfigAsync(configuration);
    if (string.IsNullOrWhiteSpace(cognitoConfig.UserPoolId) || string.IsNullOrWhiteSpace(cognitoConfig.Region))
    {
        return Results.Problem("Cognito is not configured.");
    }

    var provider = new AmazonCognitoIdentityProviderClient(RegionEndpoint.GetBySystemName(cognitoConfig.Region));
    try
    {
        await provider.AdminGetUserAsync(new AdminGetUserRequest
        {
            UserPoolId = cognitoConfig.UserPoolId,
            Username = request.Email.Trim()
        }, cancellationToken);

        return Results.Ok(new { ok = true, created = false });
    }
    catch (UserNotFoundException)
    {
        // continue to create
    }

    await provider.AdminCreateUserAsync(new AdminCreateUserRequest
    {
        UserPoolId = cognitoConfig.UserPoolId,
        Username = request.Email.Trim(),
        MessageAction = MessageActionType.SUPPRESS,
        UserAttributes = new List<AttributeType>
        {
            new() { Name = "email", Value = request.Email.Trim().ToLowerInvariant() },
            new() { Name = "email_verified", Value = user.EmailVerified ? "true" : "false" }
        }
    }, cancellationToken);

    await provider.AdminSetUserPasswordAsync(new AdminSetUserPasswordRequest
    {
        UserPoolId = cognitoConfig.UserPoolId,
        Username = request.Email.Trim(),
        Password = request.Password,
        Permanent = true
    }, cancellationToken);

    await appDataStore.TrackEventAsync("cognito_user_provisioned", user.UserId, new Dictionary<string, string?>
    {
        ["email"] = user.Email
    }, cancellationToken);

    return Results.Ok(new { ok = true, created = true });
});

// Cognito JWT -> backend cookie session exchange
authApi.MapPost("/cognito/login", async (HttpContext httpContext, IAppDataStore appDataStore, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    // We intentionally validate the JWT inside the handler so we can log the exact reason
    // when Cognito token exchange fails (instead of failing silently via middleware short-circuit).
    var authResult = await httpContext.AuthenticateAsync(JwtBearerDefaults.AuthenticationScheme);
    if (!authResult.Succeeded || authResult.Principal is null)
    {
        // Ensure we can debug the exact failure reason from lambda logs.
        var failure = authResult.Failure?.Message ?? "unknown";
        Console.WriteLine($"[cognito/login] JWT authenticate failed: {failure}");
        Console.WriteLine($"[cognito/login] Auth header present: {(!string.IsNullOrWhiteSpace(httpContext.Request.Headers.Authorization))}");
        return Results.Json(new { error = "invalid_token", detail = failure }, statusCode: StatusCodes.Status401Unauthorized);
    }

    var principal = authResult.Principal;

    // Sometimes the JWT principal doesn't expose a `sub` claim as `sub` (claim type mapping differs).
    // We still require JWT validation to succeed (AuthenticateAsync succeeded),
    // but we use fallbacks to obtain a stable identifier.
    var sub =
        principal.FindFirst("sub")?.Value
        ?? principal.FindFirst("cognito:username")?.Value
        ?? principal.FindFirst("preferred_username")?.Value
        ?? principal.FindFirst("username")?.Value
        ?? principal.FindFirst("email")?.Value
        ?? principal.FindFirst("emailaddress")?.Value;
    if (string.IsNullOrWhiteSpace(sub))
    {
        // If we can't derive a stable identifier, stop here.
        return Results.Json(new { error = "invalid_token_missing_sub" }, statusCode: StatusCodes.Status401Unauthorized);
    }

    var email = EmailAddressHelpers.ResolveCognitoAccountEmail(principal, sub);
    var emailVerifiedClaim = principal.FindFirst("email_verified")?.Value;
    var emailVerified = string.Equals(emailVerifiedClaim, "true", StringComparison.OrdinalIgnoreCase);

    var user = await appDataStore.UpsertCognitoUserAsync(sub, email, emailVerified, signupSource: "cognito", cancellationToken);
    await appDataStore.RecordUserLoginAsync(user.UserId, DateTimeOffset.UtcNow, cancellationToken);
    await sessionCookieService.SignInUserAsync(httpContext, user, cancellationToken);
    return Results.Ok(new UserSessionStatusResponse(true, ToSessionUserDto(user)));
});

authApi.MapGet("/session", async (HttpContext httpContext, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    var user = await sessionCookieService.GetAuthenticatedUserAsync(httpContext, cancellationToken);
    return Results.Ok(new UserSessionStatusResponse(user is not null, user is null ? null : ToSessionUserDto(user)));
});

authApi.MapPost("/logout", async (HttpContext httpContext, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    await sessionCookieService.SignOutUserAsync(httpContext, cancellationToken);
    return Results.Ok(new UserSessionStatusResponse(false, null));
});

var userApi = app.MapGroup("/api/user");
userApi.AddEndpointFilter(async (context, next) =>
{
    var sessionCookieService = context.HttpContext.RequestServices.GetRequiredService<SessionCookieService>();
    var user = await sessionCookieService.GetAuthenticatedUserAsync(context.HttpContext, context.HttpContext.RequestAborted);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    context.HttpContext.Items["authenticatedUser"] = user;
    return await next(context);
});

userApi.MapGet("/dashboard/overview", async (HttpContext httpContext, IAppDataStore appDataStore, IUserDashboardService service, CancellationToken cancellationToken) =>
{
    var user = GetAuthenticatedUser(httpContext);

    var userStatus = string.IsNullOrWhiteSpace(user.UserStatus) ? "active" : user.UserStatus;
    var isSuspendedOrDeactivated =
        string.Equals(userStatus, "suspended", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(userStatus, "deactivated", StringComparison.OrdinalIgnoreCase);

    if (isSuspendedOrDeactivated) return Results.Forbid();

    // Dashboard overview is premium-only; entitlement flags control "premium" status.
    var hasPremium =
        user.Purchased
        || string.Equals(user.AccessStatus, "entitled", StringComparison.OrdinalIgnoreCase)
        || string.Equals(user.AccessStatus, "purchased", StringComparison.OrdinalIgnoreCase);

    if (!hasPremium)
    {
        hasPremium =
            await appDataStore.UserHasActiveEntitlementAsync(user.UserId, "premium", cancellationToken)
            || await appDataStore.UserHasActiveEntitlementAsync(user.UserId, "lifetime", cancellationToken);
    }

    if (!hasPremium) return Results.Forbid();

    var result = await service.GetOverviewAsync(user.UserId, cancellationToken);
    return Results.Ok(result);
});

userApi.MapGet("/onboarding", async (HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var user = GetAuthenticatedUser(httpContext);
    var state = await appDataStore.GetUserOnboardingStateAsync(user.UserId, cancellationToken);
    return state is null ? Results.NotFound() : Results.Ok(state);
});

userApi.MapPost("/onboarding", async (SaveUserOnboardingRequest request, HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.ChannelUrl))
    {
        return Results.BadRequest(new { error = "Primary channel URL is required." });
    }

    var user = GetAuthenticatedUser(httpContext);
    await appDataStore.SaveUserOnboardingAsync(user.UserId, request, cancellationToken);
    var state = await appDataStore.GetUserOnboardingStateAsync(user.UserId, cancellationToken);
    return Results.Ok(state);
});

userApi.MapPost("/onboarding/complete", async (HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var user = GetAuthenticatedUser(httpContext);
    var state = await appDataStore.GetUserOnboardingStateAsync(user.UserId, cancellationToken);
    if (state is null || string.IsNullOrWhiteSpace(state.ChannelUrl))
    {
        return Results.BadRequest(new { error = "Save your primary channel before completing onboarding." });
    }

    await appDataStore.CompleteUserOnboardingAsync(user.UserId, cancellationToken);
    var updated = await appDataStore.GetUserOnboardingStateAsync(user.UserId, cancellationToken);
    return Results.Ok(updated);
});

userApi.MapGet("/reports/{reportId}", (string reportId, HttpContext httpContext) =>
{
    var user = GetAuthenticatedUser(httpContext);
    return Results.Ok(new
    {
        reportId,
        userId = user.UserId,
        channelUrl = user.ChannelUrl,
        status = user.OnboardingCompleted ? "ready" : "onboarding_required",
        sections = new[] { "overview", "videos", "seo", "traffic", "suggestions" }
    });
});

userApi.MapGet("/integrations/youtube/settings", async (HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var user = GetAuthenticatedUser(httpContext);
    var settings = await appDataStore.GetUserYouTubeSettingsAsync(user.UserId, cancellationToken);
    return settings is null ? Results.NotFound() : Results.Ok(settings);
});

userApi.MapPost("/integrations/youtube/settings", async (UserYouTubeSettingsRequest request, HttpContext httpContext, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    if (!TryValidateYouTubeSettings(request, out var error))
    {
        return Results.BadRequest(new { error });
    }

    var user = GetAuthenticatedUser(httpContext);
    await appDataStore.SaveUserYouTubeSettingsAsync(user.UserId, request, cancellationToken);
    var settings = await appDataStore.GetUserYouTubeSettingsAsync(user.UserId, cancellationToken);
    return Results.Ok(settings);
});

var adminApi = app.MapGroup("/api/admin");
adminApi.MapPost("/login", async (AdminLoginRequest request, HttpContext httpContext, ISecretValueProvider secretValueProvider, IAppDataStore appDataStore, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    var adminEmail = await secretValueProvider.GetValueAsync("admin/email", secure: false, cancellationToken);
    var adminPassword = await secretValueProvider.GetValueAsync("admin/password", secure: true, cancellationToken);
    var passwordFormat = await secretValueProvider.GetValueAsync("admin/password-format", secure: false, cancellationToken);

    if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
    {
        return Results.Problem("Admin credentials are not configured.");
    }

    var emailOk = string.Equals(request.Email?.Trim(), adminEmail.Trim(), StringComparison.OrdinalIgnoreCase);
    var format = (passwordFormat ?? "plain").Trim().ToLowerInvariant();
    var passwordOk = format switch
    {
        "bcrypt" => BCrypt.Net.BCrypt.Verify(request.Password ?? string.Empty, adminPassword),
        "plain" => FixedTimeEquals(request.Password ?? string.Empty, adminPassword),
        _ => false
    };

    if (!emailOk || !passwordOk)
    {
        await appDataStore.TrackEventAsync("admin_login_failed", request.Email ?? string.Empty, new Dictionary<string, string?>
        {
            ["scope"] = "admin",
            ["reason"] = "invalid_credentials"
        }, cancellationToken);
        return Results.Json(
            new
            {
                error = "invalid_admin_credentials",
                detail =
                    "Email or password does not match Parameter Store. Under your Lambda SSM__BASEPATH (e.g. /youtubebooster), set admin/email (String) and admin/password (SecureString). Optional admin/password-format: plain (default) or bcrypt (stored value must be a bcrypt hash)."
            },
            statusCode: StatusCodes.Status401Unauthorized);
    }

    await sessionCookieService.SignInAdminAsync(httpContext, adminEmail.Trim(), cancellationToken);
    await appDataStore.TrackEventAsync("admin_login_succeeded", request.Email, new Dictionary<string, string?>
    {
        ["scope"] = "admin"
    }, cancellationToken);

    return Results.Ok(new AdminSessionStatusResponse(true, adminEmail.Trim().ToLowerInvariant()));
}).RequireRateLimiting("admin-login");

adminApi.MapGet("/session", async (HttpContext httpContext, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    var session = await sessionCookieService.GetAuthenticatedAdminAsync(httpContext, cancellationToken);
    return Results.Ok(new AdminSessionStatusResponse(session is not null, session?.Email));
});

adminApi.MapPost("/logout", async (HttpContext httpContext, SessionCookieService sessionCookieService, CancellationToken cancellationToken) =>
{
    await sessionCookieService.SignOutAdminAsync(httpContext, cancellationToken);
    return Results.Ok(new AdminSessionStatusResponse(false, null));
});

var adminProtectedApi = app.MapGroup("/api/admin");
adminProtectedApi.AddEndpointFilter(async (context, next) =>
{
    // Let CORS preflight pass through without requiring an admin session.
    // Browsers send unauthenticated OPTIONS requests before PATCH/POST/etc.
    if (string.Equals(context.HttpContext.Request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
    {
        return Results.Ok();
    }

    var sessionCookieService = context.HttpContext.RequestServices.GetRequiredService<SessionCookieService>();
    var admin = await sessionCookieService.GetAuthenticatedAdminAsync(context.HttpContext, context.HttpContext.RequestAborted);
    if (admin is null)
    {
        return Results.Unauthorized();
    }

    context.HttpContext.Items["authenticatedAdmin"] = admin;
    return await next(context);
});

adminProtectedApi.MapGet("/dashboard/summary", async (IAdminDashboardService service, CancellationToken cancellationToken) =>
{
    var result = await service.GetSummaryAsync(cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/users", async (IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var snapshot = await appDataStore.GetAdminSnapshotAsync(cancellationToken);
    return Results.Ok(new
    {
        items = snapshot.RecentActivity.Select(item => new
        {
            title = item.Title,
            detail = item.Detail,
            timestamp = item.Timestamp
        }),
        nextCursor = string.Empty
    });
});

adminProtectedApi.MapGet("/support/tickets", () => Results.Ok(new
{
    items = Array.Empty<object>()
}));

adminProtectedApi.MapGet("/crm/users", async (int? limit, string? cursor, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.ListUsersAsync(limit ?? 50, cursor, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/users/{userId}", async (string userId, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.GetUserDetailAsync(userId, cancellationToken);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/payments", async (int? limit, string? cursor, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.ListPurchasesAsync(limit ?? 50, cursor, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/audits", async (int? limit, string? cursor, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.ListDemoAuditsAsync(limit ?? 50, cursor, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/support/tickets", async (int? limit, string? cursor, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.ListSupportTicketsAsync(limit ?? 50, cursor, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/support/tickets/{ticketId}", async (string ticketId, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.GetSupportTicketAsync(ticketId, cancellationToken);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

adminProtectedApi.MapPost("/crm/support/tickets/{ticketId}/reply", async (
    string ticketId,
    AdminSupportReplyRequest request,
    IAppDataStore appDataStore,
    IAmazonSimpleEmailService ses,
    ISecretValueProvider secretValueProvider,
    IConfiguration configuration,
    CancellationToken cancellationToken) =>
{
    var ticket = await appDataStore.GetSupportTicketAsync(ticketId, cancellationToken);
    if (ticket is null) return Results.NotFound();

    var fromAddress = await secretValueProvider.GetValueAsync("ses/from-email", secure: true, cancellationToken);
    if (string.IsNullOrWhiteSpace(fromAddress)) return Results.Problem("SES sender identity is not configured.");

    var fromName = configuration["App:SupportFromName"]
                   ?? configuration["SUPPORT_FROM_NAME"]
                   ?? "YouTubeBooster Support";
    var fromSource = $"{fromName} <{fromAddress}>";

    var subject = string.IsNullOrWhiteSpace(request.Subject) ? $"Re: {ticket.Ticket.Subject}" : request.Subject.Trim();
    string? sesMessageId = null;
    try
    {
        var sendResponse = await ses.SendEmailAsync(new Amazon.SimpleEmail.Model.SendEmailRequest
        {
            Source = fromSource,
            Destination = new Amazon.SimpleEmail.Model.Destination { ToAddresses = [ticket.Ticket.Email] },
            ReplyToAddresses = [fromAddress],
            ReturnPath = fromAddress,
            Message = new Amazon.SimpleEmail.Model.Message
            {
                Subject = new Amazon.SimpleEmail.Model.Content(subject),
                Body = new Amazon.SimpleEmail.Model.Body
                {
                    Text = new Amazon.SimpleEmail.Model.Content(request.Body ?? string.Empty)
                }
            }
        }, cancellationToken);
        sesMessageId = sendResponse.MessageId;
    }
    catch (Exception ex)
    {
        await appDataStore.TrackEventAsync("support_reply_failed", ticketId, new Dictionary<string, string?>
        {
            ["to"] = ticket.Ticket.Email,
            ["error"] = ex.Message
        }, cancellationToken);
        return Results.Problem("Failed to send email.");
    }

    await appDataStore.SaveSupportReplyAsync(ticketId, subject, request.Body ?? string.Empty, sesMessageId, "sent", cancellationToken);
    await appDataStore.TrackEventAsync("support_reply_sent", ticketId, new Dictionary<string, string?>
    {
        ["to"] = ticket.Ticket.Email,
        ["sesMessageId"] = sesMessageId
    }, cancellationToken);

    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapPost("/crm/support/tickets/{ticketId}/note", async (
    string ticketId,
    AdminSupportNoteRequest request,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Body))
    {
        return Results.BadRequest(new { error = "Note body is required." });
    }

    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");
    await appDataStore.SaveSupportNoteAsync(ticketId, request.Body.Trim(), admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapPost("/crm/support/tickets/{ticketId}/link-user", async (
    string ticketId,
    AdminSupportLinkUserRequest request,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken) =>
{
    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");

    if (!string.IsNullOrWhiteSpace(request.UserId))
    {
        var existingUser = await appDataStore.GetUserByIdAsync(request.UserId.Trim(), cancellationToken);
        if (existingUser is null)
        {
            return Results.BadRequest(new { error = "User not found." });
        }
    }

    await appDataStore.LinkSupportTicketUserAsync(ticketId, string.IsNullOrWhiteSpace(request.UserId) ? null : request.UserId.Trim(), admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapGet("/crm/dashboard", async (string? range, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.GetOperationalDashboardAsync(string.IsNullOrWhiteSpace(range) ? "30d" : range!, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/orders", async (int? limit, string? cursor, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.ListPaymentOrdersAsync(limit ?? 50, cursor, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapGet("/crm/activity", async (int? limit, string? cursor, IAppDataStore appDataStore, CancellationToken cancellationToken) =>
{
    var result = await appDataStore.ListActivityEventsAsync(limit ?? 100, cursor, cancellationToken);
    return Results.Ok(result);
});

adminProtectedApi.MapPatch("/crm/users/{userId}", async (
    string userId,
    AdminUserPatchRequest request,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken) =>
{
    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");
    await appDataStore.UpdateUserAdminAsync(userId, request, admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapPost("/crm/users/{userId}/entitlements", async (
    string userId,
    AdminGrantEntitlementRequest request,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken) =>
{
    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");
    await appDataStore.GrantEntitlementAdminAsync(userId, request, admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapPost("/crm/users/{userId}/entitlements/{entitlementId}/revoke", async (
    string userId,
    string entitlementId,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken,
    RevokeEntitlementBody? body) =>
{
    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");
    await appDataStore.RevokeEntitlementAdminAsync(userId, entitlementId, body?.Reason ?? "revoked", admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapPost("/crm/orders/link", async (
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken,
    LinkOrderBody body) =>
{
    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");
    await appDataStore.LinkPaymentToUserAsync(body.StripeCheckoutSessionId, body.UserId, admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

adminProtectedApi.MapPatch("/crm/support/tickets/{ticketId}", async (
    string ticketId,
    AdminSupportTicketPatchRequest request,
    HttpContext httpContext,
    IAppDataStore appDataStore,
    CancellationToken cancellationToken) =>
{
    var admin = httpContext.Items["authenticatedAdmin"] as AdminSessionRecord
                ?? throw new InvalidOperationException("admin");
    await appDataStore.UpdateSupportTicketStatusAsync(ticketId, request, admin.Email, cancellationToken);
    return Results.Ok(new { ok = true });
});

var ogApi = app.MapGroup("/api/og");
ogApi.MapPost("/render", (OgImageRequest request) =>
{
    return Results.Ok(new
    {
        title = request.Title,
        subtitle = request.Subtitle,
        imageUrl = $"https://cdn.example.com/og/{Guid.NewGuid():N}.png"
    });
});

app.MapGet("/api/route-plan", () =>
{
    var routes = new[]
    {
        "POST /api/public/demo",
        "POST /api/public/support/contact",
        "POST /api/checkout/session",
        "POST /api/webhooks/stripe",
        "POST /api/auth/magic-link",
        "POST /api/auth/magic-link/verify",
        "GET /api/auth/session",
        "POST /api/auth/logout",
        "GET /api/user/dashboard/overview",
        "GET /api/user/onboarding",
        "POST /api/user/onboarding",
        "POST /api/user/onboarding/complete",
        "GET /api/user/reports/{reportId}",
        "GET /api/user/integrations/youtube/settings",
        "POST /api/user/integrations/youtube/settings",
        "POST /api/admin/login",
        "GET /api/admin/session",
        "POST /api/admin/logout",
        "GET /api/admin/dashboard/summary",
        "GET /api/admin/users",
        "GET /api/admin/support/tickets",
        "POST /api/og/render"
    };

    return Results.Content(JsonSerializer.Serialize(routes), "application/json");
});

app.Run();

static bool ExceptionLooksLikeTimeout(Exception ex, string flat)
{
    for (var e = ex; e is not null; e = e.InnerException)
    {
        if (e is OperationCanceledException or TaskCanceledException)
        {
            return true;
        }
    }

    return flat.Contains("TaskCanceledException", StringComparison.OrdinalIgnoreCase)
        || flat.Contains("OperationCanceledException", StringComparison.OrdinalIgnoreCase)
        || flat.Contains("The operation was canceled", StringComparison.OrdinalIgnoreCase);
}

static bool FixedTimeEquals(string left, string right)
{
    var a = System.Text.Encoding.UTF8.GetBytes(left);
    var b = System.Text.Encoding.UTF8.GetBytes(right);
    if (a.Length != b.Length) return false;
    return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(a, b);
}

static string NormalizeRedirectPath(string? redirectPath)
{
    if (string.IsNullOrWhiteSpace(redirectPath) || !redirectPath.StartsWith('/'))
    {
        return "/";
    }

    return redirectPath;
}

static string BuildMagicLinkUrl(HttpRequest request, string redirectPath, string token)
{
    var separator = redirectPath.Contains('?', StringComparison.Ordinal) ? "&" : "?";
    return $"{request.Scheme}://{request.Host}{redirectPath}{separator}token={Uri.EscapeDataString(token)}";
}

static SessionUserDto ToSessionUserDto(UserAccount user) => new(
    user.UserId,
    user.Email,
    user.Purchased,
    user.OnboardingCompleted,
    user.ChannelUrl,
    user.AccessStatus
);

static string? ResolveCognitoSubject(System.Security.Claims.ClaimsPrincipal principal)
{
    return
        principal.FindFirst("sub")?.Value
        ?? principal.FindFirst("cognito:username")?.Value
        ?? principal.FindFirst("preferred_username")?.Value
        ?? principal.FindFirst("username")?.Value
        ?? principal.FindFirst("email")?.Value
        ?? principal.FindFirst("emailaddress")?.Value;
}

static UserAccount GetAuthenticatedUser(HttpContext httpContext)
{
    return httpContext.Items["authenticatedUser"] as UserAccount
        ?? throw new InvalidOperationException("Authenticated user context was not found.");
}

static bool TryValidateYouTubeSettings(UserYouTubeSettingsRequest request, out string error)
{
    var hasCredentialsJson = !string.IsNullOrWhiteSpace(request.CredentialsJson);
    var hasClientId = !string.IsNullOrWhiteSpace(request.ClientId);
    var hasClientSecret = !string.IsNullOrWhiteSpace(request.ClientSecret);
    var hasGranular = hasClientId || hasClientSecret || !string.IsNullOrWhiteSpace(request.ProjectId) || !string.IsNullOrWhiteSpace(request.RedirectUri);

    if (!hasCredentialsJson && !hasGranular)
    {
        error = "Provide either a full credentials JSON payload or granular client settings.";
        return false;
    }

    if (hasGranular && (!hasClientId || !hasClientSecret))
    {
        error = "Granular Google settings require both a client ID and client secret.";
        return false;
    }

    error = string.Empty;
    return true;
}
