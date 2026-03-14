namespace YouTubeBoosterAi.Api;

public sealed class SessionCookieService
{
    public const string UserCookieName = "ybai_user_session";
    public const string AdminCookieName = "ybai_admin_session";

    private readonly IAppDataStore _appDataStore;

    public SessionCookieService(IAppDataStore appDataStore)
    {
        _appDataStore = appDataStore;
    }

    public async Task<UserAccount?> GetAuthenticatedUserAsync(HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (!httpContext.Request.Cookies.TryGetValue(UserCookieName, out var sessionId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return null;
        }

        var session = await _appDataStore.GetUserSessionAsync(sessionId, cancellationToken);
        if (session is null)
        {
            ClearCookie(httpContext.Response, UserCookieName);
            return null;
        }

        var user = await _appDataStore.GetUserByIdAsync(session.UserId, cancellationToken);
        if (user is null)
        {
            await _appDataStore.DeleteUserSessionAsync(sessionId, cancellationToken);
            ClearCookie(httpContext.Response, UserCookieName);
        }

        return user;
    }

    public async Task SignInUserAsync(HttpContext httpContext, UserAccount user, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var session = new UserSessionRecord(
            SessionId: $"us_{Guid.NewGuid():N}",
            UserId: user.UserId,
            Email: user.Email,
            ExpiresAt: now.AddDays(14),
            CreatedAt: now
        );

        await _appDataStore.SaveUserSessionAsync(session, cancellationToken);
        AppendCookie(httpContext.Response, UserCookieName, session.SessionId, session.ExpiresAt, httpContext.Request.IsHttps);
    }

    public async Task SignOutUserAsync(HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (httpContext.Request.Cookies.TryGetValue(UserCookieName, out var sessionId) && !string.IsNullOrWhiteSpace(sessionId))
        {
            await _appDataStore.DeleteUserSessionAsync(sessionId, cancellationToken);
        }

        ClearCookie(httpContext.Response, UserCookieName);
    }

    public async Task<AdminSessionRecord?> GetAuthenticatedAdminAsync(HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (!httpContext.Request.Cookies.TryGetValue(AdminCookieName, out var sessionId) || string.IsNullOrWhiteSpace(sessionId))
        {
            return null;
        }

        var session = await _appDataStore.GetAdminSessionAsync(sessionId, cancellationToken);
        if (session is null)
        {
            ClearCookie(httpContext.Response, AdminCookieName);
        }

        return session;
    }

    public async Task SignInAdminAsync(HttpContext httpContext, string email, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var session = new AdminSessionRecord(
            SessionId: $"ad_{Guid.NewGuid():N}",
            Email: email.Trim().ToLowerInvariant(),
            ExpiresAt: now.AddHours(12),
            CreatedAt: now
        );

        await _appDataStore.SaveAdminSessionAsync(session, cancellationToken);
        AppendCookie(httpContext.Response, AdminCookieName, session.SessionId, session.ExpiresAt, httpContext.Request.IsHttps);
    }

    public async Task SignOutAdminAsync(HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (httpContext.Request.Cookies.TryGetValue(AdminCookieName, out var sessionId) && !string.IsNullOrWhiteSpace(sessionId))
        {
            await _appDataStore.DeleteAdminSessionAsync(sessionId, cancellationToken);
        }

        ClearCookie(httpContext.Response, AdminCookieName);
    }

    private static void AppendCookie(HttpResponse response, string name, string value, DateTimeOffset expiresAt, bool secure)
    {
        response.Cookies.Append(name, value, new CookieOptions
        {
            HttpOnly = true,
            IsEssential = true,
            SameSite = SameSiteMode.Lax,
            Secure = secure,
            Expires = expiresAt
        });
    }

    private static void ClearCookie(HttpResponse response, string name)
    {
        response.Cookies.Delete(name, new CookieOptions
        {
            HttpOnly = true,
            IsEssential = true,
            SameSite = SameSiteMode.Lax
        });
    }
}
