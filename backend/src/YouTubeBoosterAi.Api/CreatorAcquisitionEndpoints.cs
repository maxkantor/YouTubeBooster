using Amazon.SimpleEmail;
using Microsoft.AspNetCore.Mvc;

namespace YouTubeBoosterAi.Api;

public static class CreatorAcquisitionEndpoints
{
    public static void MapCreatorAcquisition(this WebApplication app)
    {
        var publicApi = app.MapGroup("/api/public/acq");
        publicApi.MapGet("/unsubscribe-health", () => Results.Ok(new { ok = true, service = "creator-acquisition-unsubscribe" }));
        publicApi.MapGet("/unsubscribe", async (
            string? token,
            ICreatorAcquisitionService acq,
            IAppDataStore store,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var hmac = (await secrets.GetValueAsync("outreach/unsubscribe-hmac", secure: true, cancellationToken))?.Trim();
            if (string.IsNullOrWhiteSpace(hmac) || !OutreachUnsubscribeToken.TryValidate(token ?? "", hmac, out var email))
                return Results.BadRequest(new { ok = false, error = "Invalid unsubscribe link." });
            await acq.UnsubscribeAsync(email, cancellationToken);
            return Results.Ok(new { ok = true, unsubscribed = true });
        });
        publicApi.MapPost("/unsubscribe", async (
            HttpContext http,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var token = http.Request.Query["token"].ToString();
            var hmac = (await secrets.GetValueAsync("outreach/unsubscribe-hmac", secure: true, cancellationToken))?.Trim();
            if (string.IsNullOrWhiteSpace(hmac) || !OutreachUnsubscribeToken.TryValidate(token, hmac, out var email))
                return Results.BadRequest(new { ok = false, error = "Invalid unsubscribe link." });
            await acq.UnsubscribeAsync(email, cancellationToken);
            return Results.Ok(new { ok = true, unsubscribed = true });
        });
        publicApi.MapGet("/go/{token}", async (string token, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var p = await acq.Store.GetByTokenAsync(token, cancellationToken);
            if (p is null) return Results.NotFound();
            await acq.RecordFunnelAsync(token, "acq_click", cancellationToken);
            var handle = p.Handle.StartsWith('@') ? p.Handle : "@" + p.Handle.TrimStart('@');
            var dest = $"https://youtubeboosterai.com/share?channel={Uri.EscapeDataString(handle)}&utm_source=creator_outreach&utm_medium=email&utm_campaign=cook_001&utm_content={Uri.EscapeDataString(p.ProspectId)}";
            return Results.Redirect(dest);
        });
        publicApi.MapPost("/weekday-send", async (
            HttpContext http,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var expected = (await secrets.GetValueAsync("outreach/cron-key", secure: true, cancellationToken))?.Trim();
            var provided = http.Request.Headers["X-Outreach-Cron-Key"].ToString();
            if (string.IsNullOrWhiteSpace(expected) || !string.Equals(expected, provided, StringComparison.Ordinal))
                return Results.Unauthorized();
            var result = await acq.RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken);
            return Results.Ok(result);
        });
        publicApi.MapPost("/ses-events", async (
            HttpContext http,
            [FromBody] AcqSesEventRequest? request,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var expected = (await secrets.GetValueAsync("outreach/ses-events-key", secure: true, cancellationToken))?.Trim();
            var provided = http.Request.Headers["X-Outreach-Ses-Key"].ToString();
            if (string.IsNullOrWhiteSpace(expected) || !string.Equals(expected, provided, StringComparison.Ordinal))
                return Results.Unauthorized();
            if (request is null || string.IsNullOrWhiteSpace(request.ProspectId) || string.IsNullOrWhiteSpace(request.EventType))
                return Results.BadRequest(new { error = "prospectId and eventType required. Do not send email addresses in tags." });
            await acq.ApplySesEventAsync(request.ProspectId, request.EventType, cancellationToken);
            return Results.Ok(new { ok = true });
        });
        publicApi.MapPost("/inbound", async (
            HttpContext http,
            [FromBody] AcqInboundRequest? request,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var expected = (await secrets.GetValueAsync("outreach/inbound-key", secure: true, cancellationToken))?.Trim();
            var provided = http.Request.Headers["X-Outreach-Inbound-Key"].ToString();
            if (string.IsNullOrWhiteSpace(expected) || !string.Equals(expected, provided, StringComparison.Ordinal))
                return Results.Unauthorized();
            if (request is null || !EmailAddressHelpers.LooksLikeEmail(request.FromEmail))
                return Results.BadRequest(new { error = "fromEmail required" });
            var preview = string.IsNullOrWhiteSpace(request.Preview) ? "(no preview)" : request.Preview.Trim();
            if (preview.Length > 240) preview = preview[..237] + "…";
            var row = await acq.RecordInboundAsync(request.FromEmail.Trim(), request.Subject ?? "(no subject)", preview, request.MessageId, request.InReplyTo, cancellationToken);
            return Results.Ok(new
            {
                ok = row is not null,
                prospectId = row?.ProspectId,
                channel = row?.ChannelName,
                crmPath = row?.TicketId is null ? null : $"/admin/contacts/{row.TicketId}"
            });
        });

        var admin = app.MapGroup("/api/admin/crm/acquisition");
        admin.AddEndpointFilter(async (context, next) =>
        {
            if (string.Equals(context.HttpContext.Request.Method, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                return Results.Ok();
            var sessionCookieService = context.HttpContext.RequestServices.GetRequiredService<SessionCookieService>();
            var adminUser = await sessionCookieService.GetAuthenticatedAdminAsync(context.HttpContext, context.HttpContext.RequestAborted);
            if (adminUser is null) return Results.Unauthorized();
            context.HttpContext.Items["authenticatedAdmin"] = adminUser;
            return await next(context);
        });

        admin.MapGet("/summary", async (ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var rows = await acq.Store.ListProspectsAsync(cancellationToken);
            var state = await acq.LoadStateAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken);
            return Results.Ok(new
            {
                verifiedCustomers = 0,
                marketingSendingEnabled = state.MarketingSendingEnabled,
                complaintPause = state.ComplaintPause,
                fromEmailConfigured = EmailAddressHelpers.LooksLikeEmail(state.FromEmail),
                postalAddressConfigured = !string.IsNullOrWhiteSpace(state.PostalAddress),
                discovered = rows.Count,
                inspected = rows.Count(r => r.InspectionStatus == "completed"),
                contactVerified = rows.Count(CreatorAcquisitionScoring.IsVerifiedPublicEmail),
                drafts = rows.Count(r => !string.IsNullOrWhiteSpace(r.Observation) && !string.IsNullOrWhiteSpace(r.Subject)),
                approved = rows.Count(r => !string.IsNullOrWhiteSpace(r.ApprovalId)),
                sent = rows.Count(r => r.LastContactedAt is not null),
                views = CreatorAcquisitionViews.All.ToDictionary(v => v, v => rows.Count(r => CreatorAcquisitionScoring.MapView(r) == v))
            });
        });

        admin.MapGet("/prospects", async (
            string? view,
            string? niche,
            string? campaign,
            string? language,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var rows = await acq.Store.ListProspectsAsync(cancellationToken);
            IEnumerable<AcqProspectRecord> q = rows;
            if (!string.IsNullOrWhiteSpace(campaign))
                q = q.Where(r => string.Equals(r.Campaign, campaign, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(niche))
                q = q.Where(r => string.Equals(r.PrimaryNiche, niche, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(language))
                q = q.Where(r => string.Equals(r.Language, language, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(view) && view != "all")
                q = q.Where(r => CreatorAcquisitionScoring.MapView(r) == view);
            var items = q.Select(r => new AcqAdminProspectDto(CreatorAcquisitionScoring.Sanitize(r), r.PublicBusinessEmail)).ToArray();
            return Results.Ok(new { items, totalCount = items.Length });
        });

        admin.MapGet("/prospects/{id}", async (string id, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var row = await acq.Store.GetProspectAsync(id, cancellationToken);
            return row is null ? Results.NotFound() : Results.Ok(new AcqAdminProspectDto(CreatorAcquisitionScoring.Sanitize(row), row.PublicBusinessEmail));
        });

        admin.MapPost("/inspect", async (AcqUpsertProspectRequest request, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.ChannelInput))
                return Results.BadRequest(new { error = "channelInput required" });
            var row = await acq.InspectAndUpsertAsync(request, cancellationToken);
            return Results.Ok(new AcqAdminProspectDto(CreatorAcquisitionScoring.Sanitize(row), row.PublicBusinessEmail));
        });

        admin.MapPost("/prospects/{id}/draft", async (string id, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var row = await acq.PrepareDraftAsync(id, cancellationToken);
            return row is null ? Results.NotFound() : Results.Ok(new AcqAdminProspectDto(CreatorAcquisitionScoring.Sanitize(row), row.PublicBusinessEmail));
        });

        admin.MapPost("/preview", async (AcqApproveBatchRequest request, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var state = await acq.LoadStateAsync(request.Campaign, cancellationToken);
            var items = new List<object>();
            foreach (var id in request.ProspectIds.Take(CreatorAcquisitionService.MaxBatchApprove))
            {
                var p = await acq.Store.GetProspectAsync(id, cancellationToken);
                if (p is null) continue;
                items.Add(new
                {
                    p.ProspectId,
                    p.ChannelName,
                    subscriberCount = p.SubscriberCount,
                    p.RecentUploadAt,
                    publicBusinessEmail = p.PublicBusinessEmail,
                    p.ContactSourceUrl,
                    p.Observation,
                    p.Subject,
                    trackedUrl = acq.Site() + p.TrackedPath,
                    suppression = p.SuppressionStatus,
                    wouldSend = false,
                    note = "Preview never sends."
                });
            }
            return Results.Ok(new { preview = true, sent = false, marketingSendingEnabled = state.MarketingSendingEnabled, items });
        });

        admin.MapPost("/approvals", async (HttpContext http, AcqApproveBatchRequest request, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var adminUser = (AdminSessionRecord)http.Items["authenticatedAdmin"]!;
            var (approval, error) = await acq.ApproveBatchAsync(request, adminUser.Email, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(approval);
        });

        admin.MapPost("/test-send", async (
            [FromBody] AcqTestSendRequest request,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            IAmazonSimpleEmailService ses,
            CancellationToken cancellationToken) =>
        {
            var allow = (await secrets.GetValueAsync("outreach/test-recipient", secure: false, cancellationToken))?.Trim();
            if (!EmailAddressHelpers.LooksLikeEmail(allow) || !string.Equals(allow, request.To?.Trim(), StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Test send only to Max’s configured test address (SSM outreach/test-recipient). External creators are blocked." });
            return Results.Ok(new { ok = true, sent = false, note = "External and test sending remain disabled until marketing sending is explicitly enabled after SES identity setup." });
        });
    }
}

public sealed record AcqSesEventRequest(string ProspectId, string EventType);
public sealed record AcqInboundRequest(string FromEmail, string? Subject, string? Preview, string? MessageId, string? InReplyTo);
public sealed record AcqTestSendRequest(string? To);

public interface ICreatorAcquisitionService
{
    ICreatorAcquisitionStore Store { get; }
    Task<AcqCampaignState> LoadStateAsync(string campaign, CancellationToken cancellationToken);
    Task<AcqProspectRecord> InspectAndUpsertAsync(AcqUpsertProspectRequest request, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> PrepareDraftAsync(string prospectId, CancellationToken cancellationToken);
    Task<(AcqApprovalRecord? Approval, string? Error)> ApproveBatchAsync(AcqApproveBatchRequest request, string approver, CancellationToken cancellationToken);
    Task<AcqWeekdaySendResult> RunWeekdaySendAsync(string campaign, CancellationToken cancellationToken);
    Task UnsubscribeAsync(string email, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> RecordInboundAsync(string email, string subject, string preview, string? messageId, string? inReplyTo, CancellationToken cancellationToken);
    Task ApplySesEventAsync(string prospectId, string eventType, CancellationToken cancellationToken);
    Task RecordFunnelAsync(string token, string eventName, CancellationToken cancellationToken);
    string Site();
}

