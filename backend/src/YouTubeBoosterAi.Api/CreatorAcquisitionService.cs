using System.Net;
using System.Net.Http.Json;
using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public sealed class CreatorAcquisitionService : ICreatorAcquisitionService
{
    public const int MaxBatchApprove = 25;
    public const int DefaultDailyLimit = 5;

    private readonly ICreatorAcquisitionStore _store;
    public ICreatorAcquisitionStore Store => _store;
    private readonly IAppDataStore _appDataStore;
    private readonly IDemoAnalysisService _demo;
    private readonly IAmazonSimpleEmailService _ses;
    private readonly ISecretValueProvider _secrets;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _http;

    public CreatorAcquisitionService(
        ICreatorAcquisitionStore store,
        IAppDataStore appDataStore,
        IDemoAnalysisService demo,
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secrets,
        IConfiguration configuration,
        IHttpClientFactory http)
    {
        _store = store;
        _appDataStore = appDataStore;
        _demo = demo;
        _ses = ses;
        _secrets = secrets;
        _configuration = configuration;
        _http = http;
    }

    public async Task<AcqCampaignState> LoadStateAsync(string campaign, CancellationToken cancellationToken)
    {
        var flags = await _store.GetCampaignFlagsAsync(campaign, cancellationToken);
        var sendingSecret = await _secrets.GetValueAsync("outreach/marketing-sending-enabled", secure: false, cancellationToken);
        var cfgSending = _configuration["CreatorAcquisition:MarketingSendingEnabled"];
        var sending = flags.SendingEnabled
            && string.Equals(sendingSecret?.Trim(), "true", StringComparison.OrdinalIgnoreCase)
            && string.Equals(cfgSending, "true", StringComparison.OrdinalIgnoreCase);

        var from = (await _secrets.GetValueAsync("ses/outreach-from-email", secure: true, cancellationToken))
            ?? await _secrets.GetValueAsync("ses/from-email", secure: true, cancellationToken);
        var fromName = (await _secrets.GetValueAsync("ses/outreach-from-name", secure: false, cancellationToken))
            ?? "Max from YouTubeBooster";
        var reply = (await _secrets.GetValueAsync("ses/outreach-reply-to", secure: true, cancellationToken))
            ?? "hello@youtubeboosterai.com";
        var postal = await _secrets.GetValueAsync("business/postal-address", secure: false, cancellationToken);
        var pauseSecret = await _secrets.GetValueAsync("outreach/complaint-pause", secure: false, cancellationToken);
        var pause = flags.ComplaintPause || string.Equals(pauseSecret?.Trim(), "true", StringComparison.OrdinalIgnoreCase);

        return new AcqCampaignState(
            MarketingSendingEnabled: sending,
            ComplaintPause: pause,
            DailyLimit: DefaultDailyLimit,
            LastSendDayEt: null,
            SentTodayEt: 0,
            PostalAddress: postal?.Trim(),
            FromEmail: from?.Trim(),
            FromName: fromName.Trim(),
            ReplyTo: reply?.Trim(),
            ConfigSet: _configuration["CreatorAcquisition:ConfigSet"] ?? "yb-creator-acquisition"
        );
    }

    public async Task<AcqProspectRecord> InspectAndUpsertAsync(AcqUpsertProspectRequest request, CancellationToken cancellationToken)
    {
        var demo = await _demo.RunDemoAsync(new DemoAnalysisRequest(request.ChannelInput, null), cancellationToken);
        var placeholder = demo.Findings.Any(f => f.Contains("placeholders", StringComparison.OrdinalIgnoreCase))
            || demo.SubscriberCount == 0;
        var handle = string.IsNullOrWhiteSpace(demo.ChannelHandle) ? request.ChannelInput : demo.ChannelHandle;
        if (!handle.StartsWith('@') && !handle.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            handle = "@" + handle.TrimStart('@');
        var url = handle.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            ? handle
            : "https://www.youtube.com/" + (handle.StartsWith('@') ? handle : "@" + handle.TrimStart('@'));

        var videos = await TryLoadVideosAsync(handle, cancellationToken);
        DateTimeOffset? recent = videos.Count > 0 ? videos[0].publishedAt : null;
        var (titles, descriptions, cadence) = CreatorAcquisitionScoring.ParseDemoFindings(demo.Findings);
        if (cadence <= 0 && videos.Count >= 2)
        {
            var span = (videos[0].publishedAt - videos[^1].publishedAt).TotalDays;
            cadence = span / Math.Max(1, videos.Count - 1);
        }

        var email = request.PublicBusinessEmail?.Trim();
        if (CreatorAcquisitionContact.IsGuessed(email, request.ContactSourceUrl))
            email = null;
        if (!string.IsNullOrWhiteSpace(email) && !EmailAddressHelpers.LooksLikeEmail(email))
            email = null;

        var language = string.IsNullOrWhiteSpace(request.Language) ? GuessLanguage(demo.ChannelTitle, videos) : request.Language!;
        var independent = !IsNetworkName(demo.ChannelTitle);
        var children = IsChildren(demo.ChannelTitle, demo.Findings);
        var inactive = recent is null || (DateTimeOffset.UtcNow - recent.Value).TotalDays > 180;
        var celebrity = demo.SubscriberCount > 1000000;

        var score = CreatorAcquisitionScoring.Score(new AcqScoreInput(
            demo.SubscriberCount,
            recent,
            DateTimeOffset.UtcNow,
            descriptions,
            titles,
            Math.Max(videos.Count, 20),
            EmailAddressHelpers.LooksLikeEmail(email) && !string.IsNullOrWhiteSpace(request.ContactSourceUrl),
            independent,
            language,
            independent && demo.SubscriberCount is >= 1000 and <= 100000,
            placeholder,
            celebrity,
            children,
            inactive
        ));

        var dup = await _store.FindDuplicateAsync(null, url, handle, email, cancellationToken);
        var prospectId = dup?.ProspectId ?? $"{request.Campaign}-{Guid.NewGuid().ToString("N")[..8]}";
        var token = dup?.OpaqueToken ?? AcqIds.NewOpaqueToken();
        var example = demo.TopVideos?.FirstOrDefault()?.Title;
        var observation = placeholder ? null : CreatorAcquisitionScoring.BuildObservation(titles, descriptions, Math.Max(videos.Count, 20), example);
        var improvement = placeholder ? null : CreatorAcquisitionScoring.BuildImprovement(titles, descriptions);
        var tracked = $"/api/public/acq/go/{token}";
        var contactType = string.IsNullOrWhiteSpace(request.ContactType) ? "none" : request.ContactType;
        if (string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(request.ContactSourceUrl) && contactType != "form_only")
            contactType = "source_recorded_unverified";

        var now = DateTimeOffset.UtcNow;
        var record = new AcqProspectRecord(
            ProspectId: prospectId,
            ChannelName: placeholder ? request.ChannelInput : demo.ChannelTitle,
            Handle: handle,
            ChannelUrl: url,
            ChannelId: null,
            PrimaryNiche: request.PrimaryNiche,
            Language: language,
            Country: null,
            SubscriberCount: demo.SubscriberCount,
            VideoCount: demo.VideoCount,
            RecentUploadAt: recent,
            CadenceDays: cadence > 0 ? cadence : null,
            TypicalViewRange: demo.TopVideos is { Count: > 0 } ? demo.TopVideos[0].ViewCount.ToString() : null,
            OfficialWebsite: request.OfficialWebsite,
            PublicBusinessEmail: email?.ToLowerInvariant(),
            ContactSourceUrl: request.ContactSourceUrl,
            ContactVerifiedAt: EmailAddressHelpers.LooksLikeEmail(email) && !string.IsNullOrWhiteSpace(request.ContactSourceUrl) ? now : null,
            ContactType: contactType,
            ChannelFitScore: score.TargetRange + score.Independent + score.OfferFit,
            AuditOpportunityScore: score.PackagingOpportunity,
            PurchaseLikelihoodScore: score.PublicEmail + score.RecentActivity,
            PriorityScore: score.Total,
            InspectionStatus: placeholder ? "failed" : "completed",
            OutreachStatus: dup?.OutreachStatus ?? "discovered",
            LastContactedAt: dup?.LastContactedAt,
            SuppressionStatus: dup?.SuppressionStatus ?? "none",
            Campaign: request.Campaign,
            TrackedPath: tracked,
            OpaqueToken: token,
            InspectedUrl: url,
            EvidenceAt: placeholder ? null : now,
            Observation: observation,
            SuggestedImprovement: improvement,
            EvidenceSummary: placeholder ? "Public YouTube data could not be loaded." : string.Join(" ", demo.Findings.Take(3)),
            Subject: dup?.Subject,
            Body: dup?.Body,
            ContentHash: dup?.ContentHash,
            ApprovalId: null,
            TicketId: dup?.TicketId,
            Notes: request.Notes,
            CreatedAt: dup?.CreatedAt ?? now,
            UpdatedAt: now,
            PreviewPlaceholder: placeholder
        );

        if (dup is not null && (dup.LastContactedAt is not null || !string.Equals(dup.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase)))
        {
            record = record with
            {
                LastContactedAt = dup.LastContactedAt,
                SuppressionStatus = dup.SuppressionStatus,
                OutreachStatus = dup.OutreachStatus,
                TicketId = dup.TicketId
            };
        }

        await _store.UpsertProspectAsync(record, cancellationToken);
        return record;
    }

    public async Task<AcqProspectRecord?> PrepareDraftAsync(string prospectId, CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null || p.PreviewPlaceholder || string.IsNullOrWhiteSpace(p.Observation))
            return p;
        var site = Site();
        var tracked = $"{site}{p.TrackedPath}";
        var greeting = p.ChannelName;
        var subject = CreatorAcquisitionCampaigns.DefaultSubject;
        var unsub = $"{site}/api/public/acq/unsubscribe?token=PLACEHOLDER";
        var body = CreatorAcquisitionMail.BuildText(greeting, p.ChannelName, p.Observation, tracked, p.ChannelName, unsub, "{{configured_business_postal_address}}");
        var next = p with
        {
            Subject = subject,
            Body = body,
            OutreachStatus = "draft_ready",
            ApprovalId = null,
            ContentHash = null,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        next = next with { ContentHash = CreatorAcquisitionScoring.ContentHash(next) };
        await _store.UpsertProspectAsync(next, cancellationToken);
        return next;
    }

    public async Task<(AcqApprovalRecord? Approval, string? Error)> ApproveBatchAsync(
        AcqApproveBatchRequest request,
        string approver,
        CancellationToken cancellationToken)
    {
        if (request.ProspectIds.Count is <= 0 or > MaxBatchApprove)
            return (null, $"Batch must contain 1–{MaxBatchApprove} recipients.");

        var included = new List<string>();
        var hashes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in request.ProspectIds.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var p = await _store.GetProspectAsync(id, cancellationToken);
            if (p is null) return (null, $"Unknown prospect {id}.");
            if (p.PreviewPlaceholder) return (null, $"{id} is a placeholder and cannot be approved.");
            if (string.IsNullOrWhiteSpace(p.Subject) || string.IsNullOrWhiteSpace(p.Body) || string.IsNullOrWhiteSpace(p.Observation))
                return (null, $"{id} has no draft.");
            if (!CreatorAcquisitionScoring.IsVerifiedPublicEmail(p))
                return (null, $"{id} has no verified public business email.");
            var hash = CreatorAcquisitionScoring.ContentHash(p);
            included.Add(p.ProspectId);
            hashes[p.ProspectId] = hash;
        }

        var approval = new AcqApprovalRecord(
            AcqIds.NewApprovalId(),
            approver,
            DateTimeOffset.UtcNow,
            request.Campaign,
            included,
            hashes,
            request.AudienceQueryVersion ?? "v1",
            Math.Clamp(request.MaximumSends, 1, DefaultDailyLimit),
            DateTimeOffset.UtcNow.AddDays(7)
        );
        await _store.SaveApprovalAsync(approval, cancellationToken);
        foreach (var id in included)
        {
            var p = await _store.GetProspectAsync(id, cancellationToken);
            if (p is null) continue;
            await _store.UpsertProspectAsync(p with
            {
                ApprovalId = approval.ApprovalId,
                ContentHash = hashes[id],
                OutreachStatus = "approved",
                UpdatedAt = DateTimeOffset.UtcNow
            }, cancellationToken);
        }
        return (approval, null);
    }

    public async Task<AcqWeekdaySendResult> RunWeekdaySendAsync(string campaign, CancellationToken cancellationToken)
    {
        var reasons = new List<string>();
        var state = await LoadStateAsync(campaign, cancellationToken);
        if (!CreatorAcquisitionScoring.IsWeekdayEastern(DateTimeOffset.UtcNow))
            return new AcqWeekdaySendResult(state.MarketingSendingEnabled, 0, 0, 0, ["weekend_eastern"]);
        if (!state.MarketingSendingEnabled)
            return new AcqWeekdaySendResult(false, 0, 0, 0, ["marketing_sending_disabled"]);

        var hmac = await _secrets.GetValueAsync("outreach/unsubscribe-hmac", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(hmac))
            return new AcqWeekdaySendResult(state.MarketingSendingEnabled, 0, 0, 0, ["unsubscribe_signing_missing"]);

        var unsubOk = true;
        if (!unsubOk)
            return new AcqWeekdaySendResult(state.MarketingSendingEnabled, 0, 0, 0, ["unsubscribe_endpoint_unhealthy"]);

        var all = await _store.ListProspectsAsync(cancellationToken);
        var today = CreatorAcquisitionScoring.EasternDate(DateTimeOffset.UtcNow).Date;
        var sentToday = all.Count(p => p.LastContactedAt is not null && CreatorAcquisitionScoring.EasternDate(p.LastContactedAt.Value).Date == today);
        var remaining = Math.Max(0, state.DailyLimit - sentToday);
        if (remaining == 0)
            return new AcqWeekdaySendResult(true, 0, 0, 0, ["daily_limit_reached"]);

        var candidates = all
            .Where(p => string.Equals(p.Campaign, campaign, StringComparison.OrdinalIgnoreCase))
            .Where(p => string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var sent = 0;
        var skipped = 0;
        var attempted = 0;
        foreach (var p in candidates)
        {
            if (sent >= remaining) break;
            attempted++;
            var outreach = EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail)
                ? await _appDataStore.GetOutreachContactAsync(p.PublicBusinessEmail!, cancellationToken)
                : null;
            if (outreach is not null && string.Equals(outreach.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase))
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:unsubscribed");
                continue;
            }

            var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, state, alreadyContacted: p.LastContactedAt is not null);
            if (!gate.Ok)
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:{gate.Reason}");
                continue;
            }

            var approval = p.ApprovalId is null ? null : await _store.GetApprovalAsync(p.ApprovalId, cancellationToken);
            if (approval is null || approval.ExpiresAt < DateTimeOffset.UtcNow)
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:approval_expired");
                continue;
            }
            if (!approval.ContentHashes.TryGetValue(p.ProspectId, out var approvedHash)
                || !string.Equals(approvedHash, CreatorAcquisitionScoring.ContentHash(p), StringComparison.Ordinal))
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:approval_invalidated");
                continue;
            }

            var idem = $"{p.ProspectId}:{p.ApprovalId}:{p.ContentHash}";
            if (!await _store.TryClaimIdempotencyAsync(idem, cancellationToken))
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:idempotency");
                continue;
            }

            var unsub = UnsubscribeUrl(p.PublicBusinessEmail!, hmac);
            var site = Site();
            var tracked = $"{site}{p.TrackedPath}";
            var mime = CreatorAcquisitionMail.Build(p, state, site, unsub, tracked);
            if (CreatorAcquisitionMail.TagsContainPii(mime.SesTags))
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:pii_in_tags");
                continue;
            }

            try
            {
                var sendReq = new SendRawEmailRequest
                {
                    Source = mime.FromHeader,
                    Destinations = [p.PublicBusinessEmail!],
                    RawMessage = new RawMessage { Data = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(mime.RawRfc822)) }
                };
                if (!string.IsNullOrWhiteSpace(state.ConfigSet))
                    sendReq.ConfigurationSetName = state.ConfigSet;
                var sesRes = await _ses.SendRawEmailAsync(sendReq, cancellationToken);

                var ticketId = await _appDataStore.SaveSupportTicketAsync(
                    new SupportTicketRequest(
                        Email: p.PublicBusinessEmail!,
                        Name: p.ChannelName,
                        Subject: p.Subject!,
                        Message: p.Body ?? "",
                        ProductArea: "creator_acquisition",
                        ChannelUrl: p.ChannelUrl,
                        OrderReference: p.ProspectId,
                        AccountEmail: null,
                        Source: "founder_outreach"),
                    linkedUserId: null,
                    cancellationToken);
                await _appDataStore.SaveSupportReplyAsync(ticketId, p.Subject!, p.Body ?? "", sesRes.MessageId, "queued", cancellationToken);
                await _appDataStore.MarkOutreachSentAsync(p.PublicBusinessEmail!, DateTimeOffset.UtcNow, cancellationToken);
                await _store.UpsertProspectAsync(p with
                {
                    OutreachStatus = "sent",
                    LastContactedAt = DateTimeOffset.UtcNow,
                    TicketId = ticketId,
                    UpdatedAt = DateTimeOffset.UtcNow
                }, cancellationToken);
                await _appDataStore.TrackEventAsync("acq_email_sent", p.ProspectId, new Dictionary<string, string?>
                {
                    ["campaign"] = campaign,
                    ["token"] = p.OpaqueToken
                }, cancellationToken);
                sent++;
            }
            catch (Exception ex)
            {
                skipped++;
                reasons.Add($"{p.ProspectId}:ses:{ex.Message}");
            }
        }

        return new AcqWeekdaySendResult(true, attempted, sent, skipped, reasons);
    }

    public async Task UnsubscribeAsync(string email, CancellationToken cancellationToken)
    {
        await _appDataStore.UnsubscribeOutreachAsync(email, DateTimeOffset.UtcNow, cancellationToken);
        var p = await _store.GetByEmailAsync(email, cancellationToken);
        if (p is null) return;
        await _store.UpsertProspectAsync(p with
        {
            OutreachStatus = "unsubscribed",
            SuppressionStatus = "unsubscribed",
            UpdatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    public async Task<AcqProspectRecord?> RecordInboundAsync(string email, string subject, string preview, string? messageId, string? inReplyTo, CancellationToken cancellationToken)
    {
        var p = await _store.GetByEmailAsync(email, cancellationToken);
        if (p is null) return null;
        if (!string.IsNullOrWhiteSpace(p.TicketId))
        {
            await _appDataStore.SaveSupportInboundAsync(p.TicketId, subject, preview, cancellationToken);
        }
        var next = p with { OutreachStatus = "replied", UpdatedAt = DateTimeOffset.UtcNow, Notes = TrimPreview(preview) };
        await _store.UpsertProspectAsync(next, cancellationToken);
        _ = messageId;
        _ = inReplyTo;
        return next;
    }

    public async Task ApplySesEventAsync(string prospectId, string eventType, CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return;
        var status = eventType.ToLowerInvariant() switch
        {
            "delivery" => "delivered",
            "bounce" => "bounced",
            "complaint" => "complained",
            "reject" => "rejected",
            "click" => p.OutreachStatus,
            _ => p.OutreachStatus
        };
        var suppression = eventType.ToLowerInvariant() switch
        {
            "bounce" => "bounced",
            "complaint" => "complained",
            _ => p.SuppressionStatus
        };
        if (eventType.Equals("complaint", StringComparison.OrdinalIgnoreCase))
            await _store.SaveCampaignFlagsAsync(p.Campaign, false, true, cancellationToken);
        await _store.UpsertProspectAsync(p with
        {
            OutreachStatus = status,
            SuppressionStatus = suppression,
            UpdatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    public async Task RecordFunnelAsync(string token, string eventName, CancellationToken cancellationToken)
    {
        var p = await _store.GetByTokenAsync(token, cancellationToken);
        if (p is null) return;
        var status = eventName switch
        {
            "acq_click" when p.OutreachStatus is "sent" or "delivered" => "delivered",
            "audit_started" => "audit_started",
            "audit_completed" => "audit_completed",
            "pricing_viewed" => "pricing_viewed",
            "checkout_started" => "checkout_started",
            "checkout_paid" => "customer",
            _ => p.OutreachStatus
        };
        await _store.UpsertProspectAsync(p with { OutreachStatus = status, UpdatedAt = DateTimeOffset.UtcNow }, cancellationToken);
        await _appDataStore.TrackEventAsync(eventName, p.ProspectId, new Dictionary<string, string?>
        {
            ["campaign"] = p.Campaign,
            ["token"] = token
        }, cancellationToken);
    }

    public string Site() =>
        (_configuration["App:PublicSiteUrl"] ?? _configuration["PUBLIC_SITE_URL"] ?? "https://youtubeboosterai.com").TrimEnd('/');

    public string UnsubscribeUrl(string email, string hmac) =>
        $"{Site()}/api/public/acq/unsubscribe?token={WebUtility.UrlEncode(OutreachUnsubscribeToken.Create(email, hmac))}";

    private async Task<IReadOnlyList<(DateTimeOffset publishedAt, string title)>> TryLoadVideosAsync(string handle, CancellationToken cancellationToken)
    {
        try
        {
            var client = _http.CreateClient();
            var url = $"{Site()}/api/public/channel/videos?channel={Uri.EscapeDataString(handle)}&max_results=5";
            using var res = await client.GetAsync(url, cancellationToken);
            if (!res.IsSuccessStatusCode) return [];
            var json = await res.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(cancellationToken);
            if (!json.TryGetProperty("items", out var items) && !json.TryGetProperty("videos", out items))
                return [];
            var list = new List<(DateTimeOffset, string)>();
            foreach (var item in items.EnumerateArray())
            {
                var title = item.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
                var published = item.TryGetProperty("publishedAt", out var p) ? p.GetString()
                    : item.TryGetProperty("published_at", out var p2) ? p2.GetString() : null;
                if (DateTimeOffset.TryParse(published, out var dt))
                    list.Add((dt, title));
            }
            return list.OrderByDescending(v => v.Item1).ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static string GuessLanguage(string title, IReadOnlyList<(DateTimeOffset, string title)> videos)
    {
        var blob = title + " " + string.Join(' ', videos.Select(v => v.title));
        if (blob.Any(c => c is >= '\u0400' and <= '\u04FF'))
            return blob.Contains('і') || blob.Contains('ї') || blob.Contains('є') ? "uk" : "ru";
        return "en";
    }

    private static bool IsNetworkName(string title)
    {
        var t = title.ToLowerInvariant();
        return t.Contains("records") || t.Contains("network") || t.Contains("tv ") || t.Contains("official vevo");
    }

    private static bool IsChildren(string title, IReadOnlyList<string> findings)
    {
        var t = (title + " " + string.Join(' ', findings)).ToLowerInvariant();
        return t.Contains("nursery") || t.Contains("cocomelon") || t.Contains("kids songs") || t.Contains("for kids");
    }

    private static string TrimPreview(string preview)
    {
        var t = preview.Replace('\r', ' ').Replace('\n', ' ').Trim();
        return t.Length <= 240 ? t : t[..237] + "…";
    }
}
