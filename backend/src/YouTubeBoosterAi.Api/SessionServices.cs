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
            ClearCookie(httpContext.Response, UserCookieName, httpContext.Request.IsHttps);
            return null;
        }

        // Aggressive invalidation: if user logged out, we bump epoch and every older cookie/session becomes invalid.
        var currentEpoch = await _appDataStore.GetUserAuthEpochAsync(session.UserId, cancellationToken);
        if (session.AuthEpoch != currentEpoch)
        {
            await _appDataStore.DeleteUserSessionAsync(sessionId, cancellationToken);
            ClearCookie(httpContext.Response, UserCookieName, httpContext.Request.IsHttps);
            return null;
        }

        var user = await _appDataStore.GetUserByIdAsync(session.UserId, cancellationToken);
        if (user is null)
        {
            await _appDataStore.DeleteUserSessionAsync(sessionId, cancellationToken);
            ClearCookie(httpContext.Response, UserCookieName, httpContext.Request.IsHttps);
        }

        return user;
    }

    public async Task SignInUserAsync(HttpContext httpContext, UserAccount user, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var epoch = await _appDataStore.GetUserAuthEpochAsync(user.UserId, cancellationToken);
        var session = new UserSessionRecord(
            SessionId: $"us_{Guid.NewGuid():N}",
            UserId: user.UserId,
            Email: user.Email,
            AuthEpoch: epoch,
            // Paid access should expire predictably (your requirement: every 12 hours).
            ExpiresAt: now.AddHours(12),
            CreatedAt: now
        );

        await _appDataStore.SaveUserSessionAsync(session, cancellationToken);
        AppendCookie(httpContext.Response, UserCookieName, session.SessionId, session.ExpiresAt, httpContext.Request.IsHttps);
    }

    public async Task SignOutUserAsync(HttpContext httpContext, CancellationToken cancellationToken)
    {
        if (httpContext.Request.Cookies.TryGetValue(UserCookieName, out var sessionId) && !string.IsNullOrWhiteSpace(sessionId))
        {
            // If we can resolve the session, bump the epoch so every previous cookie is invalid.
            var existingSession = await _appDataStore.GetUserSessionAsync(sessionId, cancellationToken);
            if (existingSession is not null)
            {
                await _appDataStore.BumpUserAuthEpochAsync(existingSession.UserId, cancellationToken);
            }

            await _appDataStore.DeleteUserSessionAsync(sessionId, cancellationToken);
        }

        // Aggressive: clear every cookie name the browser sent.
        // This ensures no stale cookies survive logout across browsers/tabs.
        ClearAllCookies(httpContext.Response, httpContext.Request, httpContext.Request.IsHttps);
        ClearCookie(httpContext.Response, UserCookieName, httpContext.Request.IsHttps);
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
            ClearCookie(httpContext.Response, AdminCookieName, httpContext.Request.IsHttps);
            return null;
        }

        var currentEpoch = await _appDataStore.GetAdminAuthEpochAsync(session.Email, cancellationToken);
        if (session.AuthEpoch != currentEpoch)
        {
            await _appDataStore.DeleteAdminSessionAsync(sessionId, cancellationToken);
            ClearCookie(httpContext.Response, AdminCookieName, httpContext.Request.IsHttps);
            return null;
        }

        return session;
    }

    public async Task SignInAdminAsync(HttpContext httpContext, string email, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var epoch = await _appDataStore.GetAdminAuthEpochAsync(normalizedEmail, cancellationToken);
        var session = new AdminSessionRecord(
            SessionId: $"ad_{Guid.NewGuid():N}",
            Email: normalizedEmail,
            AuthEpoch: epoch,
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
            var existingSession = await _appDataStore.GetAdminSessionAsync(sessionId, cancellationToken);
            if (existingSession is not null)
            {
                await _appDataStore.BumpAdminAuthEpochAsync(existingSession.Email, cancellationToken);
            }

            await _appDataStore.DeleteAdminSessionAsync(sessionId, cancellationToken);
        }

        ClearAllCookies(httpContext.Response, httpContext.Request, httpContext.Request.IsHttps);
        ClearCookie(httpContext.Response, AdminCookieName, httpContext.Request.IsHttps);
    }

    private static void AppendCookie(HttpResponse response, string name, string value, DateTimeOffset expiresAt, bool secure)
    {
        // The frontend calls the backend from a different origin (Amplify domain != API domain).
        // For cross-site requests via `fetch` with credentials, cookies must be `SameSite=None`
        // (and Secure=true), otherwise the browser won't send them back.
        var sameSite = secure ? SameSiteMode.None : SameSiteMode.Lax;

        response.Cookies.Append(name, value, new CookieOptions
        {
            HttpOnly = true,
            IsEssential = true,
            SameSite = sameSite,
            Secure = secure,
            Path = "/",
            Expires = expiresAt
        });
    }

    private static void ClearCookie(HttpResponse response, string name, bool secure)
    {
        var sameSite = secure ? SameSiteMode.None : SameSiteMode.Lax;

        // Aggressively delete the cookie across common paths and secure modes.
        // Cookie `Path` defaults to the request path when not explicitly set,
        // so older cookies might exist under `/api/auth` instead of `/`.
        var paths = new[] { "/", "/api", "/api/auth", "/api/admin" };
        var secureModes = new[] { secure, !secure };
        var sameSiteModes = secure
            ? new[] { SameSiteMode.None, SameSiteMode.Lax }
            : new[] { SameSiteMode.Lax, SameSiteMode.None };

        foreach (var s in secureModes)
        {
            foreach (var site in sameSiteModes)
            {
                foreach (var p in paths)
                {
                    // Cookies.Delete alone is unreliable for cross-site SameSite=None cookies.
                    // Explicitly overwrite with an expired value using matching attributes.
                    response.Cookies.Append(name, string.Empty, new CookieOptions
                    {
                        HttpOnly = true,
                        IsEssential = true,
                        SameSite = site,
                        Secure = s,
                        Path = p,
                        Expires = DateTimeOffset.UnixEpoch,
                        MaxAge = TimeSpan.Zero
                    });
                    response.Cookies.Delete(name, new CookieOptions
                    {
                        HttpOnly = true,
                        IsEssential = true,
                        SameSite = site,
                        Secure = s,
                        Path = p,
                        Expires = DateTimeOffset.UnixEpoch
                    });
                }
            }
        }
    }

    private static void ClearAllCookies(HttpResponse response, HttpRequest request, bool requestIsHttps)
    {
        // Clear across both secure modes and common paths.
        // Domain is host-only by default; `Cookies.Delete` without Domain uses request host.
        foreach (var key in request.Cookies.Keys)
        {
            if (string.IsNullOrWhiteSpace(key)) continue;
            ClearCookie(response, key, requestIsHttps);
        }
    }
}
