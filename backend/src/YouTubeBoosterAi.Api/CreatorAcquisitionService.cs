using System.Net;
using Amazon.SimpleEmail;
using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public sealed class CreatorAcquisitionService : ICreatorAcquisitionService
{
    public const int MaxBatchApprove = 30;
    public const int DefaultDailyLimit = OutreachPolicy.DefaultDailyLimit;

    private readonly ICreatorAcquisitionStore _store;
    public ICreatorAcquisitionStore Store => _store;
    private readonly IAppDataStore _appDataStore;
    private readonly IDemoAnalysisService _demo;
    private readonly IAmazonSimpleEmailService _ses;
    private readonly ISecretValueProvider _secrets;
    private readonly IConfiguration _configuration;
    private readonly IPublicDashboardService _dashboard;
    private readonly IHttpClientFactory _httpClientFactory;

    public CreatorAcquisitionService(
        ICreatorAcquisitionStore store,
        IAppDataStore appDataStore,
        IDemoAnalysisService demo,
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secrets,
        IConfiguration configuration,
        IPublicDashboardService dashboard,
        IHttpClientFactory httpClientFactory)
    {
        _store = store;
        _appDataStore = appDataStore;
        _demo = demo;
        _ses = ses;
        _secrets = secrets;
        _configuration = configuration;
        _dashboard = dashboard;
        _httpClientFactory = httpClientFactory;
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
        var fromNameRaw = (await _secrets.GetValueAsync("ses/outreach-from-name", secure: false, cancellationToken))
            ?? CreatorAcquisitionMail.DefaultFromName;
        var fromName = CreatorAcquisitionMail.ResolveFromName(fromNameRaw);
        var reply = (await _secrets.GetValueAsync("ses/outreach-reply-to", secure: true, cancellationToken))
            ?? "hello@youtubeboosterai.com";
        var postal = await _secrets.GetValueAsync("business/postal-address", secure: false, cancellationToken);
        var pauseSecret = await _secrets.GetValueAsync("outreach/complaint-pause", secure: false, cancellationToken);
        var pause = flags.ComplaintPause || string.Equals(pauseSecret?.Trim(), "true", StringComparison.OrdinalIgnoreCase);
        var maxLimit = OutreachPolicy.ResolveMaxLimit(
            Environment.GetEnvironmentVariable("YTB_OUTREACH_MAX_LIMIT"),
            _configuration["CreatorAcquisition:MaxDailyLimit"],
            await _secrets.GetValueAsync("outreach/max-limit", secure: false, cancellationToken));
        var rampEnabled = OutreachPolicy.ParseBool(
            Environment.GetEnvironmentVariable("YTB_OUTREACH_RAMP_ENABLED")
                ?? _configuration["CreatorAcquisition:RampEnabled"]
                ?? await _secrets.GetValueAsync("outreach/ramp-enabled", secure: false, cancellationToken),
            true);
        var cooldown = OutreachPolicy.ParseInt(
            Environment.GetEnvironmentVariable("YTB_OUTREACH_COOLDOWN_DAYS")
                ?? _configuration["CreatorAcquisition:CooldownDays"]
                ?? await _secrets.GetValueAsync("outreach/cooldown-days", secure: false, cancellationToken),
            OutreachPolicy.DefaultCooldownDays);
        var allowWeekends = OutreachPolicy.ParseBool(
            Environment.GetEnvironmentVariable("YTB_OUTREACH_ALLOW_WEEKENDS")
                ?? _configuration["CreatorAcquisition:AllowWeekends"]
                ?? await _secrets.GetValueAsync("outreach/allow-weekends", secure: false, cancellationToken),
            true);
        var ramp = await _store.GetRampAsync(campaign, cancellationToken);
        var stage = OutreachPolicy.Stages.Contains(ramp.Stage) ? ramp.Stage : OutreachPolicy.Stages[0];
        var daily = rampEnabled
            ? OutreachPolicy.ClampDailyLimit(stage, maxLimit)
            : OutreachPolicy.ResolveDailyLimit(
                Environment.GetEnvironmentVariable("YTB_OUTREACH_DAILY_LIMIT"),
                _configuration["CreatorAcquisition:DailyLimit"],
                await _secrets.GetValueAsync("outreach/daily-limit", secure: false, cancellationToken),
                maxLimit);

        return new AcqCampaignState(
            MarketingSendingEnabled: sending,
            ComplaintPause: pause,
            DailyLimit: daily,
            LastSendDayEt: null,
            SentTodayEt: 0,
            PostalAddress: postal?.Trim(),
            FromEmail: from?.Trim(),
            FromName: fromName.Trim(),
            ReplyTo: reply?.Trim(),
            ConfigSet: string.IsNullOrWhiteSpace(_configuration["CreatorAcquisition:ConfigSet"])
                ? null
                : _configuration["CreatorAcquisition:ConfigSet"]!.Trim(),
            MaxDailyLimit: maxLimit,
            RampEnabled: rampEnabled,
            CooldownDays: cooldown,
            RampStage: stage,
            StandingCampaignApproval: false,
            RampBlockReason: ramp.BlockReason,
            AllowWeekends: allowWeekends
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

        var sampleSize = Math.Max(1, videos.Count > 0 ? videos.Count : 20);

        var email = request.PublicBusinessEmail?.Trim();
        var contactSourceUrl = request.ContactSourceUrl?.Trim();
        var contactType = string.IsNullOrWhiteSpace(request.ContactType) ? "none" : request.ContactType;
        var officialWebsite = request.OfficialWebsite?.Trim();
        if (CreatorAcquisitionContact.IsGuessed(email, contactSourceUrl))
            email = null;
        if (!string.IsNullOrWhiteSpace(email) && !EmailAddressHelpers.LooksLikeEmail(email))
            email = null;

        var dup = await _store.FindDuplicateAsync(null, url, handle, email, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var contactAttempts = dup?.ContactResearchAttempts ?? 0;
        var contactStatus = dup?.ContactResearchStatus;
        var contactNextAt = dup?.ContactResearchNextAt;
        var contactLastAt = dup?.ContactResearchLastAt;

        var alreadyVerified = EmailAddressHelpers.LooksLikeEmail(email)
            && !string.IsNullOrWhiteSpace(contactSourceUrl)
            && contactType is "business" or "partnership" or "media" or "general";

        // Automated public contact research (never invents emails). Respect backoff.
        if (!alreadyVerified && !placeholder)
        {
            var due = contactNextAt is null || contactNextAt <= now;
            if (due && contactAttempts < 5)
            {
                // Prefer URLs/emails visible in public video descriptions before fetching sites.
                var descTexts = videos
                    .SelectMany(v => new[] { v.title, v.description })
                    .Where(t => !string.IsNullOrWhiteSpace(t))
                    .Take(20)
                    .ToList();
                descTexts.AddRange(demo.Findings.Take(5));
                if (!string.IsNullOrWhiteSpace(demo.ChannelTitle))
                    descTexts.Add(demo.ChannelTitle);

                var fromDescriptions = ExtractEmailsFromPlainText(string.Join('\n', descTexts));
                if (fromDescriptions.Count > 0 && string.IsNullOrWhiteSpace(email))
                {
                    email = PreferBusinessEmailLocal(fromDescriptions);
                    contactSourceUrl ??= url;
                    contactType = "business";
                    contactStatus = "verified_public";
                    contactAttempts += 1;
                    contactLastAt = now;
                    contactNextAt = null;
                    alreadyVerified = true;
                }

                if (!alreadyVerified)
                {
                    using var http = _httpClientFactory.CreateClient();
                    http.Timeout = TimeSpan.FromSeconds(12);
                    var research = await CreatorAcquisitionContact.ResearchPublicContactAsync(
                        http,
                        officialWebsite,
                        descTexts,
                        cancellationToken);

                    contactAttempts += 1;
                    contactLastAt = now;
                    contactStatus = research.Status;
                    officialWebsite ??= research.OfficialWebsite;

                    if (string.Equals(research.Status, "verified_public", StringComparison.OrdinalIgnoreCase)
                        && EmailAddressHelpers.LooksLikeEmail(research.Email)
                        && !string.IsNullOrWhiteSpace(research.SourceUrl))
                    {
                        email = research.Email;
                        contactSourceUrl = research.SourceUrl;
                        contactType = research.ContactType;
                        contactNextAt = null;
                    }
                    else
                    {
                        if (string.Equals(research.ContactType, "form_only", StringComparison.OrdinalIgnoreCase))
                        {
                            contactType = "form_only";
                            contactSourceUrl = research.SourceUrl ?? contactSourceUrl;
                        }
                        else if (!string.IsNullOrWhiteSpace(research.SourceUrl) && string.IsNullOrWhiteSpace(contactSourceUrl))
                        {
                            contactSourceUrl = research.SourceUrl;
                            contactType = string.IsNullOrWhiteSpace(research.ContactType) ? "source_recorded_unverified" : research.ContactType;
                        }
                        contactNextAt = now.AddDays(CreatorAcquisitionContact.BackoffDays(contactAttempts));
                    }
                }
            }
            else if (!due)
            {
                contactStatus ??= "contact_needed_backoff";
            }
        }

        var language = string.IsNullOrWhiteSpace(request.Language) ? GuessLanguage(demo.ChannelTitle, videos) : request.Language!;
        var independent = !IsNetworkName(demo.ChannelTitle);
        var children = IsChildren(demo.ChannelTitle, demo.Findings);
        var inactive = recent is null || (DateTimeOffset.UtcNow - recent.Value).TotalDays > 180;
        var celebrity = demo.SubscriberCount > 1000000;
        var emailVerified = EmailAddressHelpers.LooksLikeEmail(email) && !string.IsNullOrWhiteSpace(contactSourceUrl)
            && (contactType is "business" or "partnership" or "media" or "general"
                || (contactType == "admin_attested" && (dup?.AdminAttestedContact == true || request.ContactType == "admin_attested")));

        var score = CreatorAcquisitionScoring.Score(new AcqScoreInput(
            demo.SubscriberCount,
            recent,
            DateTimeOffset.UtcNow,
            descriptions,
            titles,
            sampleSize,
            emailVerified,
            independent,
            language,
            independent && demo.SubscriberCount is >= 1000 and <= 100000,
            placeholder,
            celebrity,
            children,
            inactive
        ));

        var prospectId = dup?.ProspectId ?? $"{request.Campaign}-{Guid.NewGuid().ToString("N")[..8]}";
        var token = dup?.OpaqueToken ?? AcqIds.NewOpaqueToken();
        var example = demo.TopVideos?.FirstOrDefault()?.Title;
        var observation = placeholder ? null : CreatorAcquisitionScoring.BuildObservation(titles, descriptions, sampleSize, example);
        var improvement = placeholder ? null : CreatorAcquisitionScoring.BuildImprovement(titles, descriptions, example);
        var findingType = placeholder ? null : CreatorAcquisitionScoring.ResolveFindingType(titles, descriptions, sampleSize, example);
        var tracked = $"/api/public/acq/go/{token}";
        if (string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(contactSourceUrl) && contactType != "form_only"
            && contactType is not "business" and not "partnership" and not "media" and not "general")
            contactType = "source_recorded_unverified";

        // Preserve approval only when draft identity is unchanged.
        string? keepApproval = null;
        string? keepHash = dup?.ContentHash;
        string? keepSubject = dup?.Subject;
        string? keepBody = dup?.Body;
        if (dup is not null
            && !string.IsNullOrWhiteSpace(dup.ApprovalId)
            && string.Equals(dup.Observation, observation, StringComparison.Ordinal)
            && EmailAddressHelpers.LooksLikeEmail(email)
            && string.Equals(dup.PublicBusinessEmail, email, StringComparison.OrdinalIgnoreCase))
        {
            keepApproval = dup.ApprovalId;
        }

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
            OfficialWebsite: officialWebsite,
            PublicBusinessEmail: email?.ToLowerInvariant(),
            ContactSourceUrl: contactSourceUrl,
            ContactVerifiedAt: emailVerified ? now : null,
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
            Subject: keepSubject,
            Body: keepBody,
            ContentHash: keepHash,
            ApprovalId: keepApproval,
            TicketId: dup?.TicketId,
            Notes: request.Notes,
            CreatedAt: dup?.CreatedAt ?? now,
            UpdatedAt: now,
            PreviewPlaceholder: placeholder,
            EmailVariant: dup?.EmailVariant,
            CohortRunId: dup?.CohortRunId,
            LastSesMessageId: dup?.LastSesMessageId,
            WeakDescriptionCount: descriptions,
            TitleIssueCount: titles,
            SampleSize: sampleSize,
            ContactResearchAttempts: contactAttempts,
            ContactResearchNextAt: contactNextAt,
            ContactResearchLastAt: contactLastAt,
            ContactResearchStatus: contactStatus ?? (emailVerified ? "verified_public" : "contact_needed"),
            FollowUpStep: dup?.FollowUpStep ?? 0,
            NextFollowUpAt: dup?.NextFollowUpAt,
            ScoreBreakdownJson: CreatorAcquisitionScoring.ScoreBreakdownJson(score),
            ApprovedBy: keepApproval is not null ? dup?.ApprovedBy : null,
            ApprovedAt: keepApproval is not null ? dup?.ApprovedAt : null,
            CooldownOverrideUntil: dup?.CooldownOverrideUntil,
            AdminAttestedContact: string.Equals(contactType, "admin_attested", StringComparison.OrdinalIgnoreCase)
                || (dup?.AdminAttestedContact == true && EmailAddressHelpers.LooksLikeEmail(email)),
            TemplateVersion: dup?.TemplateVersion,
            SubjectVariant: dup?.SubjectVariant,
            MessageVariant: dup?.MessageVariant,
            FindingType: findingType ?? dup?.FindingType,
            ExampleVideoTitle: placeholder ? dup?.ExampleVideoTitle : (example ?? dup?.ExampleVideoTitle)
        );

        if (dup is not null && (dup.LastContactedAt is not null || !string.Equals(dup.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase)))
        {
            record = record with
            {
                LastContactedAt = dup.LastContactedAt,
                SuppressionStatus = dup.SuppressionStatus,
                OutreachStatus = dup.OutreachStatus,
                TicketId = dup.TicketId,
                FollowUpStep = dup.FollowUpStep,
                NextFollowUpAt = dup.NextFollowUpAt
            };
        }

        await _store.UpsertProspectAsync(record, cancellationToken);
        return record;
    }

    public async Task<AcqProspectRecord?> PrepareDraftAsync(string prospectId, CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null || p.PreviewPlaceholder)
            return p;

        // Refresh observation/improvement from stored evidence counts when available.
        var exampleTitle = p.ExampleVideoTitle;
        var sampleSize = p.SampleSize;
        var weakDescriptions = p.WeakDescriptionCount;
        var titleIssues = p.TitleIssueCount;
        string? observation = p.Observation;
        string? improvement = p.SuggestedImprovement;
        string? findingType = p.FindingType;

        if (sampleSize <= 0
            && CreatorAcquisitionScoring.TryParseObservationEvidence(
                p.Observation, out var parsedCount, out var parsedSample, out var parsedExample, out var isDesc))
        {
            sampleSize = parsedSample;
            if (isDesc) weakDescriptions = Math.Max(weakDescriptions, parsedCount);
            else titleIssues = Math.Max(titleIssues, parsedCount);
            if (string.IsNullOrWhiteSpace(exampleTitle)) exampleTitle = parsedExample;
        }

        // Pull example title from legacy observation prose when structured field is empty.
        if (string.IsNullOrWhiteSpace(exampleTitle)
            && CreatorAcquisitionScoring.TryParseObservationEvidence(
                p.Observation, out _, out _, out var legacyExample, out _))
        {
            exampleTitle = legacyExample;
        }

        if (sampleSize > 0 && (weakDescriptions > 0 || titleIssues > 0))
        {
            observation = CreatorAcquisitionScoring.BuildObservation(
                titleIssues, weakDescriptions, sampleSize, exampleTitle);
            improvement = CreatorAcquisitionScoring.BuildImprovement(
                titleIssues, weakDescriptions, exampleTitle);
            findingType = CreatorAcquisitionScoring.ResolveFindingType(
                titleIssues, weakDescriptions, sampleSize, exampleTitle);
        }
        else if (!string.IsNullOrWhiteSpace(observation)
                 && !string.IsNullOrWhiteSpace(exampleTitle)
                 && (improvement is null || !improvement.Contains("For example", StringComparison.OrdinalIgnoreCase)))
        {
            improvement = CreatorAcquisitionScoring.BuildImprovement(
                Math.Max(1, titleIssues), Math.Max(1, weakDescriptions), exampleTitle);
            findingType ??= observation.Contains("description", StringComparison.OrdinalIgnoreCase)
                ? "DESCRIPTION_DEPTH"
                : "TITLE_OPPORTUNITY";
        }

        if (string.IsNullOrWhiteSpace(observation))
        {
            var weak = p with
            {
                OutreachStatus = "needs_review",
                Subject = null,
                Body = null,
                ApprovalId = null,
                ContentHash = null,
                ApprovedBy = null,
                ApprovedAt = null,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            await _store.UpsertProspectAsync(weak, cancellationToken);
            return weak;
        }

        var draftProbe = p with
        {
            Observation = observation,
            SuggestedImprovement = improvement,
            FindingType = findingType,
            ExampleVideoTitle = exampleTitle,
            SampleSize = sampleSize > 0 ? sampleSize : p.SampleSize,
            WeakDescriptionCount = weakDescriptions > 0 ? weakDescriptions : p.WeakDescriptionCount,
            TitleIssueCount = titleIssues > 0 ? titleIssues : p.TitleIssueCount
        };
        if (!CreatorAcquisitionScoring.HasStrongPersonalization(draftProbe))
        {
            var weak = draftProbe with
            {
                OutreachStatus = "needs_review",
                Subject = null,
                Body = null,
                ApprovalId = null,
                ContentHash = null,
                ApprovedBy = null,
                ApprovedAt = null,
                TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
                UpdatedAt = DateTimeOffset.UtcNow
            };
            await _store.UpsertProspectAsync(weak, cancellationToken);
            return weak;
        }

        var site = Site();
        var tracked = $"{site}{p.TrackedPath}";
        var variant = OutreachPolicy.PersistVariant(p.EmailVariant, p.ProspectId);
        var subjectVariant = CreatorAcquisitionCopy.SubjectVariantCode(variant);
        var (subject, body) = CreatorAcquisitionCopy.Build(
            variant,
            p.ChannelName,
            p.ChannelName,
            observation!,
            improvement ?? "",
            tracked);

        var next = p with
        {
            Observation = observation,
            SuggestedImprovement = improvement,
            FindingType = findingType,
            ExampleVideoTitle = exampleTitle,
            SampleSize = sampleSize > 0 ? sampleSize : p.SampleSize,
            WeakDescriptionCount = weakDescriptions > 0 ? weakDescriptions : p.WeakDescriptionCount,
            TitleIssueCount = titleIssues > 0 ? titleIssues : p.TitleIssueCount,
            Subject = subject,
            Body = body,
            EmailVariant = variant,
            SubjectVariant = subjectVariant,
            MessageVariant = "brand_audit_v1",
            TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
            OutreachStatus = "draft_ready",
            ApprovalId = null,
            ContentHash = null,
            ApprovedBy = null,
            ApprovedAt = null,
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
            if (CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body))
                return (null, $"{id} still uses the legacy personal-name template. Regenerate the draft first.");
            if (!CreatorAcquisitionScoring.HasStrongPersonalization(p))
                return (null, $"{id} personalization is too weak for outreach (needs_review).");
            if (!CreatorAcquisitionScoring.IsVerifiedPublicEmail(p))
                return (null, $"{id} has no verified public business email.");
            // Align approval with send gates (except cooldown / already contacted — those are temporal).
            if (p.PriorityScore < 70)
                return (null, $"{id} score is below 70 and cannot be approved for sending.");
            if (!string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase))
                return (null, $"{id} inspection is incomplete.");
            if (p.SubscriberCount < 1000 || p.SubscriberCount > 100000)
                return (null, $"{id} subscriber count is outside the 1k–100k COOK-001 band.");
            if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
                return (null, $"{id} is suppressed.");
            if (OutreachPolicy.IsSpamTrapOrInvalid(p.PublicBusinessEmail))
                return (null, $"{id} email looks invalid or spamtrap.");
            if (p.RecentUploadAt is null || (DateTimeOffset.UtcNow - p.RecentUploadAt.Value).TotalDays > 60)
                return (null, $"{id} recent upload is stale (>60 days).");
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
            Math.Clamp(request.MaximumSends, 1, OutreachPolicy.DefaultMaxLimit),
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
                ApprovedBy = approver,
                ApprovedAt = approval.ApprovedAt,
                UpdatedAt = DateTimeOffset.UtcNow
            }, cancellationToken);
        }
        return (approval, null);
    }

    public async Task<AcqWeekdaySendResult> RunWeekdaySendAsync(string campaign, CancellationToken cancellationToken)
    {
        var reasons = new List<string>();
        var state = await LoadStateAsync(campaign, cancellationToken);
        if (!state.AllowWeekends && !CreatorAcquisitionScoring.IsWeekdayEastern(DateTimeOffset.UtcNow))
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
        var runYmd = today.ToString("yyyy-MM-dd");
        var cohortRunId = $"{campaign}-{runYmd}";
        var sentToday = all.Count(p => p.LastContactedAt is not null && CreatorAcquisitionScoring.EasternDate(p.LastContactedAt.Value).Date == today);
        var remaining = Math.Max(0, state.DailyLimit - sentToday);
        if (remaining == 0)
            return new AcqWeekdaySendResult(true, 0, 0, 0, ["daily_limit_reached"], state.DailyLimit, cohortRunId, state.RampBlockReason);

        var sentAll = all.Count(p => p.LastContactedAt is not null);
        var bounced = all.Count(p => string.Equals(p.SuppressionStatus, "bounced", StringComparison.OrdinalIgnoreCase));
        var complaints = all.Count(p => string.Equals(p.SuppressionStatus, "complained", StringComparison.OrdinalIgnoreCase));
        var unsubs = all.Count(p => string.Equals(p.SuppressionStatus, "unsubscribed", StringComparison.OrdinalIgnoreCase));
        var health = OutreachPolicy.HealthFromCounts(sentAll, bounced, complaints, unsubs);
        if (health.Unhealthy)
        {
            await _store.SaveRampAsync(campaign, new AcqRampPersist(state.RampStage, 0, runYmd, health.Reason), cancellationToken);
            if (health.Reason is "bounce_rate" or "complaint_rate")
                return new AcqWeekdaySendResult(true, 0, 0, 0, [$"health_stop:{health.Reason}"], 0, cohortRunId, health.Reason);
            remaining = Math.Min(remaining, Math.Max(1, state.RampStage / 2));
            reasons.Add($"health_reduce:{health.Reason}");
        }

        var candidates = all
            .Where(p => string.Equals(p.Campaign, campaign, StringComparison.OrdinalIgnoreCase))
            .Where(p => string.Equals(p.PrimaryNiche, "cooking", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(p.PrimaryNiche))
            .Where(p =>
                string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
                || string.Equals(p.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase)
                || string.Equals(p.OutreachStatus, "sent", StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrWhiteSpace(p.Observation) && CreatorAcquisitionScoring.IsVerifiedPublicEmail(p)))
            .OrderByDescending(p => p.PriorityScore)
            .ToList();

        var sent = 0;
        var skipped = 0;
        var evaluated = 0;
        var sesAttempted = 0;
        var sentThisRunByApproval = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        void Skip(string prospectId, string reason)
        {
            skipped++;
            reasons.Add($"{prospectId}:{reason}");
        }

        foreach (var candidate in candidates)
        {
            if (sent >= remaining) break;
            evaluated++;
            var p = candidate;
            var outreach = EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail)
                ? await _appDataStore.GetOutreachContactAsync(p.PublicBusinessEmail!, cancellationToken)
                : null;
            if (outreach is not null && string.Equals(outreach.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase))
            {
                Skip(p.ProspectId, "unsubscribed");
                continue;
            }
            if (outreach is not null && outreach.Status.Contains("bounce", StringComparison.OrdinalIgnoreCase))
            {
                Skip(p.ProspectId, "hard_bounce");
                continue;
            }
            if (EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail))
            {
                var user = await _appDataStore.GetUserByEmailAsync(p.PublicBusinessEmail!, cancellationToken);
                var entitled = user is not null && await _appDataStore.UserHasActiveEntitlementAsync(user.UserId, "premium", cancellationToken);
                if (user is not null && (user.Purchased || entitled))
                {
                    Skip(p.ProspectId, "existing_customer");
                    continue;
                }
            }

            var gate = CreatorAcquisitionScoring.ExplainSendEligibility(p, DateTimeOffset.UtcNow, state, alreadyContacted: p.LastContactedAt is not null);
            if (!gate.Ok)
            {
                Skip(p.ProspectId, gate.Reason);
                continue;
            }

            var followUpDue = CreatorAcquisitionScoring.IsFollowUpDue(p, DateTimeOffset.UtcNow);
            var extraThisRun = 0;
            if (!state.StandingCampaignApproval && !followUpDue)
            {
                var approval = p.ApprovalId is null ? null : await _store.GetApprovalAsync(p.ApprovalId, cancellationToken);
                if (approval is null || approval.ExpiresAt < DateTimeOffset.UtcNow)
                {
                    Skip(p.ProspectId, "approval_expired");
                    continue;
                }
                var priorForApproval = all.Count(x =>
                    string.Equals(x.ApprovalId, approval.ApprovalId, StringComparison.OrdinalIgnoreCase)
                    && x.LastContactedAt is not null);
                extraThisRun = sentThisRunByApproval.GetValueOrDefault(approval.ApprovalId);
                if (priorForApproval + extraThisRun >= approval.MaximumSends)
                {
                    Skip(p.ProspectId, "approval_cap");
                    continue;
                }
                if (!approval.ContentHashes.TryGetValue(p.ProspectId, out var approvedHash)
                    || !string.Equals(approvedHash, CreatorAcquisitionScoring.ContentHash(p), StringComparison.Ordinal))
                {
                    Skip(p.ProspectId, "approval_invalidated");
                    continue;
                }
            }

            var variant = OutreachPolicy.PersistVariant(p.EmailVariant, p.ProspectId);
            if (followUpDue)
            {
                var siteFu = Site();
                var trackedFu = OutreachPolicy.BuildTrackedUrl(siteFu, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
                var (fuSubject, fuBody) = CreatorAcquisitionCopy.BuildFollowUp(
                    p.FollowUpStep,
                    p.ChannelName,
                    p.ChannelName,
                    p.Observation ?? "",
                    trackedFu);
                p = p with { Subject = fuSubject, Body = fuBody, EmailVariant = variant, UpdatedAt = DateTimeOffset.UtcNow };
                await _store.UpsertProspectAsync(p, cancellationToken);
            }
            else if (!string.Equals(p.EmailVariant, variant, StringComparison.Ordinal))
            {
                p = p with { EmailVariant = variant, UpdatedAt = DateTimeOffset.UtcNow };
                await _store.UpsertProspectAsync(p, cancellationToken);
            }
            var idem = followUpDue
                ? $"{p.ProspectId}:{cohortRunId}:fu{p.FollowUpStep}"
                : $"{p.ProspectId}:{cohortRunId}";
            if (!await _store.TryClaimIdempotencyAsync(idem, cancellationToken))
            {
                Skip(p.ProspectId, "idempotency");
                continue;
            }

            var unsub = UnsubscribeUrl(p.PublicBusinessEmail!, hmac);
            var site = Site();
            var tracked = OutreachPolicy.BuildTrackedUrl(site, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
            var prepared = p with { EmailVariant = variant, CohortRunId = cohortRunId, Subject = p.Subject, Body = p.Body };
            var mime = CreatorAcquisitionMail.Build(prepared, state, site, unsub, tracked);
            if (CreatorAcquisitionMail.TagsContainPii(mime.SesTags))
            {
                Skip(p.ProspectId, "pii_in_tags");
                continue;
            }

            // Only SES API calls count as send attempts — gate evaluations do not.
            sesAttempted++;
            try
            {
                var sendReq = new SendRawEmailRequest
                {
                    Source = mime.FromHeader,
                    Destinations = [p.PublicBusinessEmail!],
                    RawMessage = new RawMessage { Data = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(mime.RawRfc822)) },
                    Tags = mime.SesTags.Select(kv => new MessageTag { Name = kv.Key, Value = kv.Value }).ToList()
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
                await _store.UpsertProspectAsync(prepared with
                {
                    OutreachStatus = "sent",
                    LastContactedAt = DateTimeOffset.UtcNow,
                    TicketId = ticketId,
                    EmailVariant = variant,
                    CohortRunId = cohortRunId,
                    LastSesMessageId = sesRes.MessageId,
                    FollowUpStep = CreatorAcquisitionScoring.IsFollowUpDue(p, DateTimeOffset.UtcNow)
                        ? Math.Min(2, p.FollowUpStep + 1)
                        : 0,
                    NextFollowUpAt = CreatorAcquisitionScoring.IsFollowUpDue(p, DateTimeOffset.UtcNow)
                        ? (p.FollowUpStep + 1 >= 2 ? null : DateTimeOffset.UtcNow.AddDays(5))
                        : DateTimeOffset.UtcNow.AddDays(4),
                    UpdatedAt = DateTimeOffset.UtcNow
                }, cancellationToken);
                await _appDataStore.TrackEventAsync("acq_email_sent", p.ProspectId, new Dictionary<string, string?>
                {
                    ["campaign"] = campaign,
                    ["token"] = p.OpaqueToken,
                    ["variant"] = variant,
                    ["run"] = cohortRunId
                }, cancellationToken);
                sent++;
                if (p.ApprovalId is not null)
                    sentThisRunByApproval[p.ApprovalId] = extraThisRun + 1;
            }
            catch (Exception ex)
            {
                Skip(p.ProspectId, $"ses:{ex.Message}");
            }
        }

        var ramp = await _store.GetRampAsync(campaign, cancellationToken);
        var healthAfter = OutreachPolicy.HealthFromCounts(sentAll + sent, bounced, complaints, unsubs);
        var days = string.Equals(ramp.LastSendYmdEt, runYmd, StringComparison.Ordinal) ? ramp.SendingDaysAtStage : ramp.SendingDaysAtStage + (sent > 0 ? 1 : 0);
        var decision = OutreachPolicy.DecideRamp(state.RampStage, days, healthAfter, state.RampEnabled, state.MaxDailyLimit);
        await _store.SaveRampAsync(campaign, new AcqRampPersist(
            decision.Advance ? decision.NextStage : decision.CurrentStage,
            decision.Advance ? 0 : days,
            sent > 0 ? runYmd : ramp.LastSendYmdEt,
            decision.Advance ? null : decision.Reason), cancellationToken);
        var reasonCounts = OutreachPolicy.AggregateSkipReasons(reasons);
        await _store.SaveCohortRunAsync(campaign, cohortRunId, System.Text.Json.JsonSerializer.Serialize(new
        {
            runId = cohortRunId,
            sent,
            evaluated,
            sesAttempted,
            attempted = sesAttempted,
            skipped,
            dailyLimit = state.DailyLimit,
            reasonCounts,
            variantSplit = true
        }), cancellationToken);

        return new AcqWeekdaySendResult(
            true,
            sesAttempted,
            sent,
            skipped,
            reasons,
            state.DailyLimit,
            cohortRunId,
            decision.Advance ? null : decision.Reason,
            evaluated,
            sesAttempted,
            reasonCounts);
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
            NextFollowUpAt = null,
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
        var next = p with
        {
            OutreachStatus = "replied",
            NextFollowUpAt = null,
            UpdatedAt = DateTimeOffset.UtcNow,
            Notes = TrimPreview(preview)
        };
        await _store.UpsertProspectAsync(next, cancellationToken);
        _ = messageId;
        _ = inReplyTo;
        return next;
    }

    public async Task ApplySesEventAsync(string prospectId, string eventType, CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return;
        var nextStatus = eventType.ToLowerInvariant() switch
        {
            "delivery" => AdvanceOutreachStatus(p.OutreachStatus, "delivered"),
            "bounce" => "bounced",
            "complaint" => "complained",
            "reject" => "rejected",
            "click" => p.OutreachStatus, // open/click from SES is not our attributable CTA
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
            OutreachStatus = nextStatus,
            SuppressionStatus = suppression,
            NextFollowUpAt = eventType.ToLowerInvariant() is "bounce" or "complaint" or "reject"
                ? null
                : p.NextFollowUpAt,
            UpdatedAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }

    public async Task RecordFunnelAsync(string token, string eventName, CancellationToken cancellationToken)
    {
        var p = await _store.GetByTokenAsync(token, cancellationToken);
        if (p is null) return;
        var mapped = eventName.ToLowerInvariant() switch
        {
            "acq_click" => "clicked",
            "audit_started" or "demo_started" => "audit_started",
            "audit_completed" or "demo_completed" => "audit_completed",
            "pricing_viewed" or "signup_completed" => "pricing_viewed",
            "checkout_started" => "checkout_started",
            "checkout_paid" or "checkout_return_success" or "purchase_completed" => "customer",
            _ => null
        };
        if (mapped is null) return;
        var status = AdvanceOutreachStatus(p.OutreachStatus, mapped);
        await _store.UpsertProspectAsync(p with { OutreachStatus = status, UpdatedAt = DateTimeOffset.UtcNow }, cancellationToken);
        await _appDataStore.TrackEventAsync(eventName, p.ProspectId, new Dictionary<string, string?>
        {
            ["campaign"] = p.Campaign,
            ["token"] = token,
            ["yb_oid"] = token
        }, cancellationToken);
    }

    private static int StatusRank(string? status) => status?.ToLowerInvariant() switch
    {
        "sent" => 1,
        "delivered" => 2,
        "clicked" => 3,
        "audit_started" => 4,
        "audit_completed" => 5,
        "pricing_viewed" => 6,
        "checkout_started" => 7,
        "customer" => 8,
        "approved" => 0,
        "bounced" or "complained" or "rejected" => -1,
        _ => 0
    };

    /// <summary>Never downgrade funnel status (e.g. delivered must not overwrite clicked).</summary>
    private static string AdvanceOutreachStatus(string? current, string candidate)
    {
        if (StatusRank(current) < 0) return current ?? candidate;
        return StatusRank(candidate) >= StatusRank(current) ? candidate : (current ?? candidate);
    }

    public string Site() =>
        (_configuration["App:PublicSiteUrl"] ?? _configuration["PUBLIC_SITE_URL"] ?? "https://youtubeboosterai.com").TrimEnd('/');

    public string UnsubscribeUrl(string email, string hmac) =>
        $"{Site()}/api/public/acq/unsubscribe?token={WebUtility.UrlEncode(OutreachUnsubscribeToken.Create(email, hmac))}";

    private async Task<IReadOnlyList<(DateTimeOffset publishedAt, string title, string description)>> TryLoadVideosAsync(
        string handle,
        CancellationToken cancellationToken)
    {
        try
        {
            var videos = await _dashboard.GetVideosAsync(handle, 8, cancellationToken);
            return videos
                .Select(v =>
                {
                    DateTimeOffset.TryParse(v.PublishedAt, out var dt);
                    return (dt, v.Title ?? "", v.Description ?? "");
                })
                .Where(v => v.dt != default)
                .OrderByDescending(v => v.dt)
                .ToArray();
        }
        catch
        {
            return [];
        }
    }

    private static IReadOnlyList<string> ExtractEmailsFromPlainText(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return [];
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(
                     text,
                     @"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}",
                     System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            var email = m.Value.Trim().TrimEnd('.').ToLowerInvariant();
            if (!EmailAddressHelpers.LooksLikeEmail(email)) continue;
            if (email.Contains("noreply", StringComparison.OrdinalIgnoreCase) ||
                email.Contains("no-reply", StringComparison.OrdinalIgnoreCase) ||
                email.EndsWith(".png", StringComparison.Ordinal) ||
                email.EndsWith(".jpg", StringComparison.Ordinal))
                continue;
            found.Add(email);
        }
        return found.ToArray();
    }

    private static string PreferBusinessEmailLocal(IReadOnlyList<string> emails)
    {
        var preferred = emails.FirstOrDefault(e =>
            e.Contains("hello@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("contact@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("biz@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("business@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("collab@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("partnerships@", StringComparison.OrdinalIgnoreCase) ||
            e.Contains("press@", StringComparison.OrdinalIgnoreCase));
        return preferred ?? emails[0];
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> RejectAsync(
        string prospectId,
        string adminEmail,
        string? reason,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        var old = p.OutreachStatus;
        var next = p with
        {
            OutreachStatus = "rejected",
            ApprovalId = null,
            ContentHash = null,
            NextFollowUpAt = null,
            Notes = string.IsNullOrWhiteSpace(reason) ? p.Notes : TrimPreview($"Rejected: {reason}"),
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await _store.UpsertProspectAsync(next, cancellationToken);
        await AuditAsync("acq_status_change", prospectId, adminEmail, old, "rejected", reason, cancellationToken);
        return (next, null);
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> UnapproveAsync(
        string prospectId,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        if (p.LastContactedAt is not null)
            return (null, "already_sent");
        if (!string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
            && string.IsNullOrWhiteSpace(p.ApprovalId))
            return (null, "not_approved");
        var old = p.OutreachStatus;
        var next = p with
        {
            OutreachStatus = "draft_ready",
            ApprovalId = null,
            ContentHash = null,
            ApprovedBy = null,
            ApprovedAt = null,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await _store.UpsertProspectAsync(next, cancellationToken);
        await AuditAsync("acq_unapprove", prospectId, adminEmail, old, "draft_ready", null, cancellationToken);
        return (next, null);
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> OverrideCooldownAsync(
        string prospectId,
        string adminEmail,
        string? reason,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        if (p.LastContactedAt is null)
            return (null, "not_in_cooldown");
        var old = p.OutreachStatus;
        var next = p with
        {
            CooldownOverrideUntil = DateTimeOffset.UtcNow.AddHours(24),
            OutreachStatus = string.IsNullOrWhiteSpace(p.ApprovalId) ? "draft_ready" : "approved",
            Notes = TrimPreview($"Cooldown override by {adminEmail}: {reason ?? "admin override"}"),
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await _store.UpsertProspectAsync(next, cancellationToken);
        await AuditAsync("acq_cooldown_override", prospectId, adminEmail, old, next.OutreachStatus, reason, cancellationToken);
        return (next, null);
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> UpdateDraftAsync(
        string prospectId,
        string? subject,
        string? body,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        if (p.LastContactedAt is not null)
            return (null, "already_sent");
        var next = p with
        {
            Subject = string.IsNullOrWhiteSpace(subject) ? p.Subject : subject.Trim(),
            Body = string.IsNullOrWhiteSpace(body) ? p.Body : body.Trim(),
            // Editing invalidates prior approval hash — require re-approve.
            ApprovalId = null,
            ContentHash = null,
            ApprovedBy = null,
            ApprovedAt = null,
            OutreachStatus = "draft_ready",
            UpdatedAt = DateTimeOffset.UtcNow
        };
        next = next with { ContentHash = CreatorAcquisitionScoring.ContentHash(next) };
        await _store.UpsertProspectAsync(next, cancellationToken);
        await AuditAsync("acq_draft_edit", prospectId, adminEmail, p.OutreachStatus, "draft_ready", null, cancellationToken);
        return (next, null);
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> SetManualContactAsync(
        string prospectId,
        string email,
        string sourceUrl,
        bool attested,
        string adminEmail,
        string? contactName,
        string? notes,
        CancellationToken cancellationToken)
    {
        if (!attested) return (null, "attestation_required");
        if (!EmailAddressHelpers.LooksLikeEmail(email)) return (null, "invalid_email");
        if (string.IsNullOrWhiteSpace(sourceUrl) || !Uri.TryCreate(sourceUrl, UriKind.Absolute, out _))
            return (null, "source_url_required");
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        var old = p.OutreachStatus;
        var next = p with
        {
            PublicBusinessEmail = email.Trim().ToLowerInvariant(),
            ContactSourceUrl = sourceUrl.Trim(),
            ContactType = "admin_attested",
            ContactVerifiedAt = DateTimeOffset.UtcNow,
            AdminAttestedContact = true,
            ContactResearchStatus = "admin_attested",
            Notes = TrimPreview($"Admin attested contact ({contactName ?? adminEmail}): {notes ?? "manual entry"}"),
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await _store.UpsertProspectAsync(next, cancellationToken);
        await AuditAsync("acq_manual_contact", prospectId, adminEmail, old, next.OutreachStatus, notes, cancellationToken);
        if (string.IsNullOrWhiteSpace(next.Subject) || string.IsNullOrWhiteSpace(next.Body))
            next = await PrepareDraftAsync(prospectId, cancellationToken) ?? next;
        return (next, null);
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> SetStatusAsync(
        string prospectId,
        string newStatus,
        string adminEmail,
        string? reason,
        CancellationToken cancellationToken)
    {
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "discovered", "contact_needed", "draft_ready", "approved", "rejected",
            "not_qualified", "suppressed"
        };
        if (!allowed.Contains(newStatus))
            return (null, "invalid_status");
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        var old = p.OutreachStatus;
        // Dangerous: don't allow jumping to sent/customer manually.
        if (newStatus is "sent" or "customer" or "delivered")
            return (null, "dangerous_transition");
        var next = p with
        {
            OutreachStatus = newStatus.ToLowerInvariant(),
            ApprovalId = string.Equals(newStatus, "approved", StringComparison.OrdinalIgnoreCase) ? p.ApprovalId : null,
            ApprovedBy = string.Equals(newStatus, "approved", StringComparison.OrdinalIgnoreCase) ? adminEmail : null,
            ApprovedAt = string.Equals(newStatus, "approved", StringComparison.OrdinalIgnoreCase) ? DateTimeOffset.UtcNow : null,
            UpdatedAt = DateTimeOffset.UtcNow,
            Notes = string.IsNullOrWhiteSpace(reason) ? p.Notes : TrimPreview($"Status→{newStatus}: {reason}")
        };
        if (string.Equals(newStatus, "rejected", StringComparison.OrdinalIgnoreCase)
            || string.Equals(newStatus, "not_qualified", StringComparison.OrdinalIgnoreCase))
        {
            next = next with { NextFollowUpAt = null, ApprovalId = null, ContentHash = null };
        }
        await _store.UpsertProspectAsync(next, cancellationToken);
        await AuditAsync("acq_status_change", prospectId, adminEmail, old, newStatus, reason, cancellationToken);
        return (next, null);
    }

    public async Task<(bool Ok, string? Error, string? MessageId)> SendNowAsync(
        string prospectId,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (false, "not_found", null);
        var state = await LoadStateAsync(p.Campaign, cancellationToken);
        if (!state.MarketingSendingEnabled)
            return (false, "marketing_sending_disabled", null);
        var hmac = await _secrets.GetValueAsync("outreach/unsubscribe-hmac", secure: true, cancellationToken);
        if (string.IsNullOrWhiteSpace(hmac))
            return (false, "unsubscribe_signing_missing", null);

        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
            p, DateTimeOffset.UtcNow, state, alreadyContacted: p.LastContactedAt is not null);
        if (!gate.Ok)
            return (false, gate.Reason, null);

        var followUpDue = CreatorAcquisitionScoring.IsFollowUpDue(p, DateTimeOffset.UtcNow);
        if (!followUpDue && !state.StandingCampaignApproval)
        {
            var approval = p.ApprovalId is null ? null : await _store.GetApprovalAsync(p.ApprovalId, cancellationToken);
            if (approval is null || approval.ExpiresAt < DateTimeOffset.UtcNow)
                return (false, "approval_expired", null);
            if (!approval.ContentHashes.TryGetValue(p.ProspectId, out var approvedHash)
                || !string.Equals(approvedHash, CreatorAcquisitionScoring.ContentHash(p), StringComparison.Ordinal))
                return (false, "approval_invalidated", null);
        }

        var today = CreatorAcquisitionScoring.EasternDate(DateTimeOffset.UtcNow).Date;
        var runYmd = today.ToString("yyyy-MM-dd");
        var cohortRunId = $"{p.Campaign}-{runYmd}-manual";
        var variant = OutreachPolicy.PersistVariant(p.EmailVariant, p.ProspectId);
        var idem = followUpDue
            ? $"{p.ProspectId}:{cohortRunId}:fu{p.FollowUpStep}"
            : $"{p.ProspectId}:{cohortRunId}";
        if (!await _store.TryClaimIdempotencyAsync(idem, cancellationToken))
            return (false, "idempotency", null);

        if (followUpDue)
        {
            var siteFu = Site();
            var trackedFu = OutreachPolicy.BuildTrackedUrl(siteFu, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
            var (fuSubject, fuBody) = CreatorAcquisitionCopy.BuildFollowUp(
                p.FollowUpStep, p.ChannelName, p.ChannelName, p.Observation ?? "", trackedFu);
            p = p with { Subject = fuSubject, Body = fuBody, EmailVariant = variant };
        }

        var unsub = UnsubscribeUrl(p.PublicBusinessEmail!, hmac);
        var site = Site();
        var tracked = OutreachPolicy.BuildTrackedUrl(site, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
        var mime = CreatorAcquisitionMail.Build(p with { EmailVariant = variant, CohortRunId = cohortRunId }, state, site, unsub, tracked);
        if (CreatorAcquisitionMail.TagsContainPii(mime.SesTags))
            return (false, "pii_in_tags", null);

        try
        {
            var sendReq = new SendRawEmailRequest
            {
                Source = mime.FromHeader,
                Destinations = [p.PublicBusinessEmail!],
                RawMessage = new RawMessage { Data = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(mime.RawRfc822)) },
                Tags = mime.SesTags.Select(kv => new MessageTag { Name = kv.Key, Value = kv.Value }).ToList()
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
                EmailVariant = variant,
                CohortRunId = cohortRunId,
                LastSesMessageId = sesRes.MessageId,
                CooldownOverrideUntil = null,
                FollowUpStep = followUpDue ? Math.Min(2, p.FollowUpStep + 1) : 0,
                NextFollowUpAt = followUpDue
                    ? (p.FollowUpStep + 1 >= 2 ? null : DateTimeOffset.UtcNow.AddDays(5))
                    : DateTimeOffset.UtcNow.AddDays(4),
                UpdatedAt = DateTimeOffset.UtcNow
            }, cancellationToken);
            await AuditAsync("acq_send_now", prospectId, adminEmail, "approved", "sent", null, cancellationToken);
            return (true, null, sesRes.MessageId);
        }
        catch (Exception ex)
        {
            return (false, $"ses:{ex.Message}", null);
        }
    }

    public async Task<AcqApproveAndSendResult> ApproveAndSendAsync(
        string prospectId,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var existing = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (existing is null)
            return new AcqApproveAndSendResult(false, false, false, "not_found", null, null);

        var alreadyApproved = string.Equals(existing.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(existing.ApprovalId);
        if (!alreadyApproved)
        {
            var (approval, error) = await ApproveBatchAsync(
                new AcqApproveBatchRequest(
                    existing.Campaign,
                    [prospectId],
                    1,
                    "v1"),
                adminEmail,
                cancellationToken);
            if (error is not null || approval is null)
                return new AcqApproveAndSendResult(false, false, false, error ?? "approve_failed", null, existing);
        }

        var (ok, sendError, messageId) = await SendNowAsync(prospectId, adminEmail, cancellationToken);
        var row = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (!ok)
            return new AcqApproveAndSendResult(false, true, false, sendError, null, row);
        return new AcqApproveAndSendResult(true, true, true, null, messageId, row);
    }

    public async Task<AcqSendApprovedBatchResult> SendApprovedBatchAsync(
        string campaign,
        IReadOnlyList<string>? prospectIds,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var state = await LoadStateAsync(campaign, cancellationToken);
        var all = await _store.ListProspectsAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        IEnumerable<AcqProspectRecord> candidates;
        if (prospectIds is { Count: > 0 })
        {
            var idSet = prospectIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            candidates = all.Where(p => idSet.Contains(p.ProspectId));
        }
        else
        {
            candidates = all.Where(p =>
                string.Equals(p.Campaign, campaign, StringComparison.OrdinalIgnoreCase)
                && string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase));
        }

        var results = new List<AcqSendApprovedItemResult>();
        var sent = 0;
        var skipped = 0;
        foreach (var p in candidates)
        {
            if (!string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
            {
                skipped++;
                results.Add(new AcqSendApprovedItemResult(p.ProspectId, false, "not_approved", null));
                continue;
            }
            var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
                p, now, state, alreadyContacted: p.LastContactedAt is not null);
            if (!gate.Ok)
            {
                skipped++;
                results.Add(new AcqSendApprovedItemResult(p.ProspectId, false, gate.Reason, null));
                continue;
            }
            var (ok, error, messageId) = await SendNowAsync(p.ProspectId, adminEmail, cancellationToken);
            if (ok)
            {
                sent++;
                results.Add(new AcqSendApprovedItemResult(p.ProspectId, true, null, messageId));
            }
            else
            {
                skipped++;
                results.Add(new AcqSendApprovedItemResult(p.ProspectId, false, error, null));
            }
        }
        return new AcqSendApprovedBatchResult(sent, skipped, results);
    }

    private async Task AuditAsync(
        string eventName,
        string prospectId,
        string adminEmail,
        string? oldStatus,
        string? newStatus,
        string? reason,
        CancellationToken cancellationToken)
    {
        await _appDataStore.TrackEventAsync(eventName, prospectId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["creator"] = prospectId,
            ["oldStatus"] = oldStatus,
            ["newStatus"] = newStatus,
            ["reason"] = reason,
            ["at"] = DateTimeOffset.UtcNow.ToString("O")
        }, cancellationToken);
    }

    /// <summary>Re-inspect existing prospects to re-score and research public contacts (preserves IDs).</summary>
    public async Task<object> MigrateRescoreAsync(int limit, CancellationToken cancellationToken)
    {
        var all = await _store.ListProspectsAsync(cancellationToken);
        var targets = all
            .Where(p => !p.PreviewPlaceholder)
            .Where(p => p.LastContactedAt is null)
            .Where(p => !CreatorAcquisitionScoring.IsVerifiedPublicEmail(p)
                        || string.IsNullOrWhiteSpace(p.ScoreBreakdownJson)
                        || p.PriorityScore <= 0)
            .OrderByDescending(p => p.UpdatedAt)
            .Take(Math.Clamp(limit, 1, 40))
            .ToList();

        var ok = 0;
        var failed = 0;
        var verified = 0;
        foreach (var p in targets)
        {
            try
            {
                var next = await InspectAndUpsertAsync(new AcqUpsertProspectRequest(
                    ChannelInput: string.IsNullOrWhiteSpace(p.Handle) ? p.ChannelUrl : p.Handle,
                    PrimaryNiche: string.IsNullOrWhiteSpace(p.PrimaryNiche) ? "cooking" : p.PrimaryNiche,
                    Campaign: string.IsNullOrWhiteSpace(p.Campaign) ? CreatorAcquisitionCampaigns.Cook001 : p.Campaign,
                    Language: p.Language,
                    OfficialWebsite: p.OfficialWebsite,
                    PublicBusinessEmail: p.PublicBusinessEmail,
                    ContactSourceUrl: p.ContactSourceUrl,
                    ContactType: string.IsNullOrWhiteSpace(p.ContactType) ? "none" : p.ContactType,
                    Notes: p.Notes
                ), cancellationToken);
                ok++;
                if (CreatorAcquisitionScoring.IsVerifiedPublicEmail(next)) verified++;
                if (CreatorAcquisitionScoring.IsVerifiedPublicEmail(next)
                    && string.IsNullOrWhiteSpace(next.Subject))
                {
                    await PrepareDraftAsync(next.ProspectId, cancellationToken);
                }
            }
            catch
            {
                failed++;
            }
        }

        return new { inspected = ok, failed, contactVerified = verified, considered = targets.Count };
    }

    /// <summary>
    /// Invalidate unsent outreach that still uses the legacy Max/Founder template,
    /// regenerate brand-led drafts, and return them to needs-approval (draft_ready / needs_review).
    /// Does not touch already-sent emails.
    /// </summary>
    public async Task<object> MigrateBrandCopyAsync(CancellationToken cancellationToken)
    {
        var all = await _store.ListProspectsAsync(cancellationToken);
        var candidates = all
            .Where(p => !p.PreviewPlaceholder)
            .Where(p => p.LastContactedAt is null)
            .Where(p =>
            {
                var status = (p.OutreachStatus ?? "").ToLowerInvariant();
                if (status is "sent" or "delivered" or "clicked" or "replied" or "interested"
                    or "customer" or "unsubscribed" or "bounced" or "complained" or "suppressed")
                    return false;
                var legacy = CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body)
                    || !string.Equals(p.TemplateVersion, CreatorAcquisitionCopy.TemplateVersion, StringComparison.OrdinalIgnoreCase);
                // Also catch approved/queued drafts that never got TemplateVersion stamped.
                if (!legacy && string.IsNullOrWhiteSpace(p.TemplateVersion)
                    && (!string.IsNullOrWhiteSpace(p.Body) || !string.IsNullOrWhiteSpace(p.ApprovalId)))
                    legacy = true;
                return legacy;
            })
            .ToList();

        var regenerated = new List<object>();
        var skipped = new List<object>();
        foreach (var p in candidates)
        {
            var wasApproved = !string.IsNullOrWhiteSpace(p.ApprovalId)
                || string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase);
            var cleared = p with
            {
                ApprovalId = null,
                ContentHash = null,
                ApprovedBy = null,
                ApprovedAt = null,
                OutreachStatus = "draft_ready",
                UpdatedAt = DateTimeOffset.UtcNow
            };
            await _store.UpsertProspectAsync(cleared, cancellationToken);

            var next = await PrepareDraftAsync(p.ProspectId, cancellationToken) ?? cleared;
            regenerated.Add(new
            {
                prospectId = next.ProspectId,
                channelName = next.ChannelName,
                wasApproved,
                outreachStatus = next.OutreachStatus,
                templateVersion = next.TemplateVersion,
                subject = next.Subject,
                findingType = next.FindingType,
                hadLegacyCopy = CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body)
            });
        }

        return new
        {
            considered = candidates.Count,
            regenerated = regenerated.Count,
            items = regenerated,
            skipped
        };
    }

    private static string GuessLanguage(string title, IReadOnlyList<(DateTimeOffset publishedAt, string title, string description)> videos)
    {
        var blob = title + " " + string.Join(' ', videos.Select(v => v.title + " " + v.description));
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
