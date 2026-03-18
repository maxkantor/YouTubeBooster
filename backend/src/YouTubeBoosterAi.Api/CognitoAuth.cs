using Microsoft.AspNetCore.Authentication.JwtBearer;
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
                    ValidateIssuer = true,
                    ValidIssuer = opts.Authority,
                    ValidateAudience = true,
                    ValidAudience = opts.AppClientId,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(2)
                };
            });

        services.AddAuthorization();
        return services;
    }
}

