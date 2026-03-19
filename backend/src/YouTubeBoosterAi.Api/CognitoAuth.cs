using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace YouTubeBoosterAi.Api;

public sealed record CognitoAuthOptions(
    string Region,
    string UserPoolId,
    string AppClientId
)
{
    public string Authority => $"https://cognito-idp.{Region}.amazonaws.com/{UserPoolId}";
}

public static class CognitoAuth
{
    public static IServiceCollection AddCognitoJwtAuth(this IServiceCollection services, IConfiguration configuration)
    {
        var region = configuration["Cognito:Region"] ?? configuration["COGNITO_REGION"];
        var userPoolId = configuration["Cognito:UserPoolId"] ?? configuration["COGNITO_USER_POOL_ID"];
        var appClientId = configuration["Cognito:AppClientId"] ?? configuration["COGNITO_APP_CLIENT_ID"];

        if (string.IsNullOrWhiteSpace(region) || string.IsNullOrWhiteSpace(userPoolId) || string.IsNullOrWhiteSpace(appClientId))
        {
            // Auth disabled if not configured; endpoints that require auth should still enforce it.
            return services;
        }

        var opts = new CognitoAuthOptions(region, userPoolId, appClientId);
        services.AddSingleton(opts);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.Authority = opts.Authority;
                o.RequireHttpsMetadata = true;
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    // Cognito tokens can have `iss` / `aud` differences depending on app-client / token type.
                    // Keep signature + lifetime validation, but avoid failing exchange on strict claim mismatches.
                    ValidateIssuer = false,
                    ValidIssuer = opts.Authority,
                    ValidateAudience = false,
                    ValidAudience = opts.AppClientId,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(2)
                };

                // AWS Lambda logs are currently too silent about *why* JWT validation fails.
                // This helps pinpoint audience/issuer mismatch vs missing/invalid token.
                o.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = ctx =>
                    {
                        try
                        {
                            // Lambda logs can be noisy; Console.WriteLine is the most reliable way to surface the reason.
                            Console.WriteLine($"[JwtBearer] JWT authentication failed: {ctx.Exception?.Message}");
                            Console.WriteLine($"[JwtBearer] Authorization header present: {(!string.IsNullOrWhiteSpace(ctx.Request?.Headers?.Authorization.ToString()))}");
                        }
                        catch
                        {
                            // ignore logging failures
                        }

                        return Task.CompletedTask;
                    }
                    ,
                    OnChallenge = ctx =>
                    {
                        try
                        {
                            Console.WriteLine($"[JwtBearer] Challenge: error={ctx.Error} desc={ctx.ErrorDescription}");
                            Console.WriteLine($"[JwtBearer] Authorization header present: {(!string.IsNullOrWhiteSpace(ctx.Request?.Headers?.Authorization.ToString()))}");
                        }
                        catch
                        {
                            // ignore logging failures
                        }

                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();
        return services;
    }
}

