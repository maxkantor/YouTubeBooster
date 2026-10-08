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
            HttpContext http,
            string? token,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var hmac = (await secrets.GetValueAsync("outreach/unsubscribe-hmac", secure: true, cancellationToken))?.Trim();
            if (string.IsNullOrWhiteSpace(hmac) || !OutreachUnsubscribeToken.TryValidate(token ?? "", hmac, out var email))
                return UnsubscribeResponse(http, false, false, "This unsubscribe link is not valid.");
            var already = await acq.IsGloballyUnsubscribedAsync(email, cancellationToken);
            await acq.UnsubscribeAsync(email, cancellationToken);
            return UnsubscribeResponse(http, true, already, already
                ? "You're already unsubscribed."
                : "You have been unsubscribed.");
        }).RequireRateLimiting("acq-public");
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
            var already = await acq.IsGloballyUnsubscribedAsync(email, cancellationToken);
            await acq.UnsubscribeAsync(email, cancellationToken);
            return Results.Ok(new { ok = true, unsubscribed = true, already });
        }).RequireRateLimiting("acq-public");
        publicApi.MapGet("/go/{token}", async (string token, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var p = await acq.Store.GetByTokenAsync(token, cancellationToken);
            if (p is null) return Results.NotFound();
            await acq.RecordFunnelAsync(token, "acq_click", cancellationToken);
            var variant = OutreachPolicy.PersistVariant(p.EmailVariant, p.ProspectId);
            var runYmd = p.CohortRunId is { Length: >= 10 } ? p.CohortRunId[^10..] : CreatorAcquisitionScoring.EasternDate(DateTimeOffset.UtcNow).ToString("yyyy-MM-dd");
            // Personalized free audit (opaque token) — no email/internal ids in the URL.
            var dest = $"https://youtubeboosterai.com/audit/{Uri.EscapeDataString(token)}"
                + $"?utm_source=outreach&utm_medium=email&utm_campaign={Uri.EscapeDataString(p.Campaign)}"
                + $"&utm_content={Uri.EscapeDataString(variant)}"
                + $"&utm_id={Uri.EscapeDataString(runYmd)}"
                + $"&yb_oid={Uri.EscapeDataString(token)}"
                + $"&exp=004&seg={Uri.EscapeDataString(string.IsNullOrWhiteSpace(p.PrimaryNiche) ? "cooking" : p.PrimaryNiche)}";
            return Results.Redirect(dest);
        });
        publicApi.MapGet("/audit/{token}", async (string token, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var payload = await acq.GetPersonalizedAuditAsync(token, cancellationToken);
            return payload is null ? Results.NotFound(new { error = "audit_not_found" }) : Results.Ok(payload);
        }).RequireRateLimiting("acq-public");
        publicApi.MapPost("/audit/{token}/engage", async (string token, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            await acq.RecordFunnelAsync(token, "audit_engaged", cancellationToken);
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("acq-public");
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
            var dry = string.Equals(http.Request.Query["dryRun"].ToString(), "true", StringComparison.OrdinalIgnoreCase);
            var result = dry
                ? await acq.RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken, true)
                : await acq.RunScheduledAcquisitionAsync(cancellationToken);
            return Results.Ok(result);
        });
        publicApi.MapPost("/ses-events", async (
            HttpContext http,
            ICreatorAcquisitionService acq,
            ISecretValueProvider secrets,
            CancellationToken cancellationToken) =>
        {
            var expected = (await secrets.GetValueAsync("outreach/ses-events-key", secure: true, cancellationToken))?.Trim();
            var providedHeader = http.Request.Headers["X-Outreach-Ses-Key"].ToString();
            var providedQuery = http.Request.Query["key"].ToString();
            var provided = !string.IsNullOrWhiteSpace(providedHeader) ? providedHeader : providedQuery;
            if (string.IsNullOrWhiteSpace(expected) || expected.Length < 8
                || !string.Equals(expected, provided, StringComparison.Ordinal))
                return Results.Unauthorized();

            using var reader = new StreamReader(http.Request.Body);
            var raw = await reader.ReadToEndAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(raw))
                return Results.BadRequest(new { error = "empty body" });

            // SNS subscription / notification envelope
            if ((raw.Contains("\"Type\"", StringComparison.Ordinal) && raw.Contains("SubscriptionConfirmation", StringComparison.Ordinal))
                || raw.Contains("\"Type\":\"Notification\"", StringComparison.Ordinal)
                || raw.Contains("\"Type\": \"Notification\"", StringComparison.Ordinal))
            {
                using var doc = System.Text.Json.JsonDocument.Parse(raw);
                var root = doc.RootElement;
                var type = root.TryGetProperty("Type", out var t) ? t.GetString() : null;
                if (string.Equals(type, "SubscriptionConfirmation", StringComparison.OrdinalIgnoreCase))
                {
                    var subscribeUrl = root.TryGetProperty("SubscribeURL", out var u) ? u.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(subscribeUrl))
                    {
                        using var httpClient = new HttpClient();
                        await httpClient.GetAsync(subscribeUrl, cancellationToken);
                    }
                    return Results.Ok(new { ok = true, subscribed = true });
                }
                if (string.Equals(type, "Notification", StringComparison.OrdinalIgnoreCase))
                {
                    var message = root.TryGetProperty("Message", out var m) ? m.GetString() : null;
                    if (string.IsNullOrWhiteSpace(message))
                        return Results.BadRequest(new { error = "sns message missing" });
                    var applied = await ApplySesNotificationAsync(acq, message, cancellationToken);
                    return Results.Ok(new { ok = true, applied });
                }
            }

            // Direct JSON: { prospectId, eventType }
            try
            {
                var direct = System.Text.Json.JsonSerializer.Deserialize<AcqSesEventRequest>(raw, AcqJson.Options);
                if (direct is null || string.IsNullOrWhiteSpace(direct.ProspectId) || string.IsNullOrWhiteSpace(direct.EventType))
                    return Results.BadRequest(new { error = "prospectId and eventType required. Do not send email addresses in tags." });
                await acq.ApplySesEventAsync(direct.ProspectId, direct.EventType, cancellationToken);
                return Results.Ok(new { ok = true });
            }
            catch
            {
                return Results.BadRequest(new { error = "unrecognized ses event payload" });
            }
        });

        static async Task<int> ApplySesNotificationAsync(
            ICreatorAcquisitionService acq,
            string messageJson,
            CancellationToken cancellationToken)
        {
            using var doc = System.Text.Json.JsonDocument.Parse(messageJson);
            var root = doc.RootElement;
            var eventType = root.TryGetProperty("eventType", out var et) ? et.GetString()
                : root.TryGetProperty("notificationType", out var nt) ? nt.GetString()
                : null;
            if (string.IsNullOrWhiteSpace(eventType)) return 0;

            string? prospectId = null;
            string? oid = null;
            string? messageId = null;
            string? destinationEmail = null;

            if (root.TryGetProperty("mail", out var mail))
            {
                if (mail.TryGetProperty("messageId", out var mid))
                    messageId = mid.GetString();
                if (mail.TryGetProperty("destination", out var dest) && dest.ValueKind == System.Text.Json.JsonValueKind.Array
                    && dest.GetArrayLength() > 0)
                    destinationEmail = dest[0].GetString();
                if (mail.TryGetProperty("tags", out var tags))
                {
                    prospectId = ReadSesTag(tags, "prospect_id") ?? ReadSesTag(tags, "prospect-id");
                    oid = ReadSesTag(tags, "oid");
                }
            }

            // Delivery / bounce payloads often put the recipient outside mail.destination.
            if (string.IsNullOrWhiteSpace(destinationEmail)
                && root.TryGetProperty("delivery", out var delivery)
                && delivery.TryGetProperty("recipients", out var dRecipients)
                && dRecipients.ValueKind == System.Text.Json.JsonValueKind.Array
                && dRecipients.GetArrayLength() > 0)
                destinationEmail = dRecipients[0].GetString();
            if (string.IsNullOrWhiteSpace(destinationEmail)
                && root.TryGetProperty("bounce", out var bounce)
                && bounce.TryGetProperty("bouncedRecipients", out var bRecipients)
                && bRecipients.ValueKind == System.Text.Json.JsonValueKind.Array
                && bRecipients.GetArrayLength() > 0
                && bRecipients[0].TryGetProperty("emailAddress", out var bEmail))
                destinationEmail = bEmail.GetString();
            if (string.IsNullOrWhiteSpace(destinationEmail)
                && root.TryGetProperty("complaint", out var complaint)
                && complaint.TryGetProperty("complainedRecipients", out var cRecipients)
                && cRecipients.ValueKind == System.Text.Json.JsonValueKind.Array
                && cRecipients.GetArrayLength() > 0
                && cRecipients[0].TryGetProperty("emailAddress", out var cEmail))
                destinationEmail = cEmail.GetString();

            var normalized = eventType.ToLowerInvariant() switch
            {
                "delivery" => "delivery",
                "bounce" => "bounce",
                "complaint" => "complaint",
                "reject" => "reject",
                "click" => "click",
                "send" => "send",
                _ => eventType.ToLowerInvariant()
            };
            // "send" is SES accepted — do not overwrite CRM status from it.
            if (normalized is "send" or "click") return 0;

            var applied = await acq.ApplySesEventResolvedAsync(
                prospectId, oid, messageId, destinationEmail, normalized, cancellationToken);
            return applied ? 1 : 0;
        }

        static string? ReadSesTag(System.Text.Json.JsonElement tags, string name)
        {
            foreach (var prop in tags.EnumerateObject())
            {
                if (!string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                if (prop.Value.ValueKind == System.Text.Json.JsonValueKind.Array && prop.Value.GetArrayLength() > 0)
                    return prop.Value[0].GetString();
                if (prop.Value.ValueKind == System.Text.Json.JsonValueKind.String)
                    return prop.Value.GetString();
            }
            return null;
        }
        publicApi.MapPost("/inbound", async (
            HttpContext http,
            [FromBody] AcqInboundRequest? request,
            ICreatorAcquisitionService acq,
            IAppDataStore appDataStore,
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
            try
            {
                var row = await acq.RecordInboundAsync(request.FromEmail.Trim(), request.Subject ?? "(no subject)", preview, request.MessageId, request.InReplyTo, cancellationToken);
                await appDataStore.TrackEventAsync(
                    row is null ? "acquisition_inbound_failed" : "acquisition_inbound_processed",
                    row?.ProspectId ?? request.FromEmail.Trim(),
                    new Dictionary<string, string?>
                    {
                        ["matched"] = (row is not null).ToString(),
                        ["ticketId"] = row?.TicketId
                    },
                    cancellationToken);
                return Results.Ok(new
                {
                    ok = row is not null,
                    prospectId = row?.ProspectId,
                    channel = row?.ChannelName,
                    crmPath = row?.TicketId is null ? null : $"/admin/contacts/{row.TicketId}"
                });
            }
            catch (Exception ex)
            {
                await appDataStore.TrackEventAsync("acquisition_inbound_failed", request.FromEmail.Trim(), new Dictionary<string, string?>
                {
                    ["error"] = ex.Message
                }, cancellationToken);
                throw;
            }
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
            var campaign = CreatorAcquisitionCampaigns.Cook001;
            var state = await acq.LoadStateAsync(campaign, cancellationToken);
            await acq.PromoteAutomaticReadyDraftsAsync(campaign, state, cancellationToken);
            var rows = await acq.Store.ListProspectsAsync(cancellationToken);
            var now = DateTimeOffset.UtcNow;
            var todayEt = CreatorAcquisitionScoring.EasternDate(now).Date;
            var runYmd = todayEt.ToString("yyyy-MM-dd");
            var cohortRunId = $"{campaign}-{runYmd}";

            var discovered = rows.Count;
            var inspected = rows.Count(r => r.InspectionStatus == "completed");
            var contactVerified = rows.Count(CreatorAcquisitionScoring.IsVerifiedPublicEmail);
            var drafts = rows.Count(r => !string.IsNullOrWhiteSpace(r.Observation) && !string.IsNullOrWhiteSpace(r.Subject));
            var everApproved = rows.Count(r =>
                !string.IsNullOrWhiteSpace(r.ApprovalId)
                || r.ApprovedAt is not null
                || r.LastContactedAt is not null);
            var sent = rows.Count(r => r.LastContactedAt is not null);
            static bool StatusAtLeast(string? status, params string[] stages) =>
                stages.Any(s => string.Equals(status, s, StringComparison.OrdinalIgnoreCase));

            var delivered = rows.Count(r => StatusAtLeast(r.OutreachStatus,
                "delivered", "clicked", "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer"));
            // Clicked = CTA tracked; do not count SES delivery alone as a click.
            var clicked = rows.Count(r => StatusAtLeast(r.OutreachStatus,
                "clicked", "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer"));
            var auditStarted = rows.Count(r => StatusAtLeast(r.OutreachStatus,
                "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer"));
            var auditCompleted = rows.Count(r => StatusAtLeast(r.OutreachStatus,
                "audit_completed", "pricing_viewed", "checkout_started", "customer"));
            var pricingViewed = rows.Count(r => StatusAtLeast(r.OutreachStatus,
                "pricing_viewed", "checkout_started", "customer"));
            var checkoutStartedCrm = rows.Count(r => StatusAtLeast(r.OutreachStatus,
                "checkout_started", "customer"));
            var converted = rows.Count(r => string.Equals(r.OutreachStatus, "customer", StringComparison.OrdinalIgnoreCase));
            var bounced = rows.Count(r => string.Equals(r.SuppressionStatus, "bounced", StringComparison.OrdinalIgnoreCase));
            var complained = rows.Count(r => string.Equals(r.SuppressionStatus, "complained", StringComparison.OrdinalIgnoreCase));
            var unsubscribed = rows.Count(r => string.Equals(r.SuppressionStatus, "unsubscribed", StringComparison.OrdinalIgnoreCase));
            var views = CreatorAcquisitionViews.All.ToDictionary(
                v => v,
                v => rows.Count(r => CreatorAcquisitionScoring.MapView(r) == v));
            // approval_queue is a UI alias for draft_ready (MapView never emits approval_queue)
            views["approval_queue"] = views.GetValueOrDefault("draft_ready");

            var cfg = await acq.ResolveCampaignConfigAsync(campaign, cancellationToken);
            var cookRows = rows
                .Where(r => string.Equals(r.Campaign, campaign, StringComparison.OrdinalIgnoreCase))
                .Where(r => CreatorAcquisitionService.MatchesCampaignAudience(r, cfg))
                .ToList();
            // Funnel / click / delivery: all COOK-001 campaign rows (include already-sent even if niche drifted).
            var cookCampaignRows = rows
                .Where(r => string.Equals(r.Campaign, campaign, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var deliveredCook = cookCampaignRows.Count(r => StatusAtLeast(r.OutreachStatus,
                "delivered", "clicked", "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer"));
            var deliveredExact = cookCampaignRows.Count(r =>
                string.Equals(r.OutreachStatus, "delivered", StringComparison.OrdinalIgnoreCase));
            var sesAcceptedCook = cookCampaignRows.Count(r =>
                r.LastContactedAt is not null
                && !string.Equals(r.SuppressionStatus, "bounced", StringComparison.OrdinalIgnoreCase));
            var deliveryUnknown = cookCampaignRows.Count(r =>
                r.LastContactedAt is not null
                && string.Equals(r.OutreachStatus, "sent", StringComparison.OrdinalIgnoreCase)
                && string.Equals(r.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase));
            // SES config-set must be attached on send. TRACKED only when Delivery events landed.
            var deliveryTracking = string.IsNullOrWhiteSpace(state.ConfigSet)
                ? "NOT_TRACKED"
                : deliveredExact > 0
                    ? "TRACKED"
                    : deliveredCook > 0
                        ? "PARTIAL" // funnel advanced (e.g. click) without isolated SES Delivery events
                        : "CONFIGURED_AWAITING_EVENTS";
            var deliveryTelemetryAvailable = deliveryTracking is "TRACKED" or "PARTIAL";
            var emailDeliveryStatus = new
            {
                sesAccepted = sesAcceptedCook,
                delivered = deliveredExact,
                deliveryUnknown,
                bounced = cookCampaignRows.Count(r => string.Equals(r.SuppressionStatus, "bounced", StringComparison.OrdinalIgnoreCase)),
                complained = cookCampaignRows.Count(r => string.Equals(r.SuppressionStatus, "complained", StringComparison.OrdinalIgnoreCase)),
                clicked = cookCampaignRows.Count(r => StatusAtLeast(r.OutreachStatus,
                    "clicked", "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer")),
                unsubscribed = cookCampaignRows.Count(r => string.Equals(r.SuppressionStatus, "unsubscribed", StringComparison.OrdinalIgnoreCase)),
                labels = new
                {
                    SES_ACCEPTED = sesAcceptedCook,
                    DELIVERED = deliveredExact,
                    DELIVERY_UNKNOWN = deliveryUnknown,
                    BOUNCED = cookCampaignRows.Count(r => string.Equals(r.SuppressionStatus, "bounced", StringComparison.OrdinalIgnoreCase)),
                    COMPLAINED = cookCampaignRows.Count(r => string.Equals(r.SuppressionStatus, "complained", StringComparison.OrdinalIgnoreCase)),
                    CLICKED = cookCampaignRows.Count(r => StatusAtLeast(r.OutreachStatus,
                        "clicked", "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer")),
                    UNSUBSCRIBED = cookCampaignRows.Count(r => string.Equals(r.SuppressionStatus, "unsubscribed", StringComparison.OrdinalIgnoreCase))
                }
            };
            var sentToday = cookRows.Count(r =>
                r.LastContactedAt is not null
                && CreatorAcquisitionScoring.EasternDate(r.LastContactedAt.Value).Date == todayEt);
            // COOK-001-scoped approved (matches Admin Approvals Ready to Send).
            var approved = cookRows.Count(r => string.Equals(r.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase));
            var skipReasons = new Dictionary<string, int>(StringComparer.Ordinal);
            var sendEligible = 0;
            var approvedEligible = 0;
            var approvedManualEligible = 0;
            var approvedBlockedCooldown = 0;
            var approvedBlockedEmail = 0;
            var approvedBlockedQualification = 0;
            var approvedBlockedSuppression = 0;
            var approvedBlockedOther = 0;
            foreach (var p in cookRows)
            {
                var autoGate = CreatorAcquisitionScoring.ExplainSendEligibility(
                    p, now, state, alreadyContacted: p.LastContactedAt is not null, AcqSendMode.Automated);
                var manualGate = CreatorAcquisitionScoring.ExplainSendEligibility(
                    p, now, state, alreadyContacted: p.LastContactedAt is not null, AcqSendMode.ManualAdmin);
                if (autoGate.Ok)
                {
                    sendEligible++;
                    if (string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
                        || state.StandingCampaignApproval)
                        approvedEligible++;
                }
                if (manualGate.Ok
                    && string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
                    approvedManualEligible++;

                if (autoGate.Ok)
                    continue;

                var code = OutreachPolicy.NormalizeSkipReason(autoGate.Reason);
                skipReasons[code] = skipReasons.GetValueOrDefault(code) + 1;
                if (!string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
                    continue;
                switch (code)
                {
                    case "COOLDOWN":
                    case "ALREADY_CONTACTED":
                        approvedBlockedCooldown++;
                        break;
                    case "INVALID_EMAIL":
                        approvedBlockedEmail++;
                        break;
                    case "NOT_QUALIFIED":
                        approvedBlockedQualification++;
                        break;
                    case "SUPPRESSED":
                        approvedBlockedSuppression++;
                        break;
                    default:
                        approvedBlockedOther++;
                        break;
                }
            }

            object? lastRun = null;
            int? lastRunSesAttempted = null;
            int lastRunSesAccepted = 0;
            int lastRunSesRejected = 0;
            var lastRunExecutionBudget = false;
            var lastRunJson = await acq.Store.GetCohortRunAsync(campaign, cohortRunId, cancellationToken);
            if (!string.IsNullOrWhiteSpace(lastRunJson))
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(lastRunJson);
                    lastRun = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(lastRunJson);
                    if (doc.RootElement.TryGetProperty("sesAttempted", out var sesEl) && sesEl.TryGetInt32(out var sesVal))
                        lastRunSesAttempted = sesVal;
                    else if (doc.RootElement.TryGetProperty("attempted", out var attEl) && attEl.TryGetInt32(out var attVal))
                        lastRunSesAttempted = attVal;
                    if (doc.RootElement.TryGetProperty("sent", out var sentEl) && sentEl.TryGetInt32(out var sentVal))
                        lastRunSesAccepted = sentVal;
                    if (doc.RootElement.TryGetProperty("reasonCounts", out var rcEl) && rcEl.ValueKind == System.Text.Json.JsonValueKind.Object)
                    {
                        if (rcEl.TryGetProperty("SES_REJECTED", out var rej) && rej.TryGetInt32(out var rejVal))
                            lastRunSesRejected = rejVal;
                        if (rcEl.TryGetProperty("EXECUTION_BUDGET", out var bud) && bud.TryGetInt32(out var budVal))
                            lastRunExecutionBudget = budVal > 0;
                    }
                }
                catch
                {
                    lastRun = null;
                }
            }

            var primaryBlocker = skipReasons
                .OrderByDescending(kv => kv.Value)
                .Select(kv => new { code = kv.Key, count = kv.Value })
                .FirstOrDefault();

            var outreachBlocked = state.MarketingSendingEnabled
                && sendEligible == 0
                && sentToday == 0;

            var draftsCook = cookRows.Count(r =>
                !string.IsNullOrWhiteSpace(r.Observation) && !string.IsNullOrWhiteSpace(r.Subject));
            var draftedNotApproved = cookRows.Count(r =>
                !string.IsNullOrWhiteSpace(r.Observation)
                && !string.IsNullOrWhiteSpace(r.Subject)
                && !string.Equals(r.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
                && r.LastContactedAt is null);

            var needsApproval = cookRows.Count(CreatorAcquisitionScoring.IsReadyForApproval);
            var approvedWaiting = approved;
            var blockedCooldown = approvedBlockedCooldown;
            var followUpsDue = cookRows.Count(r => CreatorAcquisitionScoring.IsFollowUpDue(r, now));
            var repliesNeedingAction = cookRows.Count(r =>
                string.Equals(r.OutreachStatus, "replied", StringComparison.OrdinalIgnoreCase)
                || string.Equals(r.OutreachStatus, "interested", StringComparison.OrdinalIgnoreCase));
            var dailyRemaining = Math.Max(0, state.DailyLimit - sentToday);
            var nextScheduledSendEt = CreatorAcquisitionScoring.NextWeekdaySendEastern(now).ToString("o");

            var cutoff7 = now.AddDays(-7);
            var sentLast7Days = cookRows.Count(r =>
                r.LastContactedAt is not null && r.LastContactedAt.Value >= cutoff7);

            bool IsClickedOrBeyond(string? status) =>
                StatusAtLeast(status,
                    "clicked", "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer");
            DateTimeOffset? ClickMoment(AcqProspectRecord r) =>
                r.FirstClickedAt ?? (IsClickedOrBeyond(r.OutreachStatus) ? r.UpdatedAt : null);
            var clickedCook = cookCampaignRows.Count(r => IsClickedOrBeyond(r.OutreachStatus));
            var clickedToday = cookCampaignRows.Count(r =>
            {
                var at = ClickMoment(r);
                return at is not null && CreatorAcquisitionScoring.EasternDate(at.Value).Date == todayEt;
            });
            var clickedLast7Days = cookCampaignRows.Count(r =>
            {
                var at = ClickMoment(r);
                return at is not null && at.Value >= cutoff7;
            });
            var draftLifecycle = AcqProspectLifecycle.TallyDraftLifecycle(cookRows, now, state, rows);
            var discoveryBlockers = cookRows
                .Where(r => !CreatorAcquisitionScoring.IsVerifiedPublicEmail(r))
                .GroupBy(r => CreatorAcquisitionService.ClassifyContactDiscoveryBlocker(r, now))
                .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

            // Not-reviewable breakdown among COOK-001 drafts that are NOT Needs Approval.
            // Exclusive categories — every drafted-but-not-needs-approval row lands in exactly one bucket.
            var nrInvalidEmail = 0;
            var nrNoEmail = 0;
            var nrQualification = 0;
            var nrCooldown = 0;
            var nrSuppressed = 0;
            var nrAlreadyContacted = 0;
            var nrRejected = 0;
            var nrOther = 0;
            foreach (var r in cookRows)
            {
                var hasDraft = !string.IsNullOrWhiteSpace(r.Observation)
                    && !string.IsNullOrWhiteSpace(r.Subject);
                if (!hasDraft) continue;
                if (CreatorAcquisitionScoring.IsReadyForApproval(r)) continue;
                if (string.Equals(r.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
                    continue; // Ready to Send — counted separately

                var outreach = (r.OutreachStatus ?? "").ToLowerInvariant();
                var suppression = (r.SuppressionStatus ?? "none").ToLowerInvariant();
                if (outreach is "rejected")
                {
                    nrRejected++;
                    continue;
                }
                if (suppression is not "none" || outreach is "suppressed" or "bounced" or "complained" or "unsubscribed")
                {
                    nrSuppressed++;
                    continue;
                }
                if (r.LastContactedAt is not null)
                {
                    nrAlreadyContacted++;
                    continue;
                }
                if (OutreachPolicy.InCooldown(r.LastContactedAt, now, state.CooldownDays > 0 ? state.CooldownDays : OutreachPolicy.DefaultCooldownDays)
                    && r.LastContactedAt is not null)
                {
                    nrCooldown++;
                    continue;
                }
                if (string.IsNullOrWhiteSpace(r.PublicBusinessEmail)
                    || !EmailAddressHelpers.LooksLikeEmail(r.PublicBusinessEmail))
                {
                    nrNoEmail++;
                    continue;
                }
                if (!CreatorAcquisitionScoring.IsVerifiedPublicEmail(r)
                    || OutreachPolicy.IsSpamTrapOrInvalid(r.PublicBusinessEmail))
                {
                    nrInvalidEmail++;
                    continue;
                }
                if (outreach is "needs_review"
                    || string.IsNullOrWhiteSpace(r.Body)
                    || !CreatorAcquisitionScoring.HasStrongPersonalization(r)
                    || r.PriorityScore < 70
                    || (r.SubscriberCount is < 1000 or > 100000))
                {
                    nrQualification++;
                    continue;
                }
                nrOther++;
            }

            var notReviewable = new
            {
                invalidEmail = nrInvalidEmail,
                noUsableEmail = nrNoEmail,
                qualificationFailed = nrQualification,
                cooldown = nrCooldown,
                suppressed = nrSuppressed,
                alreadyContacted = nrAlreadyContacted,
                rejected = nrRejected,
                other = nrOther
            };
            var notReviewableTotal = nrInvalidEmail + nrNoEmail + nrQualification + nrCooldown
                + nrSuppressed + nrAlreadyContacted + nrRejected + nrOther;

            var contactVerifiedCook = cookRows.Count(CreatorAcquisitionScoring.IsVerifiedPublicEmail);
            var needsEmailCook = cookRows.Count(r => !CreatorAcquisitionScoring.IsVerifiedPublicEmail(r));
            var sesQuota = await acq.GetProviderQuotaAsync(cancellationToken);
            var readyLane = cookRows.Count(r => CreatorAcquisitionService.SendLaneFor(r, now, state, rows) == "ready_to_send");
            var needsLane = cookRows.Count(r => CreatorAcquisitionService.SendLaneFor(r, now, state, rows) == "needs_approval");
            var discoveryBackoff = cookRows.Count(r =>
                !CreatorAcquisitionScoring.IsVerifiedPublicEmail(r)
                && r.ContactResearchNextAt is not null
                && r.ContactResearchNextAt > now);
            var discoveryEligible = cookRows.Count(r =>
                CreatorAcquisitionService.IsActionableEmailDiscovery(r, now));
            var noPublicEmail = cookRows.Count(r =>
                string.Equals(r.ContactResearchStatus, "not_found", StringComparison.OrdinalIgnoreCase)
                || string.Equals(r.ContactDiscoveryResult, "not_found", StringComparison.OrdinalIgnoreCase)
                || string.Equals(r.ContactDiscoveryResult, "no_website", StringComparison.OrdinalIgnoreCase)
                || string.Equals(r.ContactDiscoveryResult, "form_only", StringComparison.OrdinalIgnoreCase));
            var qualifiedCook = cookRows.Count(r =>
                r.PriorityScore >= 70
                && string.Equals(r.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase));
            var analyzedCook = cookRows.Count(r =>
                r.AnalysisTimestamp is not null
                || !string.IsNullOrWhiteSpace(r.OpportunityEvidenceJson)
                || !string.IsNullOrWhiteSpace(r.AnalyzedVideoTitle));
            var auditsGeneratedCook = cookRows.Count(r => r.AuditGeneratedAt is not null);
            var insufficientFromSkips = skipReasons.GetValueOrDefault("INSUFFICIENT_PERSONALIZATION");
            var insufficientPersonalizationCook = insufficientFromSkips > 0
                ? insufficientFromSkips
                : cookRows.Count(r =>
                    r.LastContactedAt is null
                    && CreatorAcquisitionScoring.IsVerifiedPublicEmail(r)
                    && !string.IsNullOrWhiteSpace(r.Observation)
                    && (!CreatorAcquisitionScoring.HasStrongPersonalization(r)
                        || !CreatorAcquisitionOpportunity.MeetsAutoSendThreshold(r)));
            // Authoritative Ready-to-Send for ALL Admin screens = automation SendLaneFor.
            // Manual cooldown-bypass eligibility stays on pipeline.approvedManualEligibleNow only.
            var approvedReadyToSend = readyLane;
            var autoEligible = readyLane;
            if (state.StandingCampaignApproval)
            {
                sendEligible = readyLane;
                approvedEligible = readyLane;
            }
            string? autoPauseReason = null;
            if (state.ComplaintPause || state.RampBlockReason is "bounce_rate" or "complaint_rate")
                autoPauseReason = "DELIVERABILITY SAFETY PAUSE";
            else if (!state.MarketingSendingEnabled)
                autoPauseReason = "CAMPAIGN DISABLED";
            else if (cfg.DryRun)
                autoPauseReason = "DRY RUN ENABLED";
            else if (dailyRemaining <= 0)
                autoPauseReason = "DAILY LIMIT REACHED";
            else if (sesQuota.Available && sesQuota.Remaining <= 0)
                autoPauseReason = "SES PROVIDER QUOTA REACHED";
            // Empty ready queue with remaining capacity is inventory/discovery — not a pause.
            var automaticSending = string.Equals(cfg.SendingMode, "automatic", StringComparison.OrdinalIgnoreCase)
                && cfg.AutoSend
                && state.MarketingSendingEnabled
                && !cfg.DryRun
                && autoPauseReason is not "CAMPAIGN DISABLED" and not "DELIVERABILITY SAFETY PAUSE" and not "DRY RUN ENABLED";

            var qualifiedUnsentRows = cookRows.Where(r =>
                r.PriorityScore >= 70
                && string.Equals(r.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase)
                && r.LastContactedAt is null
                && CreatorAcquisitionScoring.IsVerifiedPublicEmail(r)).ToList();
            var followUpDueRows = cookRows.Where(r => CreatorAcquisitionScoring.IsFollowUpDue(r, now)).ToList();
            var qualifiedUnsentBlockers = AcqProspectLifecycle.TallyBlockers(qualifiedUnsentRows, now, state, rows);
            var followUpDueBlockers = AcqProspectLifecycle.TallyBlockers(followUpDueRows, now, state, rows);
            var followUpsReadyNow = followUpDueRows.Count(r =>
                CreatorAcquisitionScoring.ExplainSendEligibility(r, now, state, alreadyContacted: true).Ok);
            var draftMissing = qualifiedUnsentBlockers.GetValueOrDefault("DRAFT_MISSING");
            var needsManualReview = cookRows.Count(r =>
                string.Equals(r.ContactResearchStatus, "review_email", StringComparison.OrdinalIgnoreCase)
                || string.Equals(r.ContactDiscoveryResult, "review", StringComparison.OrdinalIgnoreCase));
            var alreadyAttemptedDiscovery = cookRows.Count(r =>
                !CreatorAcquisitionScoring.IsVerifiedPublicEmail(r)
                && (r.ContactResearchLastAt is not null
                    || r.ContactResearchNextAt is not null
                    || (!string.IsNullOrWhiteSpace(r.ContactDiscoveryResult)
                        && !string.Equals(r.ContactDiscoveryResult, "none", StringComparison.OrdinalIgnoreCase))));
            var nextAutomaticAction = BuildNextAutomaticAction(
                automaticSending,
                autoPauseReason,
                dailyRemaining,
                readyLane,
                followUpsReadyNow,
                followUpDueRows.Count,
                followUpDueBlockers,
                discoveryEligible,
                discoveryBackoff,
                qualifiedUnsentRows.Count,
                qualifiedUnsentBlockers,
                draftMissing,
                CreatorAcquisitionService.ReadyInventoryTarget);

            return Results.Ok(new
            {
                verifiedCustomers = converted,
                marketingSendingEnabled = state.MarketingSendingEnabled,
                complaintPause = state.ComplaintPause,
                fromEmailConfigured = EmailAddressHelpers.LooksLikeEmail(state.FromEmail),
                postalAddressConfigured = !string.IsNullOrWhiteSpace(state.PostalAddress),
                campaign,
                sendingMode = cfg.SendingMode,
                dryRun = cfg.DryRun,
                autoSend = cfg.AutoSend,
                autoDiscover = cfg.AutoDiscover,
                autoFindEmails = cfg.AutoFindEmails,
                autoPrepareDrafts = cfg.AutoPrepareDrafts,
                autoFollowUps = cfg.AutoFollowUps,
                automaticSending,
                automaticPauseReason = autoPauseReason,
                sesMax24HourSend = sesQuota.Available ? sesQuota.Max24HourSend : (int?)null,
                sesSentLast24Hours = sesQuota.Available ? sesQuota.SentLast24Hours : (int?)null,
                sesRemaining = sesQuota.Available ? sesQuota.Remaining : (int?)null,
                sesQuotaAvailable = sesQuota.Available,
                dailyLimit = state.DailyLimit,
                cooldownDays = state.CooldownDays,
                rampStage = state.RampStage,
                standingCampaignApproval = state.StandingCampaignApproval,
                allowWeekends = state.AllowWeekends,
                discovered,
                inspected,
                contactVerified,
                drafts,
                draftsGenerated = draftsCook,
                draftsAllCampaigns = drafts,
                approved,
                currentlyApprovedWaitingToSend = approved,
                everApproved,
                sent,
                sentToday,
                sentLast7Days,
                sentLifetime = sent,
                recentlySentWindowDays = 7,
                delivered,
                deliveredExact,
                deliveryUnknown,
                deliveryTracking,
                deliveryTelemetryAvailable,
                sesConfigSet = state.ConfigSet,
                emailDeliveryStatus,
                performanceGates = BuildPerformanceGates(
                    deliveryTracking,
                    deliveredExact,
                    clickedLast7Days,
                    // 7-day CRM cohort: audit starts among COOK-001 rows that clicked in-window
                    // (do not mix lifetime clicks with site-wide GA4 audits).
                    cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && StatusAtLeast(r.OutreachStatus,
                                "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer");
                    }),
                    cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && StatusAtLeast(r.OutreachStatus,
                                "audit_completed", "pricing_viewed", "checkout_started", "customer");
                    }),
                    cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && StatusAtLeast(r.OutreachStatus, "pricing_viewed", "checkout_started", "customer");
                    }),
                    cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && StatusAtLeast(r.OutreachStatus, "checkout_started", "customer");
                    }),
                    cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && string.Equals(r.OutreachStatus, "customer", StringComparison.OrdinalIgnoreCase);
                    }),
                    cohortWindowDays: 7),
                emailAcquisition = new
                {
                    cohortWindowDays = 7,
                    discovered = IntFromLastRun(lastRun, "discovered", "creatorsDiscovered") ?? cookRows.Count,
                    contactAttempts = IntFromLastRun(lastRun, "contactDiscoveryAttempted", "emailsAttempted") ?? 0,
                    publicEmailsFound = IntFromLastRun(lastRun, "emailsFound", "publicEmailsFound") ?? 0,
                    publicEmailsLifetime = contactVerifiedCook,
                    qualified = qualifiedCook,
                    drafted = IntFromLastRun(lastRun, "draftsPrepared") ?? draftsCook,
                    draftedLifetime = draftsCook,
                    eligible = sendEligible,
                    sesAccepted = lastRunSesAccepted > 0 ? lastRunSesAccepted : sentToday,
                    sesAcceptedLifetime = sesAcceptedCook,
                    delivered = deliveredExact,
                    deliveryUnknown,
                    bounced = emailDeliveryStatus.bounced,
                    complaints = emailDeliveryStatus.complained,
                    clicks = clickedLast7Days,
                    clicksLifetime = clickedCook,
                    auditStarts = cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && StatusAtLeast(r.OutreachStatus,
                                "audit_started", "audit_completed", "pricing_viewed", "checkout_started", "customer");
                    }),
                    auditStartsLifetime = auditStarted,
                    auditCompletions = cookCampaignRows.Count(r =>
                    {
                        var at = ClickMoment(r);
                        return at is not null && at.Value >= cutoff7
                            && StatusAtLeast(r.OutreachStatus,
                                "audit_completed", "pricing_viewed", "checkout_started", "customer");
                    }),
                    auditCompletionsLifetime = auditCompleted,
                    signups = pricingViewed,
                    checkoutStarts = checkoutStartedCrm,
                    verifiedCustomers = converted,
                    revenue = 0,
                    prospectBlockers = discoveryBlockers,
                    note = "clicks/auditStarts above are COOK-001 CRM 7-day cohort — not site-wide GA4"
                },
                clicked,
                clickedToday,
                clickedLast7Days,
                clickedLifetime = clickedCook,
                clicks = new
                {
                    today = clickedToday,
                    last7Days = clickedLast7Days,
                    lifetime = clickedCook,
                    uniqueProspectsToday = clickedToday,
                    uniqueProspectsLast7Days = clickedLast7Days,
                    uniqueProspectsLifetime = clickedCook,
                    source = "COOK-001_CRM"
                },
                draftLifecycle,
                discoveryBlockers,
                auditStarted,
                auditCompleted,
                pricingViewed,
                checkoutStarted = checkoutStartedCrm,
                converted,
                bounced,
                complained,
                unsubscribed,
                cohortFunnel = new
                {
                    discovered = cookRows.Count,
                    contactable = contactVerifiedCook,
                    approved,
                    emailsSent = sent,
                    delivered,
                    clicked,
                    auditStarts = auditStarted,
                    auditCompletions = auditCompleted,
                    accountsCreated = pricingViewed,
                    checkoutStarts = checkoutStartedCrm,
                    paid = converted,
                    verifiedCustomers = converted,
                    tracking = "crm_prospect_status"
                },
                northStar = new
                {
                    paidCustomers = converted,
                    revenue = 0,
                    auditsStarted = auditStarted,
                    accountsCreated = pricingViewed
                },
                views,
                prospectsEvaluated = cookRows.Count,
                sendEligible,
                emailsAttemptedToday = lastRunSesAttempted ?? sentToday,
                sesConfigured = EmailAddressHelpers.LooksLikeEmail(state.FromEmail)
                    && !string.IsNullOrWhiteSpace(state.PostalAddress),
                outreachBlocked,
                primaryBlocker,
                skipReasonCounts = skipReasons
                    .OrderByDescending(kv => kv.Value)
                    .ToDictionary(kv => kv.Key, kv => kv.Value),
                // Candidate-wide skip tallies (all COOK-001). Distinct from approved-only blocks below.
                skipReasonCountsAllCandidates = skipReasons
                    .OrderByDescending(kv => kv.Value)
                    .ToDictionary(kv => kv.Key, kv => kv.Value),
                inventory = new
                {
                    totalCreators = cookRows.Count,
                    withPublicEmail = contactVerifiedCook,
                    missingEmail = needsEmailCook,
                    missingPublicEmail = needsEmailCook,
                    discoveryEligible,
                    discoveryDueNow = discoveryEligible,
                    backoff = discoveryBackoff,
                    discoveryBackoff,
                    needsManualReview,
                    noPublicEmail,
                    noEmailFound = noPublicEmail,
                    alreadyAttempted = alreadyAttemptedDiscovery,
                    draftMissing,
                    readyInventoryTarget = CreatorAcquisitionService.ReadyInventoryTarget,
                    qualified = qualifiedCook,
                    analyzed = analyzedCook,
                    auditsGenerated = auditsGeneratedCook,
                    insufficientPersonalization = insufficientPersonalizationCook,
                    autoEligible,
                    manualReview = needsLane,
                    readyToSend = readyLane,
                    sentToday,
                    dailyLimit = state.DailyLimit
                },
                personalizationFunnel = new
                {
                    discovered = cookRows.Count,
                    contactVerified = contactVerifiedCook,
                    analyzed = analyzedCook,
                    qualified = qualifiedCook,
                    insufficientPersonalization = insufficientPersonalizationCook,
                    auditsGenerated = auditsGeneratedCook,
                    readyToSend = readyLane,
                    emailsSent = sent,
                    clicked,
                    auditViews = cookRows.Count(r =>
                        string.Equals(r.OutreachStatus, "clicked", StringComparison.OrdinalIgnoreCase)
                        || StatusAtLeast(r.OutreachStatus, "audit_started")),
                    auditEngaged = auditStarted,
                    signups = pricingViewed,
                    checkoutStarts = checkoutStartedCrm,
                    paid = converted
                },
                topOpportunities = cookRows
                    .Where(r => !string.IsNullOrWhiteSpace(r.PrimaryOpportunity))
                    .GroupBy(r => r.PrimaryOpportunity!, StringComparer.OrdinalIgnoreCase)
                    .OrderByDescending(g => g.Count())
                    .Take(8)
                    .Select(g => new { type = g.Key, count = g.Count() })
                    .ToArray(),
                pipeline = new
                {
                    drafted = draftsCook,
                    draftedNotApproved,
                    approved,
                    needsApproval = needsLane,
                    readyToSend = readyLane,
                    recentlySent = sentLast7Days,
                    eligibleNow = sendEligible,
                    approvedEligibleNow = approvedEligible,
                    approvedManualEligibleNow = approvedManualEligible,
                    blockedByCooldown = approvedBlockedCooldown,
                    blockedByEmailValidation = approvedBlockedEmail,
                    blockedByQualification = approvedBlockedQualification,
                    blockedBySuppression = approvedBlockedSuppression,
                    blockedByOther = approvedBlockedOther,
                    dailyLimit = state.DailyLimit,
                    dailyRemaining,
                    expectedToAttempt = Math.Min(readyLane, dailyRemaining),
                    notReviewable,
                    notReviewableTotal,
                    appBlockedBeforeSes = skipReasons
                        .Where(kv => !kv.Key.StartsWith("SES_", StringComparison.Ordinal))
                        .Sum(kv => kv.Value),
                    sesAttempted = lastRunSesAttempted ?? 0,
                    sesAccepted = lastRunSesAccepted,
                    sesRejected = lastRunSesRejected,
                    executionBudgetHit = lastRunExecutionBudget
                },
                crmBoard = new
                {
                    totalProspects = cookRows.Count,
                    draftsGenerated = draftsCook,
                    needsApproval = needsLane,
                    readyToSend = readyLane,
                    recentlySent = sentLast7Days,
                    recentlySentWindowDays = 7,
                    sentToday,
                    sentLifetime = sent,
                    usableEmails = contactVerifiedCook,
                    needsEmail = needsEmailCook,
                    discoveryEligible,
                    backoff = discoveryBackoff,
                    noPublicEmail,
                    qualified = qualifiedCook,
                    autoEligible,
                    notReviewable,
                    notReviewableTotal,
                    approvalsUrl = "https://youtubeboosterai.com/admin/acquisition/approvals"
                },
                needsApproval = needsLane,
                approvedReadyToSend = readyLane,
                approvedWaiting,
                blockedCooldown,
                followUpsDue,
                repliesNeedingAction,
                dailyRemaining,
                nextScheduledSendEt,
                lastRun,
                lastRunSesAccepted,
                lastRunExecutionBudget,
                cohortRunId,
                scope = new
                {
                    allAcquisitionProspects = rows.Count,
                    cook001CookingAndFood = cookRows.Count,
                    cook001Label = "COOK-001 / Cooking & Food",
                    allLabel = "All acquisition prospects"
                },
                acquisitionStatus = new
                {
                    campaign = "COOK-001",
                    dailyLimit = state.DailyLimit,
                    sentToday,
                    remaining = dailyRemaining,
                    sesRemaining = sesQuota.Available ? sesQuota.Remaining : (int?)null,
                    discovered = cookRows.Count,
                    publicEmails = contactVerifiedCook,
                    qualifiedUnsent = qualifiedUnsentRows.Count,
                    qualifiedUnsentBlockers,
                    readyNow = readyLane,
                    missingEmailEligible = discoveryEligible,
                    discoveryDueNow = discoveryEligible,
                    discoveryBackoff,
                    draftMissing,
                    readyInventoryTarget = CreatorAcquisitionService.ReadyInventoryTarget,
                    followUpsDue = followUpDueRows.Count,
                    followUpsReadyNow,
                    followUpDueBlockers,
                    nextScheduledRunEt = nextScheduledSendEt,
                    needsApproval = needsLane,
                    automaticSending,
                    nextAutomaticAction,
                    bottleneck = ComputeAcquisitionBottleneck(
                        automaticSending,
                        autoPauseReason,
                        dailyRemaining,
                        sesQuota.Available ? sesQuota.Remaining : null,
                        readyLane,
                        discoveryEligible,
                        discoveryBackoff,
                        cookRows.Count,
                        contactVerifiedCook,
                        followUpDueRows.Count,
                        followUpsReadyNow,
                        followUpDueBlockers,
                        qualifiedUnsentRows.Count,
                        qualifiedUnsentBlockers,
                        draftMissing,
                        CreatorAcquisitionService.ReadyInventoryTarget)
                },
                taxonomy = AcquisitionTaxonomy.Catalog(),
                segments = new
                {
                    byCategory = rows
                        .GroupBy(r => AcquisitionTaxonomy.NormalizeCategory(r.PrimaryNiche))
                        .ToDictionary(g => g.Key, g => g.Count()),
                    byLanguage = rows
                        .GroupBy(r => AcquisitionTaxonomy.NormalizeLanguage(r.Language))
                        .ToDictionary(g => g.Key, g => g.Count()),
                    byMarket = rows
                        .GroupBy(r => string.IsNullOrWhiteSpace(AcquisitionTaxonomy.NormalizeMarket(r.Market ?? r.Country))
                            ? "unspecified"
                            : AcquisitionTaxonomy.NormalizeMarket(r.Market ?? r.Country))
                        .ToDictionary(g => g.Key, g => g.Count()),
                    byTier = rows
                        .GroupBy(r => AcquisitionTaxonomy.DeriveTier(r.SubscriberCount, r.Strategic))
                        .ToDictionary(g => g.Key, g => g.Count()),
                    byFormat = rows
                        .GroupBy(r => string.IsNullOrWhiteSpace(r.ContentFormat) ? "unknown" : r.ContentFormat)
                        .ToDictionary(g => g.Key, g => g.Count()),
                    sentByCategory = rows.Where(r => r.LastContactedAt is not null)
                        .GroupBy(r => AcquisitionTaxonomy.NormalizeCategory(r.PrimaryNiche))
                        .ToDictionary(g => g.Key, g => g.Count()),
                    clickedByLanguage = rows.Where(r => CreatorAcquisitionScoring.MapView(r) is "clicked" or "audit_started" or "audit_completed" or "customer")
                        .GroupBy(r => AcquisitionTaxonomy.NormalizeLanguage(r.Language))
                        .ToDictionary(g => g.Key, g => g.Count()),
                    strategic = rows.Count(r => r.Strategic)
                }
            });
        });

        admin.MapGet("/prospects", async (
            string? view,
            string? niche,
            string? campaign,
            string? language,
            string? market,
            string? tier,
            string? format,
            bool? strategic,
            string? q,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var rows = await acq.Store.ListProspectsAsync(cancellationToken);
            var campaignKey = string.IsNullOrWhiteSpace(campaign) ? CreatorAcquisitionCampaigns.Cook001 : campaign.Trim();
            var state = await acq.LoadStateAsync(campaignKey, cancellationToken);
            var site = acq.TrackedSite();
            IEnumerable<AcqProspectRecord> query = rows;
            if (!string.IsNullOrWhiteSpace(campaign))
                query = query.Where(r => string.Equals(r.Campaign, campaign, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(niche))
                query = query.Where(r => string.Equals(r.PrimaryNiche, niche, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(language))
                query = query.Where(r => string.Equals(r.Language, language, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(market))
                query = query.Where(r =>
                    string.Equals(AcquisitionTaxonomy.NormalizeMarket(r.Market ?? r.Country), AcquisitionTaxonomy.NormalizeMarket(market), StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(tier))
                query = query.Where(r =>
                    string.Equals(AcquisitionTaxonomy.DeriveTier(r.SubscriberCount, r.Strategic), tier, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(r.CreatorTier, tier, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(format))
                query = query.Where(r => string.Equals(r.ContentFormat ?? "unknown", format, StringComparison.OrdinalIgnoreCase));
            if (strategic == true)
                query = query.Where(r => r.Strategic);
            else if (strategic == false)
                query = query.Where(r => !r.Strategic);
            var viewKey = string.Equals(view, "approval_queue", StringComparison.OrdinalIgnoreCase) ? "draft_ready" : view;
            if (!string.IsNullOrWhiteSpace(viewKey) && viewKey != "all")
                query = query.Where(r => CreatorAcquisitionScoring.MapView(r) == viewKey);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var needle = q.Trim();
                query = query.Where(r =>
                    (r.ChannelName?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (r.Handle?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (r.PublicBusinessEmail?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (r.ProspectId?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false)
                    || (r.ChannelUrl?.Contains(needle, StringComparison.OrdinalIgnoreCase) ?? false));
            }
            var now = DateTimeOffset.UtcNow;
            var items = query.Select(r => ToAdminDto(r, state, site, now, rows)).ToArray();
            return Results.Ok(new { items, totalCount = items.Length });
        });

        admin.MapGet("/prospects/{id}", async (string id, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var row = await acq.Store.GetProspectAsync(id, cancellationToken);
            if (row is null) return Results.NotFound();
            var state = await acq.LoadStateAsync(row.Campaign, cancellationToken);
            var all = await acq.Store.ListProspectsAsync(cancellationToken);
            return Results.Ok(ToAdminDto(row, state, acq.TrackedSite(), DateTimeOffset.UtcNow, all));
        });

        admin.MapPost("/inspect", async (AcqUpsertProspectRequest request, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.ChannelInput))
                return Results.BadRequest(new { error = "channelInput required" });
            var row = await acq.InspectAndUpsertAsync(request, cancellationToken);
            var state = await acq.LoadStateAsync(row.Campaign, cancellationToken);
            var all = await acq.Store.ListProspectsAsync(cancellationToken);
            return Results.Ok(ToAdminDto(row, state, acq.TrackedSite(), DateTimeOffset.UtcNow, all));
        });

        admin.MapPost("/migrate-rescore", async (
            int? limit,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var result = await acq.MigrateRescoreAsync(limit ?? 15, cancellationToken);
            return Results.Ok(result);
        });

        admin.MapPost("/migrate-brand-copy", async (
            bool? includeAlreadyContacted,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var result = await acq.MigrateBrandCopyAsync(cancellationToken, includeAlreadyContacted == true);
            return Results.Ok(result);
        });

        admin.MapPost("/prospects/{id}/draft", async (string id, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var result = await acq.PrepareDraftAsync(id, cancellationToken);
            if (result.Prospect is null) return Results.NotFound(new { error = result.Reason ?? "not_found" });
            var all = await acq.Store.ListProspectsAsync(cancellationToken);
            var dto = ToAdminDto(
                result.Prospect,
                await acq.LoadStateAsync(result.Prospect.Campaign, cancellationToken),
                acq.TrackedSite(),
                DateTimeOffset.UtcNow,
                all);
            return Results.Ok(new
            {
                prospect = dto,
                draftPrepared = result.DraftPrepared,
                reason = result.Reason,
                // Keep flat shape for older clients that expect the admin prospect DTO at the root.
                @public = dto.Public,
                publicBusinessEmail = dto.PublicBusinessEmail,
                body = dto.Body,
                lastContactedAt = dto.LastContactedAt,
                approvedBy = dto.ApprovedBy,
                approvedAt = dto.ApprovedAt,
                cooldownOverrideUntil = dto.CooldownOverrideUntil,
                adminAttestedContact = dto.AdminAttestedContact,
                fromDisplay = dto.FromDisplay,
                htmlPreview = dto.HtmlPreview,
                textPreview = dto.TextPreview,
                ctaDestination = dto.CtaDestination,
                findingSource = dto.FindingSource
            });
        });

        admin.MapPost("/drafts/prepare-batch", async (
            AcqDraftPrepareBatchRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var result = await acq.PrepareDraftBatchAsync(body ?? new AcqDraftPrepareBatchRequest(), cancellationToken);
            return Results.Ok(result);
        });

        admin.MapPost("/preview", async (AcqApproveBatchRequest request, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var state = await acq.LoadStateAsync(request.Campaign, cancellationToken);
            var site = acq.TrackedSite();
            var items = new List<object>();
            foreach (var id in request.ProspectIds.Take(CreatorAcquisitionService.MaxBatchApprove))
            {
                var p = await acq.Store.GetProspectAsync(id, cancellationToken);
                if (p is null) continue;
                var preview = BuildExactPreview(p, state, site);
                items.Add(new
                {
                    p.ProspectId,
                    p.ChannelName,
                    subscriberCount = p.SubscriberCount,
                    p.RecentUploadAt,
                    publicBusinessEmail = p.PublicBusinessEmail,
                    p.ContactSourceUrl,
                    p.Observation,
                    suggestedImprovement = p.SuggestedImprovement,
                    primaryFinding = p.Observation,
                    findingType = p.FindingType,
                    findingSource = CreatorAcquisitionScoring.FindingSourceSummary(p),
                    exampleVideoTitle = p.ExampleVideoTitle,
                    from = preview.From,
                    to = preview.To,
                    subject = preview.Subject,
                    htmlPreview = preview.Html,
                    textPreview = preview.Text,
                    ctaDestination = preview.CtaDestination,
                    ctaLabel = CreatorAcquisitionCopy.CtaLabel,
                    templateVersion = p.TemplateVersion,
                    subjectVariant = p.SubjectVariant,
                    messageVariant = p.MessageVariant,
                    trackedUrl = preview.CtaDestination,
                    suppression = p.SuppressionStatus,
                    wouldSend = false,
                    note = "Preview never sends."
                });
            }
            return Results.Ok(new { preview = true, sent = false, marketingSendingEnabled = state.MarketingSendingEnabled, items });
        });

        admin.MapPost("/campaign-flags", async (
            [FromBody] AcqCampaignFlagsRequest request,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var campaign = string.IsNullOrWhiteSpace(request.Campaign) ? CreatorAcquisitionCampaigns.Cook001 : request.Campaign.Trim();
            var existing = await acq.Store.GetCampaignFlagsAsync(campaign, cancellationToken);
            var sending = request.SendingEnabled ?? existing.SendingEnabled;
            var pause = request.ComplaintPause ?? existing.ComplaintPause;
            await acq.Store.SaveCampaignFlagsAsync(campaign, sending, pause, cancellationToken);
            var state = await acq.LoadStateAsync(campaign, cancellationToken);
            return Results.Ok(new
            {
                campaign,
                campaignFlagSendingEnabled = sending,
                complaintPause = pause,
                marketingSendingEnabled = state.MarketingSendingEnabled
            });
        });

        admin.MapPost("/approvals", async (HttpContext http, AcqApproveBatchRequest request, ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var adminUser = (AdminSessionRecord)http.Items["authenticatedAdmin"]!;
            var (approval, error) = await acq.ApproveBatchAsync(request, adminUser.Email, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(approval);
        });

        admin.MapPost("/prospects/{id}/reject", async (
            string id,
            HttpContext http,
            AcqAdminActionRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.RejectAsync(id, admin, body?.Reason, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/prospects/{id}/unapprove", async (
            string id,
            HttpContext http,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.UnapproveAsync(id, admin, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/prospects/{id}/override-cooldown", async (
            string id,
            HttpContext http,
            AcqAdminActionRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.OverrideCooldownAsync(id, admin, body?.Reason, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/prospects/{id}/draft-edit", async (
            string id,
            HttpContext http,
            AcqDraftEditRequest body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.UpdateDraftAsync(id, body.Subject, body.Body, admin, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/prospects/{id}/manual-contact", async (
            string id,
            HttpContext http,
            AcqManualContactRequest body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.SetManualContactAsync(
                id, body.Email, body.SourceUrl, body.Attested, admin, body.ContactName, body.Notes, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/prospects/{id}/status", async (
            string id,
            HttpContext http,
            AcqStatusChangeRequest body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.SetStatusAsync(id, body.Status, admin, body.Reason, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/prospects/{id}/send-now", async (
            string id,
            HttpContext http,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (ok, error, messageId) = await acq.SendNowAsync(id, admin, cancellationToken);
            if (!ok) return Results.BadRequest(new { error });
            var row = await acq.Store.GetProspectAsync(id, cancellationToken);
            return Results.Ok(new
            {
                ok = true,
                messageId,
                prospect = row is null ? null : await ToAdminDtoAsync(row, acq, cancellationToken)
            });
        });

        admin.MapPost("/prospects/{id}/approve-and-send", async (
            string id,
            HttpContext http,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var result = await acq.ApproveAndSendAsync(id, admin, cancellationToken);
            if (!result.Ok)
                return Results.BadRequest(new
                {
                    error = result.Error,
                    approved = result.Approved,
                    sent = result.Sent
                });
            return Results.Ok(new
            {
                ok = result.Ok,
                approved = result.Approved,
                sent = result.Sent,
                messageId = result.MessageId,
                prospect = result.Prospect is null ? null : await ToAdminDtoAsync(result.Prospect, acq, cancellationToken)
            });
        });

        admin.MapPost("/send-approved", async (
            HttpContext http,
            AcqSendApprovedRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var campaign = string.IsNullOrWhiteSpace(body?.Campaign)
                ? CreatorAcquisitionCampaigns.Cook001
                : body!.Campaign!.Trim();
            var result = await acq.SendApprovedBatchAsync(campaign, body?.ProspectIds, admin, cancellationToken);
            return Results.Ok(result);
        });

        admin.MapPost("/creator-discovery/start", async (
            HttpContext http,
            AcqCreatorDiscoveryStartRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var job = await acq.StartCreatorDiscoveryAsync(body ?? new AcqCreatorDiscoveryStartRequest(), admin, cancellationToken);
            return Results.Ok(job);
        });

        admin.MapGet("/creator-discovery/{jobId}", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var job = await acq.GetCreatorDiscoveryJobAsync(jobId, cancellationToken);
            return job is null ? Results.NotFound(new { error = "job_not_found" }) : Results.Ok(job);
        });

        admin.MapPost("/creator-discovery/{jobId}/tick", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var job = await acq.TickCreatorDiscoveryAsync(jobId, cancellationToken);
            return Results.Ok(job);
        });

        admin.MapPost("/creator-discovery/{jobId}/resume", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var job = await acq.ResumeCreatorDiscoveryAsync(jobId, cancellationToken);
            return Results.Ok(job);
        });

        admin.MapGet("/campaigns", async (ICreatorAcquisitionService acq, CancellationToken cancellationToken) =>
        {
            var cards = await acq.ListCampaignCardsAsync(cancellationToken);
            return Results.Ok(new { items = cards });
        });

        admin.MapPatch("/campaigns/{id}", async (
            string id,
            AcqCampaignSettingsRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > 32)
                return Results.BadRequest(new { error = "invalid_campaign" });
            try
            {
                var row = await acq.UpdateCampaignSettingsAsync(id, body ?? new AcqCampaignSettingsRequest(), cancellationToken);
                return Results.Ok(row);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        admin.MapPost("/campaigns", async (
            AcqCampaignConfigRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var row = await acq.UpsertCampaignConfigAsync(body ?? new AcqCampaignConfigRequest(), cancellationToken);
                return Results.Ok(row);
            }
            catch (InvalidOperationException ex) when (ex.Message == "cook_001_is_not_replaceable")
            {
                return Results.BadRequest(new { error = "COOK-001 cannot be replaced. Use Pause sending on the existing campaign." });
            }
        });

        admin.MapPost("/email-discovery/start", async (
            HttpContext http,
            AcqEmailDiscoveryStartRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var job = await acq.StartEmailDiscoveryAsync(body ?? new AcqEmailDiscoveryStartRequest(), admin, cancellationToken);
            return Results.Ok(job);
        });

        admin.MapGet("/email-discovery/{jobId}", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var job = await acq.GetEmailDiscoveryJobAsync(jobId, cancellationToken);
            return job is null ? Results.NotFound(new { error = "job_not_found" }) : Results.Ok(job);
        });

        admin.MapPost("/email-discovery/{jobId}/tick", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var job = await acq.TickEmailDiscoveryAsync(jobId, batchSize: 5, cancellationToken);
            return Results.Ok(job);
        });

        admin.MapPost("/prospects/{id}/email-discovery/accept", async (
            string id,
            HttpContext http,
            AcqEmailDiscoveryAcceptRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var admin = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            var (row, error) = await acq.AcceptDiscoveredEmailAsync(id, body?.Accept != false, admin, body?.Reason, cancellationToken);
            if (error is not null) return Results.BadRequest(new { error });
            return Results.Ok(await ToAdminDtoAsync(row!, acq, cancellationToken));
        });

        admin.MapPost("/run-send", async (
            HttpContext http,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var campaign = http.Request.Query["campaign"].ToString();
            if (string.IsNullOrWhiteSpace(campaign)) campaign = CreatorAcquisitionCampaigns.Cook001;
            var dry = string.Equals(http.Request.Query["dryRun"].ToString(), "true", StringComparison.OrdinalIgnoreCase);
            var result = await acq.RunWeekdaySendAsync(campaign, cancellationToken, dry ? true : null);
            return Results.Ok(result);
        });

        admin.MapPost("/preview-send", async (
            AcqSendPreviewRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var result = await acq.PreviewSendAsync(body ?? new AcqSendPreviewRequest(), cancellationToken);
            return Results.Ok(result);
        });

        admin.MapPost("/bulk-send/start", async (
            HttpContext http,
            AcqBulkSendStartRequest? body,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var adminEmail = ((AdminSessionRecord)http.Items["authenticatedAdmin"]!).Email;
            try
            {
                var job = await acq.StartBulkSendAsync(body ?? new AcqBulkSendStartRequest(), adminEmail, cancellationToken);
                return Results.Ok(job);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        });

        admin.MapGet("/bulk-send/{jobId}", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            var job = await acq.GetBulkSendJobAsync(jobId, cancellationToken);
            return job is null ? Results.NotFound(new { error = "job_not_found" }) : Results.Ok(job);
        });

        admin.MapPost("/bulk-send/{jobId}/tick", async (
            string jobId,
            ICreatorAcquisitionService acq,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var job = await acq.TickBulkSendAsync(jobId, cancellationToken);
                return Results.Ok(job);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
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

    private static IResult UnsubscribeResponse(HttpContext http, bool ok, bool already, string message)
    {
        var accept = http.Request.Headers.Accept.ToString();
        var wantsHtml = accept.Contains("text/html", StringComparison.OrdinalIgnoreCase)
                        || !accept.Contains("application/json", StringComparison.OrdinalIgnoreCase);
        if (!wantsHtml)
            return ok
                ? Results.Ok(new { ok = true, unsubscribed = true, already, message })
                : Results.BadRequest(new { ok = false, error = message });

        var title = ok
            ? (already ? "You're already unsubscribed." : "You have been unsubscribed.")
            : "Unsubscribe";
        var body = ok
            ? (already
                ? "You're already unsubscribed."
                : "You have been unsubscribed.\n\nYou will no longer receive marketing emails from YouTubeBoosterAI.")
            : message;
        var html = $"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>{System.Net.WebUtility.HtmlEncode(title)}</title>
            </head>
            <body style="margin:0;padding:48px 20px;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#111827;">
              <main style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:32px 24px;">
                <h1 style="margin:0 0 12px;font-size:22px;">{System.Net.WebUtility.HtmlEncode(title)}</h1>
                <p style="margin:0;line-height:1.55;color:#374151;">{System.Net.WebUtility.HtmlEncode(body).Replace("\n", "<br/>")}</p>
              </main>
            </body>
            </html>
            """;
        return Results.Content(html, "text/html; charset=utf-8");
    }

    private static async Task<AcqAdminProspectDto> ToAdminDtoAsync(
        AcqProspectRecord row,
        ICreatorAcquisitionService acq,
        CancellationToken cancellationToken)
    {
        var state = await acq.LoadStateAsync(row.Campaign, cancellationToken);
        var all = await acq.Store.ListProspectsAsync(cancellationToken);
        return ToAdminDto(row, state, acq.TrackedSite(), DateTimeOffset.UtcNow, all);
    }

    private static AcqAdminProspectDto ToAdminDto(
        AcqProspectRecord row,
        AcqCampaignState state,
        string site,
        DateTimeOffset? nowUtc = null,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        var now = nowUtc ?? DateTimeOffset.UtcNow;
        var preview = BuildExactPreview(row, state, site);
        var why = CreatorAcquisitionService.WhyNotSentCode(row, now, state, all);
        return new AcqAdminProspectDto(
            CreatorAcquisitionScoring.Sanitize(row),
            row.PublicBusinessEmail,
            row.Body,
            row.LastContactedAt,
            row.ApprovedBy,
            row.ApprovedAt,
            row.CooldownOverrideUntil,
            row.AdminAttestedContact,
            preview.From,
            preview.Html,
            preview.Text,
            preview.CtaDestination,
            CreatorAcquisitionScoring.FindingSourceSummary(row),
            why,
            why == "READY_TO_SEND" ? "Ready to send" : AcqSendGuard.HumanSkipReason(why),
            CreatorAcquisitionService.SendLaneFor(row, now, state, all),
            string.IsNullOrWhiteSpace(row.OpaqueToken)
                ? null
                : $"https://youtubeboosterai.com/audit/{Uri.EscapeDataString(row.OpaqueToken)}");
    }

    private static (string From, string To, string Subject, string Html, string Text, string CtaDestination) BuildExactPreview(
        AcqProspectRecord row,
        AcqCampaignState state,
        string site)
    {
        var tracked = string.IsNullOrWhiteSpace(row.TrackedPath)
            ? ""
            : (row.TrackedPath!.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? row.TrackedPath
                : site.TrimEnd('/') + (row.TrackedPath.StartsWith('/') ? row.TrackedPath : "/" + row.TrackedPath));
        var unsub = site.TrimEnd('/') + "/api/public/acq/unsubscribe?token=PREVIEW";
        var fromName = CreatorAcquisitionMail.ResolveFromName(state.FromName);
        var fromEmail = string.IsNullOrWhiteSpace(state.FromEmail) ? "contact@youtubeboosterai.com" : state.FromEmail.Trim();
        var from = $"{fromName} <{fromEmail}>";
        var to = row.PublicBusinessEmail ?? "";

        if (string.IsNullOrWhiteSpace(row.Subject) || string.IsNullOrWhiteSpace(row.Body) || string.IsNullOrWhiteSpace(tracked))
        {
            return (from, to, row.Subject ?? "", "", row.Body ?? "", tracked);
        }

        try
        {
            var mime = CreatorAcquisitionMail.Build(row, state with
            {
                FromEmail = fromEmail,
                FromName = fromName,
                PostalAddress = state.PostalAddress ?? "{{configured_business_postal_address}}"
            }, site, unsub, tracked);
            return (mime.FromHeader, mime.To, mime.Subject, mime.HtmlBody, mime.TextBody, tracked);
        }
        catch
        {
            var body = CreatorAcquisitionCopy.StripComplianceFooter(row.Body!);
            var html = CreatorAcquisitionMail.BuildHtmlFromText(
                body, tracked, row.ChannelName, unsub, state.PostalAddress ?? "", row.Subject!);
            var text = CreatorAcquisitionCopy.WithComplianceFooter(
                CreatorAcquisitionMail.NormalizeBodyForSend(body, tracked),
                row.ChannelName, unsub, state.PostalAddress ?? "");
            return (from, to, row.Subject!, html, text, tracked);
        }
    }

    private static int? IntFromLastRun(object? lastRun, params string[] keys)
    {
        if (lastRun is not System.Text.Json.JsonElement el || el.ValueKind != System.Text.Json.JsonValueKind.Object)
            return null;
        foreach (var key in keys)
        {
            if (el.TryGetProperty(key, out var prop) && prop.TryGetInt32(out var n))
                return n;
        }
        return null;
    }

    /// <summary>
    /// COOK-001 CRM cohort gates. Uses exact SES Delivery counts only — never SES accepted,
    /// lifetime clicks mixed with 7d audits, or site-wide GA4.
    /// </summary>
    private static object BuildPerformanceGates(
        string deliveryTracking,
        int deliveredExact,
        int clicked,
        int auditStarts,
        int auditCompletions,
        int signups,
        int checkoutStarts,
        int paid,
        int cohortWindowDays = 7)
    {
        var flags = new List<string>();
        // Exact Delivery coverage required for delivery→click. PARTIAL/proxy must not invent rates.
        var exactDeliveryAvailable = deliveryTracking is "TRACKED" && deliveredExact > 0;
        var ratesCalculable = exactDeliveryAvailable;
        if (ratesCalculable && deliveredExact >= 30)
        {
            var clickRate = clicked / (double)deliveredExact;
            if (clickRate < 0.02)
                flags.Add("SUBJECT_OR_OFFER_REVIEW");
        }
        if (clicked > 0 && auditStarts <= 0)
            flags.Add("LANDING_OR_CTA_REVIEW");
        if (auditStarts > 0 && auditCompletions <= 0)
            flags.Add("AUDIT_COMPLETION_REVIEW");
        if (auditCompletions > 0 && paid <= 0)
            flags.Add("VALUE_OR_MONETIZATION_REVIEW");

        string? firstBroken = null;
        if (!exactDeliveryAvailable)
            firstBroken = deliveryTracking is "NOT_TRACKED" or "CONFIGURED_AWAITING_EVENTS" or "PARTIAL"
                ? "DELIVERY_MEASUREMENT"
                : "DELIVERED_TO_CLICKED";
        else if (clicked <= 0)
            // Zero clicks in cohort — never blame CLICKED_TO_AUDIT_STARTED.
            firstBroken = deliveredExact >= 30
                ? "DELIVERED_TO_CLICKED"
                : "COLLECTING_CLICKS";
        else if (auditStarts <= 0)
            firstBroken = "CLICKED_TO_AUDIT_STARTED";
        else if (auditCompletions <= 0)
            firstBroken = "AUDIT_STARTED_TO_COMPLETED";
        else if (paid <= 0)
            firstBroken = "AUDIT_COMPLETED_TO_PAID";

        if (firstBroken is "COLLECTING_CLICKS")
            firstBroken = null; // still collecting — not a broken stage

        return new
        {
            technicalAutomation = "HEALTHY",
            acquisitionPerformance = paid > 0
                ? "CONVERTING"
                : flags.Count > 0 || firstBroken is not null
                    ? "UNDERPERFORMING"
                    : "COLLECTING",
            flags,
            firstBrokenStage = firstBroken,
            cohortWindowDays,
            metricSource = "COOK-001_CRM",
            siteWideGa4Excluded = true,
            rates = new
            {
                deliveredToClicked = ratesCalculable
                    ? OutreachPolicy.RateOrNa(clicked, deliveredExact)
                    : "N/A — exact delivery coverage unavailable",
                clickedToAuditStarted = clicked > 0
                    ? OutreachPolicy.RateOrNa(auditStarts, clicked)
                    : "N/A — zero COOK-001 CRM clicks in cohort",
                auditStartedToCompleted = OutreachPolicy.RateOrNa(auditCompletions, auditStarts),
                auditCompletedToSignup = OutreachPolicy.RateOrNa(signups, auditCompletions),
                signupToCheckout = OutreachPolicy.RateOrNa(checkoutStarts, signups),
                checkoutToPaid = OutreachPolicy.RateOrNa(paid, checkoutStarts),
                deliveredToPaid = ratesCalculable
                    ? OutreachPolicy.RateOrNa(paid, deliveredExact)
                    : "N/A — exact delivery coverage unavailable",
                revenuePer100Delivered = ratesCalculable
                    ? OutreachPolicy.RevenuePer100(0, deliveredExact)
                    : "N/A — exact delivery coverage unavailable"
            }
        };
    }

    private static string FormatBlockerSummary(Dictionary<string, int> blockers)
    {
        if (blockers.Count == 0) return "none";
        return string.Join(", ", blockers.OrderByDescending(kv => kv.Value).Select(kv => $"{kv.Value} {kv.Key}"));
    }

    private static string BuildNextAutomaticAction(
        bool automaticSending,
        string? autoPauseReason,
        int dailyRemaining,
        int readyNow,
        int followUpsReadyNow,
        int followUpsDue,
        Dictionary<string, int> followUpBlockers,
        int missingEmailEligible,
        int discoveryBackoff,
        int qualifiedUnsent,
        Dictionary<string, int> qualifiedUnsentBlockers,
        int draftMissing,
        int readyInventoryTarget)
    {
        if (!string.IsNullOrWhiteSpace(autoPauseReason))
            return $"Paused — {autoPauseReason}. Owner action may be required.";
        if (!automaticSending)
            return "Automatic sending is off. Owner must enable automatic COOK-001 or approve manual sends.";
        if (dailyRemaining <= 0)
            return "Daily limit reached. Next sends resume tomorrow (Eastern).";

        var parts = new List<string>();
        if (missingEmailEligible > 0)
            parts.Add($"attempt public email discovery for {missingEmailEligible} due creator(s)");
        if (draftMissing > 0)
            parts.Add($"prepare {draftMissing} missing draft(s)");
        if (readyNow < readyInventoryTarget && dailyRemaining > 0)
            parts.Add("discover/qualify fresh cooking creators while inventory is below target");
        if (readyNow > 0 || followUpsReadyNow > 0)
            parts.Add($"send up to {Math.Min(dailyRemaining, readyNow + followUpsReadyNow)} eligible message(s) (capacity {dailyRemaining})");
        else if (parts.Count == 0 && discoveryBackoff > 0)
            parts.Add($"{discoveryBackoff} creator(s) remain in email-discovery backoff; continue fresh creator discovery on the next daytime run");
        else if (parts.Count == 0 && followUpsDue > 0)
            return $"{followUpsDue} follow-up(s) appear due but none are sendable: {FormatBlockerSummary(followUpBlockers)}.";
        else if (parts.Count == 0 && qualifiedUnsent > 0)
            return $"{qualifiedUnsent} qualified unsent prospect(s) are blocked: {FormatBlockerSummary(qualifiedUnsentBlockers)}. Next run will re-prepare drafts where personalization is missing.";
        else if (parts.Count == 0)
            return "No sendable inventory — next daytime run continues discovery/qualification only.";

        return "Next run will " + string.Join(", then ", parts) + ".";
    }

    private static string ComputeAcquisitionBottleneck(
        bool automaticSending,
        string? autoPauseReason,
        int dailyRemaining,
        int? sesRemaining,
        int readyNow,
        int missingEmailEligible,
        int discoveryBackoff,
        int totalCreators,
        int publicEmails,
        int followUpsDue,
        int followUpsReadyNow = 0,
        Dictionary<string, int>? followUpBlockers = null,
        int qualifiedUnsent = 0,
        Dictionary<string, int>? qualifiedUnsentBlockers = null,
        int draftMissing = 0,
        int readyInventoryTarget = 15)
    {
        if (!string.IsNullOrWhiteSpace(autoPauseReason))
            return $"PAUSED — {autoPauseReason}";
        if (!automaticSending)
            return "MANUAL MODE — automatic sending is off";
        if (dailyRemaining <= 0)
            return "DAILY LIMIT REACHED";
        if (sesRemaining is <= 0)
            return "SES PROVIDER QUOTA REACHED";
        if (draftMissing > 0 && readyNow < readyInventoryTarget)
            return $"DRAFT_GENERATION — {draftMissing} qualified prospect(s) need drafts; ready {readyNow}/{readyInventoryTarget}";
        if (readyNow + followUpsReadyNow > 0
            && readyNow < readyInventoryTarget
            && dailyRemaining > readyNow)
            return $"READY_INVENTORY_LOW — {readyNow} ready now, {followUpsReadyNow} follow-ups ready, {dailyRemaining} capacity remaining (target {readyInventoryTarget})";
        if (readyNow > 0 || followUpsReadyNow > 0)
            return $"NONE — {readyNow} initial ready, {followUpsReadyNow} follow-ups ready (capacity remaining {dailyRemaining})";
        if (followUpsDue > 0)
            return $"FOLLOW-UPS DUE BUT BLOCKED — {followUpsDue} due; blockers: {FormatBlockerSummary(followUpBlockers ?? new Dictionary<string, int>())}";
        if (qualifiedUnsent > 0)
            return $"QUALIFIED UNSENT BLOCKED — {qualifiedUnsent}; blockers: {FormatBlockerSummary(qualifiedUnsentBlockers ?? new Dictionary<string, int>())}";
        if (missingEmailEligible > 0)
            return $"EMAIL_DISCOVERY — {missingEmailEligible} creators due now, {discoveryBackoff} in backoff, only {readyNow} ready to send";
        if (discoveryBackoff > 0 && publicEmails < Math.Max(10, totalCreators / 3))
            return $"EMAIL_DISCOVERY_BACKOFF — {discoveryBackoff} creators waiting; fresh creator discovery continues";
        if (publicEmails == 0 && totalCreators > 0)
            return $"EMAIL_DISCOVERY — {totalCreators} creators, 0 public emails";
        if (totalCreators < 40)
            return $"CREATOR_DISCOVERY — inventory low ({totalCreators} cooking creators)";
        return "NO QUALIFIED SENDABLE INVENTORY — discovery/qualification gates blocked remaining capacity";
    }
}

public sealed record AcqSesEventRequest(string ProspectId, string EventType);
public sealed record AcqInboundRequest(string FromEmail, string? Subject, string? Preview, string? MessageId, string? InReplyTo);
public sealed record AcqTestSendRequest(string? To);
public sealed record AcqCampaignFlagsRequest(string? Campaign, bool? SendingEnabled, bool? ComplaintPause);
public sealed record AcqAdminActionRequest(string? Reason);
public sealed record AcqDraftEditRequest(string? Subject, string? Body);
public sealed record AcqManualContactRequest(string Email, string SourceUrl, bool Attested, string? ContactName = null, string? Notes = null);
public sealed record AcqStatusChangeRequest(string Status, string? Reason = null);

public interface ICreatorAcquisitionService
{
    ICreatorAcquisitionStore Store { get; }
    Task<AcqCampaignState> LoadStateAsync(string campaign, CancellationToken cancellationToken);
    Task<AcqProspectRecord> InspectAndUpsertAsync(AcqUpsertProspectRequest request, CancellationToken cancellationToken);
    Task<AcqDraftPrepareResult> PrepareDraftAsync(string prospectId, CancellationToken cancellationToken);
    Task<AcqDraftPrepareBatchResult> PrepareDraftBatchAsync(AcqDraftPrepareBatchRequest request, CancellationToken cancellationToken);
    Task<(AcqApprovalRecord? Approval, string? Error)> ApproveBatchAsync(AcqApproveBatchRequest request, string approver, CancellationToken cancellationToken);
    Task<AcqWeekdaySendResult> RunWeekdaySendAsync(string campaign, CancellationToken cancellationToken, bool? dryRunOverride = null);
    Task<AcqWeekdaySendResult> RunScheduledAcquisitionAsync(CancellationToken cancellationToken);
    Task UnsubscribeAsync(string email, CancellationToken cancellationToken);
    Task<bool> IsGloballyUnsubscribedAsync(string email, CancellationToken cancellationToken);
    Task<AcqProspectRecord?> RecordInboundAsync(string email, string subject, string preview, string? messageId, string? inReplyTo, CancellationToken cancellationToken);
    Task ApplySesEventAsync(string prospectId, string eventType, CancellationToken cancellationToken);
    Task<bool> ApplySesEventResolvedAsync(
        string? prospectId,
        string? opaqueToken,
        string? sesMessageId,
        string? destinationEmail,
        string eventType,
        CancellationToken cancellationToken);
    Task RecordFunnelAsync(string token, string eventName, CancellationToken cancellationToken);
    Task<object?> GetPersonalizedAuditAsync(string token, CancellationToken cancellationToken);
    Task<object> MigrateRescoreAsync(int limit, CancellationToken cancellationToken);
    Task<object> MigrateBrandCopyAsync(CancellationToken cancellationToken, bool includeAlreadyContacted = false);
    Task<(AcqProspectRecord? Prospect, string? Error)> RejectAsync(string prospectId, string adminEmail, string? reason, CancellationToken cancellationToken);
    Task<(AcqProspectRecord? Prospect, string? Error)> UnapproveAsync(string prospectId, string adminEmail, CancellationToken cancellationToken);
    Task<(AcqProspectRecord? Prospect, string? Error)> OverrideCooldownAsync(string prospectId, string adminEmail, string? reason, CancellationToken cancellationToken);
    Task<(AcqProspectRecord? Prospect, string? Error)> UpdateDraftAsync(string prospectId, string? subject, string? body, string adminEmail, CancellationToken cancellationToken);
    Task<(AcqProspectRecord? Prospect, string? Error)> SetManualContactAsync(string prospectId, string email, string sourceUrl, bool attested, string adminEmail, string? contactName, string? notes, CancellationToken cancellationToken);
    Task<(AcqProspectRecord? Prospect, string? Error)> SetStatusAsync(string prospectId, string newStatus, string adminEmail, string? reason, CancellationToken cancellationToken);
    Task<(bool Ok, string? Error, string? MessageId)> SendNowAsync(string prospectId, string adminEmail, CancellationToken cancellationToken);
    Task<AcqApproveAndSendResult> ApproveAndSendAsync(string prospectId, string adminEmail, CancellationToken cancellationToken);
    Task<AcqSendApprovedBatchResult> SendApprovedBatchAsync(string campaign, IReadOnlyList<string>? prospectIds, string adminEmail, CancellationToken cancellationToken);
    Task<AcqEmailDiscoveryJobState> StartEmailDiscoveryAsync(AcqEmailDiscoveryStartRequest request, string adminEmail, CancellationToken cancellationToken);
    Task<AcqEmailDiscoveryJobState?> GetEmailDiscoveryJobAsync(string jobId, CancellationToken cancellationToken);
    Task<AcqEmailDiscoveryJobState> TickEmailDiscoveryAsync(string jobId, int batchSize, CancellationToken cancellationToken);
    Task<(AcqProspectRecord? Prospect, string? Error)> AcceptDiscoveredEmailAsync(string prospectId, bool accept, string adminEmail, string? reason, CancellationToken cancellationToken);
    Task<AcqCreatorDiscoveryJobState> StartCreatorDiscoveryAsync(AcqCreatorDiscoveryStartRequest request, string adminEmail, CancellationToken cancellationToken);
    Task<AcqCreatorDiscoveryJobState?> GetCreatorDiscoveryJobAsync(string jobId, CancellationToken cancellationToken);
    Task<AcqCreatorDiscoveryJobState> TickCreatorDiscoveryAsync(string jobId, CancellationToken cancellationToken);
    Task<AcqCreatorDiscoveryJobState> ResumeCreatorDiscoveryAsync(string jobId, CancellationToken cancellationToken);
    Task<IReadOnlyList<AcqCampaignConfig>> ListCampaignConfigsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<AcqCampaignCard>> ListCampaignCardsAsync(CancellationToken cancellationToken);
    Task<AcqCampaignConfig> UpsertCampaignConfigAsync(AcqCampaignConfigRequest request, CancellationToken cancellationToken);
    Task<AcqCampaignConfig> UpdateCampaignSettingsAsync(string campaignId, AcqCampaignSettingsRequest request, CancellationToken cancellationToken);
    Task<AcqCampaignConfig> EnsureCook001PersistedAsync(CancellationToken cancellationToken);
    Task<int> PromoteAutomaticReadyDraftsAsync(string campaign, AcqCampaignState? state, CancellationToken cancellationToken);
    Task<AcqCampaignConfig> ResolveCampaignConfigAsync(string campaign, CancellationToken cancellationToken);
    Task<AcqProviderQuota> GetProviderQuotaAsync(CancellationToken cancellationToken);
    Task<AcqSendPreviewResult> PreviewSendAsync(AcqSendPreviewRequest request, CancellationToken cancellationToken);
    Task<AcqBulkSendJobState> StartBulkSendAsync(AcqBulkSendStartRequest request, string adminEmail, CancellationToken cancellationToken);
    Task<AcqBulkSendJobState?> GetBulkSendJobAsync(string jobId, CancellationToken cancellationToken);
    Task<AcqBulkSendJobState> TickBulkSendAsync(string jobId, CancellationToken cancellationToken);
    string Site();
    string TrackedSite();
}

