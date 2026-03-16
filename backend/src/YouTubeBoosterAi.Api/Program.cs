using System.Text.Json;
using Amazon.Lambda.AspNetCoreServer.Hosting;
using YouTubeBoosterAi.Api;

var builder = WebApplication.CreateBuilder(args);

// Configure this ASP.NET Core app to run inside AWS Lambda behind an HTTP API (payload v2).
builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddApplicationInfrastructure(builder.Configuration);

var app = builder.Build();

app.UseHttpsRedirection();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "youtube-booster-ai-api" }));

var publicApi = app.MapGroup("/api/public");
publicApi.MapPost("/demo", async (DemoAnalysisRequest request, IDemoAnalysisService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.ChannelInput))
    {
        return Results.BadRequest(new { error = "Channel input is required." });
    }

    var result = await service.RunDemoAsync(request, cancellationToken);
    return Results.Ok(result);
});

publicApi.MapPost("/support/contact", async (SupportTicketRequest request, ISupportService supportService, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Message))
    {
        return Results.BadRequest(new { error = "Email, subject, and message are required." });
    }

    var response = await supportService.CreateTicketAsync(request, cancellationToken);
    return Results.Ok(response);
});

var checkoutApi = app.MapGroup("/api/checkout");
checkoutApi.MapPost("/session", async (CreateCheckoutSessionRequest request, ICheckoutService service, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.ChannelInput))
    {
        return Results.BadRequest(new { error = "Email and channel input are required." });
    }

    var response = await service.CreateSessionAsync(request, cancellationToken);
    return Results.Ok(response);
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

var authApi = app.MapGroup("/api/auth");
authApi.MapPost("/magic-link", async (MagicLinkLoginRequest request, HttpContext httpContext, IAppDataStore appDataStore, IMagicLinkNotificationService magicLinkNotificationService, CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return Results.BadRequest(new { error = "Email is required." });
    }

    var user = await appDataStore.GetUserByEmailAsync(request.Email, cancellationToken);
    if (user is null || !user.Purchased)
    {
        return Results.BadRequest(new { error = "No purchased access was found for that email." });
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

userApi.MapGet("/dashboard/overview", async (HttpContext httpContext, IUserDashboardService service, CancellationToken cancellationToken) =>
{
    var user = GetAuthenticatedUser(httpContext);
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

    if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
    {
        return Results.Problem("Admin credentials are not configured.");
    }

    if (!string.Equals(request.Email, adminEmail, StringComparison.OrdinalIgnoreCase) || request.Password != adminPassword)
    {
        await appDataStore.TrackEventAsync("admin_login_failed", request.Email, new Dictionary<string, string?>
        {
            ["scope"] = "admin"
        }, cancellationToken);
        return Results.Unauthorized();
    }

    await sessionCookieService.SignInAdminAsync(httpContext, request.Email, cancellationToken);
    await appDataStore.TrackEventAsync("admin_login_succeeded", request.Email, new Dictionary<string, string?>
    {
        ["scope"] = "admin"
    }, cancellationToken);

    return Results.Ok(new AdminSessionStatusResponse(true, request.Email.Trim().ToLowerInvariant()));
});

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

static string NormalizeRedirectPath(string? redirectPath)
{
    if (string.IsNullOrWhiteSpace(redirectPath) || !redirectPath.StartsWith('/'))
    {
        return "/checkout/success";
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
