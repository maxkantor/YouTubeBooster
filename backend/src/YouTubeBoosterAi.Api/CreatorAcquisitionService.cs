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
    private readonly IYouTubeChannelSearch? _channelSearch;

    public CreatorAcquisitionService(
        ICreatorAcquisitionStore store,
        IAppDataStore appDataStore,
        IDemoAnalysisService demo,
        IAmazonSimpleEmailService ses,
        ISecretValueProvider secrets,
        IConfiguration configuration,
        IPublicDashboardService dashboard,
        IHttpClientFactory httpClientFactory,
        IYouTubeChannelSearch? channelSearch = null)
    {
        _store = store;
        _appDataStore = appDataStore;
        _demo = demo;
        _ses = ses;
        _secrets = secrets;
        _configuration = configuration;
        _dashboard = dashboard;
        _httpClientFactory = httpClientFactory;
        _channelSearch = channelSearch;
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

        // Prefer the admin-requested handle/URL before email matching. Demo resolution often
        // rewrites @skinnytaste → @skinnytastegina; email-only dedupe would overwrite the sibling row
        // and leave the clicked placeholder untouched (Prepare Draft no-op).
        var inputHandle = request.ChannelInput?.Trim() ?? "";
        if (!string.IsNullOrWhiteSpace(inputHandle)
            && !inputHandle.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            && !inputHandle.StartsWith('@'))
            inputHandle = "@" + inputHandle.TrimStart('@');
        var inputUrl = !string.IsNullOrWhiteSpace(inputHandle) && !inputHandle.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            ? "https://www.youtube.com/" + (inputHandle.StartsWith('@') ? inputHandle : "@" + inputHandle.TrimStart('@'))
            : (inputHandle.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? inputHandle : null);
        var resolvedChannelId = demo.ChannelId;
        if (string.IsNullOrWhiteSpace(resolvedChannelId))
        {
            var idMatch = System.Text.RegularExpressions.Regex.Match(request.ChannelInput ?? "", @"UC[a-zA-Z0-9_-]{20,}");
            if (idMatch.Success) resolvedChannelId = idMatch.Value;
        }
        var dup = await _store.FindDuplicateAsync(resolvedChannelId, inputUrl ?? url, string.IsNullOrWhiteSpace(inputHandle) ? handle : inputHandle, null, cancellationToken)
                  ?? await _store.FindDuplicateAsync(resolvedChannelId, url, handle, email, cancellationToken);
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
                    else if (string.Equals(research.Status, "review_email", StringComparison.OrdinalIgnoreCase)
                             && EmailAddressHelpers.LooksLikeEmail(research.Email)
                             && !string.IsNullOrWhiteSpace(research.SourceUrl))
                    {
                        email = research.Email;
                        contactSourceUrl = research.SourceUrl;
                        contactType = research.ContactType;
                        contactStatus = "review_email";
                        contactNextAt = now.AddDays(CreatorAcquisitionContact.BackoffDays(contactAttempts));
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
                        contactStatus = research.Status is "not_found" ? "not_found" : contactStatus;
                        contactNextAt = now.AddDays(CreatorAcquisitionContact.BackoffDays(contactAttempts));
                    }
                }
            }
            else if (!due)
            {
                contactStatus ??= "contact_needed_backoff";
            }
        }

        var language = AcquisitionTaxonomy.NormalizeLanguage(
            !string.IsNullOrWhiteSpace(dup?.Language)
                ? dup!.Language
                : string.IsNullOrWhiteSpace(request.Language) ? GuessLanguage(demo.ChannelTitle, videos) : request.Language!);
        var niche = dup is not null && !string.IsNullOrWhiteSpace(dup.PrimaryNiche)
            ? AcquisitionTaxonomy.NormalizeCategory(dup.PrimaryNiche)
            : AcquisitionTaxonomy.NormalizeCategory(request.PrimaryNiche);
        var market = AcquisitionTaxonomy.NormalizeMarket(
            !string.IsNullOrWhiteSpace(dup?.Market) ? dup.Market : (request.Market ?? dup?.Country));
        var format = AcquisitionTaxonomy.GuessContentFormat(
            (demo.TopVideos ?? []).Select(v => v.Title).Concat(videos.Select(v => v.title)));
        var strategic = request.Strategic || (dup?.Strategic == true);
        var tier = AcquisitionTaxonomy.DeriveTier(demo.SubscriberCount, strategic);
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
            ChannelId: resolvedChannelId ?? dup?.ChannelId,
            PrimaryNiche: niche,
            Language: language,
            Country: string.IsNullOrWhiteSpace(dup?.Country) ? null : dup.Country,
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
            Campaign: string.IsNullOrWhiteSpace(dup?.Campaign) ? request.Campaign : dup.Campaign,
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
            ExampleVideoTitle: placeholder ? dup?.ExampleVideoTitle : (example ?? dup?.ExampleVideoTitle),
            ContactConfidence: contactStatus == "review_email" ? "medium" : (emailVerified ? "high" : dup?.ContactConfidence),
            ContactDiscoveryResult: contactStatus == "review_email" ? "review" : (emailVerified ? "found" : dup?.ContactDiscoveryResult),
            ContactDiscoveryDetail: dup?.ContactDiscoveryDetail,
            Market: string.IsNullOrWhiteSpace(market) ? dup?.Market : market,
            CreatorTier: tier,
            ContentFormat: format == "unknown" ? (dup?.ContentFormat ?? "unknown") : format,
            Strategic: strategic,
            StrategicGoal: string.IsNullOrWhiteSpace(request.StrategicGoal) ? dup?.StrategicGoal : request.StrategicGoal
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

    public async Task<AcqDraftPrepareResult> PrepareDraftAsync(string prospectId, CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null)
            return new AcqDraftPrepareResult(null, false, "not_found");

        var requestedHandle = p.Handle;
        var requestedUrl = p.ChannelUrl;

        if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
            return new AcqDraftPrepareResult(p, false, "suppressed:" + p.SuppressionStatus);

        if (!EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail))
            return new AcqDraftPrepareResult(p, false, "missing_email");

        // Idempotent: already has a complete draft that can go to approval.
        if (!p.PreviewPlaceholder
            && !string.IsNullOrWhiteSpace(p.Subject)
            && !string.IsNullOrWhiteSpace(p.Body)
            && !string.IsNullOrWhiteSpace(p.Observation)
            && CreatorAcquisitionScoring.HasStrongPersonalization(p)
            && string.Equals(p.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase))
        {
            return new AcqDraftPrepareResult(p, true, "already_complete");
        }

        // Placeholder / missing analysis: re-inspect, then merge sibling evidence onto THIS prospect id.
        if (p.PreviewPlaceholder
            || string.Equals(p.InspectionStatus, "failed", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(p.Observation)
            || p.PriorityScore <= 0)
        {
            try
            {
                var inspected = await InspectAndUpsertAsync(new AcqUpsertProspectRequest(
                    ChannelInput: p.Handle ?? p.ChannelUrl,
                    PrimaryNiche: string.IsNullOrWhiteSpace(p.PrimaryNiche) ? "cooking" : p.PrimaryNiche,
                    Campaign: p.Campaign,
                    Language: p.Language,
                    OfficialWebsite: p.OfficialWebsite,
                    PublicBusinessEmail: p.PublicBusinessEmail,
                    ContactSourceUrl: p.ContactSourceUrl,
                    ContactType: string.IsNullOrWhiteSpace(p.ContactType) || p.ContactType == "none" ? "business" : p.ContactType,
                    Notes: p.Notes
                ), cancellationToken);

                // Inspect may land on a duplicate sibling (same email). Always continue on the requested id.
                if (!string.Equals(inspected.ProspectId, prospectId, StringComparison.OrdinalIgnoreCase))
                {
                    var original = await _store.GetProspectAsync(prospectId, cancellationToken) ?? p;
                    p = await MergeSiblingEvidenceAsync(original, cancellationToken);
                    // Also pull fresh fields from the inspect result explicitly.
                    p = MergeEvidenceFrom(p, inspected);
                }
                else
                {
                    p = inspected;
                    p = await MergeSiblingEvidenceAsync(p, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                p = await MergeSiblingEvidenceAsync(p, cancellationToken);
                if (p.PreviewPlaceholder || string.IsNullOrWhiteSpace(p.Observation))
                    return new AcqDraftPrepareResult(p, false, "inspect_failed:" + TrimPreview(ex.Message));
            }

            await _store.UpsertProspectAsync(p with
            {
                ProspectId = prospectId,
                Handle = string.IsNullOrWhiteSpace(requestedHandle) ? p.Handle : requestedHandle,
                ChannelUrl = string.IsNullOrWhiteSpace(requestedUrl) ? p.ChannelUrl : requestedUrl,
                UpdatedAt = DateTimeOffset.UtcNow
            }, cancellationToken);
            p = await _store.GetProspectAsync(prospectId, cancellationToken) ?? p;
        }
        else
        {
            // Still allow sibling merge when observation exists but personalization is weak.
            var merged = await MergeSiblingEvidenceAsync(p, cancellationToken);
            if (!ReferenceEquals(merged, p)
                || merged.SampleSize != p.SampleSize
                || !string.Equals(merged.Observation, p.Observation, StringComparison.Ordinal)
                || !string.Equals(merged.ExampleVideoTitle, p.ExampleVideoTitle, StringComparison.Ordinal))
            {
                p = merged with
                {
                    ProspectId = prospectId,
                    Handle = string.IsNullOrWhiteSpace(requestedHandle) ? merged.Handle : requestedHandle,
                    ChannelUrl = string.IsNullOrWhiteSpace(requestedUrl) ? merged.ChannelUrl : requestedUrl
                };
                await _store.UpsertProspectAsync(p, cancellationToken);
            }
        }

        if (p.PreviewPlaceholder)
            return new AcqDraftPrepareResult(p, false, "placeholder_inspection");

        // Refresh observation/improvement from stored evidence counts when available.
        var exampleTitle = p.ExampleVideoTitle;
        var sampleSize = p.SampleSize;
        var weakDescriptions = p.WeakDescriptionCount;
        var titleIssues = p.TitleIssueCount;
        string? observation = p.Observation;
        string? improvement = p.SuggestedImprovement;
        string? findingType = p.FindingType;

        if (CreatorAcquisitionScoring.TryParseObservationEvidence(
                p.Observation, out var parsedCount, out var parsedSample, out var parsedExample, out var isDesc))
        {
            if (sampleSize <= 0) sampleSize = parsedSample;
            if (isDesc) weakDescriptions = Math.Max(weakDescriptions, parsedCount);
            else titleIssues = Math.Max(titleIssues, parsedCount);
            if (string.IsNullOrWhiteSpace(exampleTitle)) exampleTitle = parsedExample;
        }

        if (string.IsNullOrWhiteSpace(exampleTitle)
            && CreatorAcquisitionScoring.TryParseObservationEvidence(
                (p.Observation ?? "") + "\n" + (p.SuggestedImprovement ?? ""), out _, out _, out var legacyExample, out _))
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
        else if (!string.IsNullOrWhiteSpace(observation))
        {
            if (string.IsNullOrWhiteSpace(improvement)
                || !improvement.Contains("For example", StringComparison.OrdinalIgnoreCase)
                || !improvement.Contains("we'd test", StringComparison.OrdinalIgnoreCase))
            {
                improvement = CreatorAcquisitionScoring.BuildImprovement(
                    Math.Max(1, titleIssues), Math.Max(1, weakDescriptions), exampleTitle);
            }
            findingType ??= observation.Contains("description", StringComparison.OrdinalIgnoreCase)
                ? (string.IsNullOrWhiteSpace(exampleTitle) ? "DESCRIPTION_OPPORTUNITY" : "DESCRIPTION_DEPTH")
                : (string.IsNullOrWhiteSpace(exampleTitle) ? "TITLE_CLARITY" : "TITLE_OPPORTUNITY");
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
            return new AcqDraftPrepareResult(weak, false, "missing_observation");
        }

        var draftProbe = p with
        {
            Observation = observation,
            SuggestedImprovement = improvement,
            FindingType = findingType,
            ExampleVideoTitle = exampleTitle,
            SampleSize = sampleSize > 0 ? sampleSize : p.SampleSize,
            WeakDescriptionCount = weakDescriptions > 0 ? weakDescriptions : p.WeakDescriptionCount,
            TitleIssueCount = titleIssues > 0 ? titleIssues : p.TitleIssueCount,
            Body = null,
            Subject = null,
            TemplateVersion = CreatorAcquisitionCopy.TemplateVersion,
            PreviewPlaceholder = false
        };
        if (!CreatorAcquisitionScoring.HasStrongPersonalization(draftProbe))
        {
            // Prefer TITLE_CLARITY / DESCRIPTION_OPPORTUNITY so counted evidence without example title still qualifies.
            draftProbe = draftProbe with
            {
                FindingType = observation!.Contains("description", StringComparison.OrdinalIgnoreCase)
                    ? "DESCRIPTION_OPPORTUNITY"
                    : "TITLE_CLARITY",
                SuggestedImprovement = improvement ?? CreatorAcquisitionScoring.BuildImprovement(
                    Math.Max(1, titleIssues), Math.Max(1, weakDescriptions), exampleTitle)
            };
        }

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
            return new AcqDraftPrepareResult(weak, false, "weak_personalization");
        }

        var site = TrackedSite();
        var trackedPath = string.IsNullOrWhiteSpace(p.TrackedPath)
            ? $"/api/public/acq/go/{p.OpaqueToken}"
            : p.TrackedPath!;
        var tracked = trackedPath.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            ? trackedPath
            : $"{site}{(trackedPath.StartsWith('/') ? trackedPath : "/" + trackedPath)}";
        var variant = OutreachPolicy.PersistVariant(p.EmailVariant, p.ProspectId);
        var subjectVariant = CreatorAcquisitionCopy.SubjectVariantCode(variant);
        var (subject, body) = CreatorAcquisitionCopy.Build(
            variant,
            p.ChannelName,
            p.ChannelName,
            observation!,
            draftProbe.SuggestedImprovement ?? improvement ?? "",
            tracked);

        // Keep already-contacted creators out of the first-touch approval queue.
        var nextStatus = p.LastContactedAt is not null
            ? (string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
                || string.Equals(p.OutreachStatus, "sent", StringComparison.OrdinalIgnoreCase)
                || string.Equals(p.OutreachStatus, "delivered", StringComparison.OrdinalIgnoreCase)
                    ? (string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase) ? "sent" : p.OutreachStatus)
                    : "sent")
            : "draft_ready";

        var next = p with
        {
            Handle = string.IsNullOrWhiteSpace(requestedHandle) ? p.Handle : requestedHandle,
            ChannelUrl = string.IsNullOrWhiteSpace(requestedUrl) ? p.ChannelUrl : requestedUrl,
            Observation = observation,
            SuggestedImprovement = draftProbe.SuggestedImprovement ?? improvement,
            FindingType = draftProbe.FindingType ?? findingType,
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
            OutreachStatus = nextStatus,
            PreviewPlaceholder = false,
            InspectionStatus = string.Equals(p.InspectionStatus, "failed", StringComparison.OrdinalIgnoreCase)
                ? "completed"
                : p.InspectionStatus,
            ApprovalId = null,
            ContentHash = null,
            ApprovedBy = null,
            ApprovedAt = null,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        next = next with { ContentHash = CreatorAcquisitionScoring.ContentHash(next) };
        await _store.UpsertProspectAsync(next, cancellationToken);
        return new AcqDraftPrepareResult(next, true, null);
    }

    private static AcqProspectRecord MergeEvidenceFrom(AcqProspectRecord target, AcqProspectRecord source) =>
        target with
        {
            ChannelName = string.IsNullOrWhiteSpace(target.ChannelName) || target.ChannelName.StartsWith('@')
                ? source.ChannelName
                : target.ChannelName,
            ChannelId = target.ChannelId ?? source.ChannelId,
            SubscriberCount = target.SubscriberCount > 0 ? target.SubscriberCount : source.SubscriberCount,
            VideoCount = target.VideoCount > 0 ? target.VideoCount : source.VideoCount,
            RecentUploadAt = target.RecentUploadAt ?? source.RecentUploadAt,
            CadenceDays = target.CadenceDays ?? source.CadenceDays,
            TypicalViewRange = target.TypicalViewRange ?? source.TypicalViewRange,
            OfficialWebsite = target.OfficialWebsite ?? source.OfficialWebsite,
            ChannelFitScore = Math.Max(target.ChannelFitScore, source.ChannelFitScore),
            AuditOpportunityScore = Math.Max(target.AuditOpportunityScore, source.AuditOpportunityScore),
            PurchaseLikelihoodScore = Math.Max(target.PurchaseLikelihoodScore, source.PurchaseLikelihoodScore),
            PriorityScore = Math.Max(target.PriorityScore, source.PriorityScore),
            InspectionStatus = source.PreviewPlaceholder ? target.InspectionStatus : "completed",
            PreviewPlaceholder = target.PreviewPlaceholder && source.PreviewPlaceholder,
            Observation = string.IsNullOrWhiteSpace(target.Observation) ? source.Observation : target.Observation,
            SuggestedImprovement = string.IsNullOrWhiteSpace(target.SuggestedImprovement) ? source.SuggestedImprovement : target.SuggestedImprovement,
            EvidenceSummary = string.IsNullOrWhiteSpace(target.EvidenceSummary) ? source.EvidenceSummary : target.EvidenceSummary,
            EvidenceAt = target.EvidenceAt ?? source.EvidenceAt,
            WeakDescriptionCount = Math.Max(target.WeakDescriptionCount, source.WeakDescriptionCount),
            TitleIssueCount = Math.Max(target.TitleIssueCount, source.TitleIssueCount),
            SampleSize = Math.Max(target.SampleSize, source.SampleSize),
            FindingType = string.IsNullOrWhiteSpace(target.FindingType) ? source.FindingType : target.FindingType,
            ExampleVideoTitle = string.IsNullOrWhiteSpace(target.ExampleVideoTitle) ? source.ExampleVideoTitle : target.ExampleVideoTitle,
            ScoreBreakdownJson = string.IsNullOrWhiteSpace(target.ScoreBreakdownJson) ? source.ScoreBreakdownJson : target.ScoreBreakdownJson,
            UpdatedAt = DateTimeOffset.UtcNow
        };

    /// <summary>
    /// Copy analysis fields from a better sibling prospect onto a thin/placeholder row.
    /// Match by verified email first, then exact handle only — never loose substring handles
    /// (e.g. detoxinista ↛ detoxinistarecipes celebrity sibling).
    /// </summary>
    private async Task<AcqProspectRecord> MergeSiblingEvidenceAsync(
        AcqProspectRecord p,
        CancellationToken cancellationToken)
    {
        if (!p.PreviewPlaceholder
            && !string.IsNullOrWhiteSpace(p.Observation)
            && p.SampleSize > 0
            && p.PriorityScore >= 70)
            return p;

        var all = await _store.ListProspectsAsync(cancellationToken);
        var email = p.PublicBusinessEmail?.Trim().ToLowerInvariant();
        var handleKey = InMemoryCreatorAcquisitionStore.NormalizeHandle(p.Handle);

        AcqProspectRecord? Pick(IEnumerable<AcqProspectRecord> pool) =>
            pool
                .Where(o => !string.Equals(o.ProspectId, p.ProspectId, StringComparison.OrdinalIgnoreCase))
                .Where(o => !o.PreviewPlaceholder)
                .Where(o => !string.IsNullOrWhiteSpace(o.Observation) && o.PriorityScore > 0)
                .OrderByDescending(o => o.PriorityScore >= 70)
                .ThenByDescending(o => o.SubscriberCount is >= 1000 and <= 100000)
                .ThenByDescending(o => o.PriorityScore)
                .ThenByDescending(o => o.SampleSize)
                .FirstOrDefault();

        AcqProspectRecord? sib = null;
        if (!string.IsNullOrWhiteSpace(email))
        {
            sib = Pick(all.Where(o =>
                string.Equals(o.PublicBusinessEmail?.Trim(), email, StringComparison.OrdinalIgnoreCase)));
        }
        if (sib is null && !string.IsNullOrWhiteSpace(handleKey))
        {
            sib = Pick(all.Where(o =>
                string.Equals(InMemoryCreatorAcquisitionStore.NormalizeHandle(o.Handle), handleKey, StringComparison.OrdinalIgnoreCase)));
        }

        if (sib is null) return p;
        return MergeEvidenceFrom(p, sib);
    }

    public async Task<AcqDraftPrepareBatchResult> PrepareDraftBatchAsync(
        AcqDraftPrepareBatchRequest request,
        CancellationToken cancellationToken)
    {
        var campaign = string.IsNullOrWhiteSpace(request.Campaign)
            ? CreatorAcquisitionCampaigns.Cook001
            : request.Campaign!.Trim();
        var all = await _store.ListProspectsAsync(cancellationToken);
        IEnumerable<AcqProspectRecord> candidates = all;

        if (request.ProspectIds is { Count: > 0 })
        {
            var idSet = request.ProspectIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            candidates = all.Where(p => idSet.Contains(p.ProspectId));
        }
        else
        {
            candidates = all.Where(p =>
                string.Equals(p.Campaign, campaign, StringComparison.OrdinalIgnoreCase));
            candidates = candidates.Where(p =>
                EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail)
                && string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase)
                && p.PriorityScore >= 0
                && (p.PreviewPlaceholder
                    || string.IsNullOrWhiteSpace(p.Subject)
                    || string.IsNullOrWhiteSpace(p.Body)
                    || string.Equals(p.OutreachStatus, "needs_review", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.OutreachStatus, "discovered", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase)
                       && (string.IsNullOrWhiteSpace(p.Subject) || string.IsNullOrWhiteSpace(p.Body))));
        }

        var list = candidates
            .OrderByDescending(p => p.PriorityScore)
            .Take(100)
            .ToList();

        var results = new List<AcqDraftPrepareBatchItem>();
        var prepared = 0;
        var failed = 0;
        var skipped = 0;
        foreach (var c in list)
        {
            // Skip NOT QUALIFIED unless force / explicit ids
            if (request.ProspectIds is null or { Count: 0 }
                && !request.Force
                && !c.PreviewPlaceholder
                && c.PriorityScore > 0
                && c.PriorityScore < 70
                && !string.IsNullOrWhiteSpace(c.Subject)
                && !string.IsNullOrWhiteSpace(c.Body))
            {
                skipped++;
                results.Add(new AcqDraftPrepareBatchItem(c.ProspectId, c.Handle, false, "not_qualified", null));
                continue;
            }

            var result = await PrepareDraftAsync(c.ProspectId, cancellationToken);
            if (result.DraftPrepared)
            {
                prepared++;
                results.Add(new AcqDraftPrepareBatchItem(
                    c.ProspectId, c.Handle, true, result.Reason, result.Prospect?.Subject));
            }
            else
            {
                failed++;
                results.Add(new AcqDraftPrepareBatchItem(
                    c.ProspectId, c.Handle, false, result.Reason ?? "failed", null));
            }
        }

        return new AcqDraftPrepareBatchResult(list.Count, prepared, failed, skipped, results);
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
            // Admin Approvals is the human gate — score / band / stale are automation-only.
            if (!string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase)
                && !p.PreviewPlaceholder
                && string.IsNullOrWhiteSpace(p.Observation))
                return (null, $"{id} inspection is incomplete.");
            if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
                return (null, $"{id} is suppressed.");
            if (OutreachPolicy.IsSpamTrapOrInvalid(p.PublicBusinessEmail))
                return (null, $"{id} email looks invalid or spamtrap.");
            if (p.LastContactedAt is not null)
                return (null, $"{id} was already contacted — use Ready to Send / follow-up, not re-approve.");
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

            if (p.Strategic)
            {
                Skip(p.ProspectId, "strategic_manual_only");
                continue;
            }
            if (AcquisitionTaxonomy.IsChinaPriorityBlocked(p.Market ?? p.Country))
            {
                Skip(p.ProspectId, "china_not_a_priority");
                continue;
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
                var siteFu = TrackedSite();
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
            var site = TrackedSite();
            var tracked = OutreachPolicy.BuildTrackedUrl(site, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
            var prepared = p with { EmailVariant = variant, CohortRunId = cohortRunId, Subject = p.Subject, Body = p.Body };
            var mime = CreatorAcquisitionMail.Build(prepared, state, Site(), unsub, tracked);
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

    /// <summary>
    /// Host for tracked acquisition click URLs. Must hit API Gateway (Amplify static hosting does not serve /api/*).
    /// </summary>
    public string TrackedSite() =>
        (_configuration["App:PublicApiUrl"]
         ?? _configuration["PUBLIC_API_URL"]
         ?? "https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com").TrimEnd('/');

    public string UnsubscribeUrl(string email, string hmac) =>
        $"{TrackedSite()}/api/public/acq/unsubscribe?token={WebUtility.UrlEncode(OutreachUnsubscribeToken.Create(email, hmac))}";

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

    private static string PreferBusinessEmailLocal(IReadOnlyList<string> emails) =>
        CreatorAcquisitionContact.PreferBusinessEmail(emails);

    public async Task<AcqEmailDiscoveryJobState> StartEmailDiscoveryAsync(
        AcqEmailDiscoveryStartRequest request,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var campaign = string.IsNullOrWhiteSpace(request.Campaign)
            ? CreatorAcquisitionCampaigns.Cook001
            : request.Campaign!.Trim();
        var all = await _store.ListProspectsAsync(cancellationToken);
        IEnumerable<AcqProspectRecord> candidates;

        if (request.ProspectIds is { Count: > 0 })
        {
            var idSet = request.ProspectIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            candidates = all.Where(p => idSet.Contains(p.ProspectId));
        }
        else
        {
            candidates = all.Where(p =>
                string.Equals(p.Campaign, campaign, StringComparison.OrdinalIgnoreCase));
            var filter = (request.Filter ?? "email_required").Trim().ToLowerInvariant();
            candidates = filter switch
            {
                "review_email" or "email_review" => candidates.Where(p =>
                    string.Equals(p.ContactResearchStatus, "review_email", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.ContactDiscoveryResult, "review", StringComparison.OrdinalIgnoreCase)),
                "not_found" => candidates.Where(p =>
                    string.Equals(p.ContactDiscoveryResult, "not_found", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.ContactResearchStatus, "not_found", StringComparison.OrdinalIgnoreCase)),
                _ => candidates.Where(NeedsEmailDiscovery)
            };
        }

        var ids = candidates
            .OrderByDescending(p => p.PriorityScore)
            .Select(p => p.ProspectId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(500)
            .ToList();

        var job = new AcqEmailDiscoveryJobState(
            JobId: "ed-" + Guid.NewGuid().ToString("N")[..12],
            Campaign: campaign,
            AdminEmail: adminEmail,
            DryRun: request.DryRun,
            ForceRetry: request.ForceRetry,
            StartedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow,
            Status: ids.Count == 0 ? "completed" : "running",
            ProspectIds: ids,
            Cursor: 0,
            Processed: 0,
            Found: 0,
            Review: 0,
            NotFound: 0,
            Failed: 0,
            Skipped: 0,
            Results: [],
            HttpFetches: 0);

        await SaveDiscoveryJobAsync(job, cancellationToken);
        await _appDataStore.TrackEventAsync("EMAIL_DISCOVERY_STARTED", job.JobId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["campaign"] = campaign,
            ["count"] = ids.Count.ToString(),
            ["dryRun"] = request.DryRun ? "true" : "false",
            ["forceRetry"] = request.ForceRetry ? "true" : "false"
        }, cancellationToken);

        if (ids.Count == 0) return job;
        return await TickEmailDiscoveryAsync(job.JobId, Math.Clamp(request.BatchSize, 1, 10), cancellationToken);
    }

    public async Task<AcqEmailDiscoveryJobState?> GetEmailDiscoveryJobAsync(string jobId, CancellationToken cancellationToken)
    {
        var json = await _store.GetCohortRunAsync(CreatorAcquisitionCampaigns.Cook001, "email-discovery-" + jobId, cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<AcqEmailDiscoveryJobState>(json, AcqJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public async Task<AcqEmailDiscoveryJobState> TickEmailDiscoveryAsync(
        string jobId,
        int batchSize,
        CancellationToken cancellationToken)
    {
        var job = await GetEmailDiscoveryJobAsync(jobId, cancellationToken)
            ?? throw new InvalidOperationException("discovery_job_not_found");
        if (!string.Equals(job.Status, "running", StringComparison.OrdinalIgnoreCase))
            return job;

        batchSize = Math.Clamp(batchSize, 1, 10);
        var results = job.Results.ToList();
        var processed = job.Processed;
        var found = job.Found;
        var review = job.Review;
        var notFound = job.NotFound;
        var failed = job.Failed;
        var skipped = job.Skipped;
        var fetches = job.HttpFetches;
        var cursor = job.Cursor;

        while (batchSize > 0 && cursor < job.ProspectIds.Count)
        {
            batchSize--;
            var prospectId = job.ProspectIds[cursor++];
            try
            {
                var item = await DiscoverEmailForProspectAsync(
                    prospectId, job.ForceRetry, job.DryRun, job.AdminEmail, cancellationToken);
                results.Add(item.Result);
                fetches += item.HttpFetches;
                processed++;
                switch (item.Result.Outcome)
                {
                    case "found": found++; break;
                    case "review": review++; break;
                    case "not_found": notFound++; break;
                    case "failed": failed++; break;
                    default: skipped++; break;
                }
            }
            catch (Exception ex)
            {
                processed++;
                failed++;
                results.Add(new AcqEmailDiscoveryItemResult(
                    prospectId, prospectId, "failed", null, null, null, null, ex.Message[..Math.Min(ex.Message.Length, 180)]));
            }
        }

        var done = cursor >= job.ProspectIds.Count;
        var next = job with
        {
            Cursor = cursor,
            Processed = processed,
            Found = found,
            Review = review,
            NotFound = notFound,
            Failed = failed,
            Skipped = skipped,
            Results = results,
            HttpFetches = fetches,
            UpdatedAt = DateTimeOffset.UtcNow,
            Status = done ? "completed" : "running"
        };
        await SaveDiscoveryJobAsync(next, cancellationToken);
        return next;
    }

    public async Task<(AcqProspectRecord? Prospect, string? Error)> AcceptDiscoveredEmailAsync(
        string prospectId,
        bool accept,
        string adminEmail,
        string? reason,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null) return (null, "not_found");
        if (!string.Equals(p.ContactResearchStatus, "review_email", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(p.ContactDiscoveryResult, "review", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(CreatorAcquisitionScoring.ContactStatusLabel(p), "review_email", StringComparison.OrdinalIgnoreCase))
            return (null, "not_in_review");

        if (!accept)
        {
            var rejected = p with
            {
                PublicBusinessEmail = null,
                ContactVerifiedAt = null,
                ContactResearchStatus = "not_found",
                ContactDiscoveryResult = "rejected",
                ContactConfidence = null,
                UpdatedAt = DateTimeOffset.UtcNow,
                Notes = TrimPreview($"Email review rejected by {adminEmail}: {reason ?? "no reason"}")
            };
            await _store.UpsertProspectAsync(rejected, cancellationToken);
            await _appDataStore.TrackEventAsync("EMAIL_DISCOVERY_FAILED", prospectId, new Dictionary<string, string?>
            {
                ["admin"] = adminEmail,
                ["reason"] = reason ?? "rejected"
            }, cancellationToken);
            return (rejected, null);
        }

        if (!EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail) || string.IsNullOrWhiteSpace(p.ContactSourceUrl))
            return (null, "review_email_incomplete");

        var accepted = p with
        {
            ContactType = string.IsNullOrWhiteSpace(p.ContactType) || p.ContactType == "none" ? "business" : p.ContactType,
            ContactVerifiedAt = DateTimeOffset.UtcNow,
            ContactResearchStatus = "verified_public",
            ContactDiscoveryResult = "found",
            ContactConfidence = "high",
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await _store.UpsertProspectAsync(accepted, cancellationToken);
        await _appDataStore.TrackEventAsync("EMAIL_MANUALLY_ACCEPTED", prospectId, new Dictionary<string, string?>
        {
            ["admin"] = adminEmail,
            ["source"] = accepted.ContactSourceUrl
        }, cancellationToken);

        if (ShouldAutoPrepareDraft(accepted))
        {
            var drafted = await PrepareDraftAsync(prospectId, cancellationToken);
            return (drafted.Prospect ?? accepted, null);
        }
        return (accepted, null);
    }

    private static bool NeedsEmailDiscovery(AcqProspectRecord p)
    {
        if (CreatorAcquisitionScoring.IsVerifiedPublicEmail(p)) return false;
        if (string.Equals(p.ContactType, "form_only", StringComparison.OrdinalIgnoreCase)) return false;
        if (string.Equals(p.OutreachStatus, "rejected", StringComparison.OrdinalIgnoreCase)) return false;
        if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase)) return false;
        return true;
    }

    private static bool ShouldAutoPrepareDraft(AcqProspectRecord p) =>
        CreatorAcquisitionScoring.IsVerifiedPublicEmail(p)
        && !string.IsNullOrWhiteSpace(p.Observation)
        && p.PriorityScore >= 70
        && string.Equals(p.InspectionStatus, "completed", StringComparison.OrdinalIgnoreCase)
        && (string.IsNullOrWhiteSpace(p.Subject) || string.IsNullOrWhiteSpace(p.Body)
            || string.Equals(p.OutreachStatus, "contact_needed", StringComparison.OrdinalIgnoreCase)
            || string.Equals(p.OutreachStatus, "discovered", StringComparison.OrdinalIgnoreCase)
            || string.Equals(p.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase));

    public async Task<AcqCreatorDiscoveryJobState> StartCreatorDiscoveryAsync(
        AcqCreatorDiscoveryStartRequest request,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        if (_channelSearch is null)
            throw new InvalidOperationException("youtube_search_unavailable");
        var category = AcquisitionTaxonomy.NormalizeCategory(request.Category);
        var language = string.IsNullOrWhiteSpace(request.Language) ? "" : AcquisitionTaxonomy.NormalizeLanguage(request.Language);
        var market = AcquisitionTaxonomy.NormalizeMarket(request.Market);
        var target = AcquisitionDiscoveryQueries.ClampTarget(request.Target);
        var campaign = string.IsNullOrWhiteSpace(request.Campaign)
            ? AcquisitionDiscoveryQueries.ResolveDiscoveryCampaign(category)
            : request.Campaign.Trim();
        var queries = AcquisitionDiscoveryQueries.QueriesFor(category, language, market);
        var job = new AcqCreatorDiscoveryJobState(
            JobId: "cd-" + Guid.NewGuid().ToString("N")[..12],
            Category: category,
            Language: language,
            Market: market,
            Tier: request.Tier,
            Campaign: campaign,
            AdminEmail: adminEmail,
            Target: target,
            StartedAt: DateTimeOffset.UtcNow,
            UpdatedAt: DateTimeOffset.UtcNow,
            Status: "running",
            Queries: queries,
            QueryIndex: 0,
            PageToken: null,
            Queue: [],
            QueueIndex: 0,
            SourcesEvaluated: 0,
            Qualified: 0,
            DuplicatesSkipped: 0,
            Added: 0,
            Failed: 0,
            Results: []);
        await SaveCreatorDiscoveryJobAsync(job, cancellationToken);
        return await TickCreatorDiscoveryAsync(job.JobId, cancellationToken);
    }

    public async Task<AcqCreatorDiscoveryJobState?> GetCreatorDiscoveryJobAsync(string jobId, CancellationToken cancellationToken)
    {
        var json = await _store.GetCohortRunAsync(CreatorAcquisitionCampaigns.Cook001, "creator-discovery-" + jobId, cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<AcqCreatorDiscoveryJobState>(json, AcqJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public async Task<AcqCreatorDiscoveryJobState> TickCreatorDiscoveryAsync(string jobId, CancellationToken cancellationToken)
    {
        var job = await GetCreatorDiscoveryJobAsync(jobId, cancellationToken)
            ?? throw new InvalidOperationException("creator_discovery_job_not_found");
        if (!string.Equals(job.Status, "running", StringComparison.OrdinalIgnoreCase))
            return job;
        if (_channelSearch is null)
            return job with { Status = "failed", UpdatedAt = DateTimeOffset.UtcNow };

        var queue = job.Queue.ToList();
        var queueIndex = job.QueueIndex;
        var queryIndex = job.QueryIndex;
        var pageToken = job.PageToken;
        var evaluated = job.SourcesEvaluated;
        var qualified = job.Qualified;
        var duplicates = job.DuplicatesSkipped;
        var added = job.Added;
        var failed = job.Failed;
        var results = job.Results.ToList();

        if (queueIndex >= queue.Count)
        {
            if (queryIndex >= job.Queries.Count)
            {
                var doneEmpty = job with
                {
                    Status = "completed",
                    UpdatedAt = DateTimeOffset.UtcNow,
                    Queue = queue,
                    QueueIndex = queueIndex
                };
                await SaveCreatorDiscoveryJobAsync(doneEmpty, cancellationToken);
                return doneEmpty;
            }

            var page = await _channelSearch.SearchAsync(
                job.Queries[queryIndex],
                AcquisitionDiscoveryQueries.RelevanceLanguage(job.Language),
                AcquisitionDiscoveryQueries.RegionCode(job.Market),
                15,
                pageToken,
                cancellationToken);
            queue = page.Hits.ToList();
            queueIndex = 0;
            pageToken = page.NextPageToken;
            if (page.Hits.Count == 0 || string.IsNullOrWhiteSpace(pageToken))
                queryIndex++;
        }

        if (queueIndex < queue.Count)
        {
            var hit = queue[queueIndex++];
            evaluated++;
            try
            {
                var skip = AcquisitionDiscoveryQueries.Qualify(
                    job.Category, job.Language, job.Market, hit.Title, hit.Description, hit.Country,
                    hit.SubscriberCount, hit.VideoCount);
                if (skip is not null)
                {
                    results.Add(new AcqCreatorDiscoveryItem(hit.ChannelId, hit.Handle, hit.Title, "skipped", skip, null));
                }
                else
                {
                    qualified++;
                    var handle = string.IsNullOrWhiteSpace(hit.Handle) ? hit.ChannelId : hit.Handle;
                    var url = "https://www.youtube.com/channel/" + hit.ChannelId;
                    var existing = await _store.FindDuplicateAsync(hit.ChannelId, url, handle, null, cancellationToken);
                    if (existing is not null)
                    {
                        duplicates++;
                        results.Add(new AcqCreatorDiscoveryItem(hit.ChannelId, existing.Handle, hit.Title, "duplicate", existing.ProspectId, existing.ProspectId));
                    }
                    else
                    {
                        var market = AcquisitionDiscoveryQueries.ReliableMarket(job.Market, hit.Country);
                        var created = await InspectAndUpsertAsync(new AcqUpsertProspectRequest(
                            ChannelInput: hit.ChannelId,
                            PrimaryNiche: job.Category,
                            Campaign: job.Campaign,
                            Language: string.IsNullOrWhiteSpace(job.Language)
                                ? AcquisitionDiscoveryQueries.DetectScriptLanguage(hit.Title + " " + (hit.Description ?? ""))
                                : job.Language,
                            OfficialWebsite: null,
                            PublicBusinessEmail: null,
                            ContactSourceUrl: null,
                            ContactType: "none",
                            Notes: $"creator-discovery {job.Category}/{job.Language}/{job.Market} {DateTime.UtcNow:yyyy-MM-dd}",
                            Market: string.IsNullOrWhiteSpace(market) ? null : market
                        ), cancellationToken);
                        added++;
                        results.Add(new AcqCreatorDiscoveryItem(
                            hit.ChannelId, created.Handle, created.ChannelName, "added", null, created.ProspectId));
                    }
                }
            }
            catch (Exception ex)
            {
                failed++;
                results.Add(new AcqCreatorDiscoveryItem(
                    hit.ChannelId, hit.Handle, hit.Title, "failed",
                    ex.Message[..Math.Min(ex.Message.Length, 180)], null));
            }
        }

        var exhausted = queryIndex >= job.Queries.Count && queueIndex >= queue.Count;
        var next = job with
        {
            QueryIndex = queryIndex,
            PageToken = pageToken,
            Queue = queue,
            QueueIndex = queueIndex,
            SourcesEvaluated = evaluated,
            Qualified = qualified,
            DuplicatesSkipped = duplicates,
            Added = added,
            Failed = failed,
            Results = results,
            UpdatedAt = DateTimeOffset.UtcNow,
            Status = added >= job.Target || exhausted ? "completed" : "running"
        };
        await SaveCreatorDiscoveryJobAsync(next, cancellationToken);
        return next;
    }

    public async Task<IReadOnlyList<AcqCampaignConfig>> ListCampaignConfigsAsync(CancellationToken cancellationToken)
    {
        var json = await _store.GetCohortRunAsync("SYSTEM", "campaign-registry", cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<AcqCampaignConfig>>(json, AcqJson.Options) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public async Task<AcqCampaignConfig> UpsertCampaignConfigAsync(AcqCampaignConfigRequest request, CancellationToken cancellationToken)
    {
        var category = AcquisitionTaxonomy.NormalizeCategory(request.Category);
        var language = AcquisitionTaxonomy.NormalizeLanguage(request.Language);
        var market = AcquisitionTaxonomy.NormalizeMarket(request.Market);
        var existing = (await ListCampaignConfigsAsync(cancellationToken)).ToList();
        var id = string.IsNullOrWhiteSpace(request.CampaignId)
            ? BuildCampaignId(request.Name, category, language, existing)
            : request.CampaignId.Trim().ToUpperInvariant();
        if (string.Equals(id, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("cook_001_is_not_replaceable");
        var sending = request.SendingEnabled == true;
        var row = new AcqCampaignConfig(
            CampaignId: id,
            Name: string.IsNullOrWhiteSpace(request.Name) ? id : request.Name.Trim(),
            Category: category,
            Language: language,
            Market: market,
            Tier: request.Tier,
            DailyLimit: OutreachPolicy.ClampDailyLimit(request.DailyLimit ?? 5),
            SendingEnabled: sending,
            CreatedAt: existing.FirstOrDefault(c => c.CampaignId == id)?.CreatedAt ?? DateTimeOffset.UtcNow);
        existing.RemoveAll(c => string.Equals(c.CampaignId, id, StringComparison.OrdinalIgnoreCase));
        existing.Add(row);
        await _store.SaveCohortRunAsync("SYSTEM", "campaign-registry",
            System.Text.Json.JsonSerializer.Serialize(existing, AcqJson.Options), cancellationToken);
        await _store.SaveCampaignFlagsAsync(id, sending, false, cancellationToken);
        return row;
    }

    private static string BuildCampaignId(string? name, string category, string language, IReadOnlyList<AcqCampaignConfig> existing)
    {
        if (!string.IsNullOrWhiteSpace(name))
        {
            var cleaned = new string(name.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
            if (cleaned.Length >= 4) return cleaned.Length <= 16 ? cleaned : cleaned[..16];
        }
        var prefix = category.ToUpperInvariant() switch
        {
            "TECHNOLOGY" => "TECH",
            "FITNESS" => "FIT",
            "BUSINESS" => "BIZ",
            "EDUCATION" => "EDU",
            "ENTERTAINMENT" => "ENT",
            "COOKING" => "COOK",
            _ => category.ToUpperInvariant()[..Math.Min(4, category.Length)]
        };
        var lang = string.IsNullOrWhiteSpace(language) ? "XX" : language.ToUpperInvariant();
        var n = 1;
        string id;
        do
        {
            id = $"{prefix}-{lang}-{n:000}";
            n++;
        } while (existing.Any(c => string.Equals(c.CampaignId, id, StringComparison.OrdinalIgnoreCase)));
        return id;
    }

    private async Task SaveCreatorDiscoveryJobAsync(AcqCreatorDiscoveryJobState job, CancellationToken cancellationToken)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(job, AcqJson.Options);
        await _store.SaveCohortRunAsync(CreatorAcquisitionCampaigns.Cook001, "creator-discovery-" + job.JobId, json, cancellationToken);
    }

    private async Task SaveDiscoveryJobAsync(AcqEmailDiscoveryJobState job, CancellationToken cancellationToken)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(job, AcqJson.Options);
        await _store.SaveCohortRunAsync(CreatorAcquisitionCampaigns.Cook001, "email-discovery-" + job.JobId, json, cancellationToken);
    }

    private async Task<(AcqEmailDiscoveryItemResult Result, int HttpFetches)> DiscoverEmailForProspectAsync(
        string prospectId,
        bool forceRetry,
        bool dryRun,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var p = await _store.GetProspectAsync(prospectId, cancellationToken);
        if (p is null)
            return (new AcqEmailDiscoveryItemResult(prospectId, "?", "failed", null, null, null, null, "not_found"), 0);

        if (CreatorAcquisitionScoring.IsVerifiedPublicEmail(p) && !forceRetry)
        {
            return (new AcqEmailDiscoveryItemResult(
                p.ProspectId, p.Handle, "skipped_existing", p.PublicBusinessEmail, p.ContactSourceUrl,
                null, p.ContactConfidence, "Existing verified email preserved."), 0);
        }

        var now = DateTimeOffset.UtcNow;
        if (!forceRetry && p.ContactResearchNextAt is not null && p.ContactResearchNextAt > now)
        {
            return (new AcqEmailDiscoveryItemResult(
                p.ProspectId, p.Handle, "skipped_backoff", null, null, null, null,
                $"Backoff until {p.ContactResearchNextAt:u}"), 0);
        }

        // Suppression / unsubscribe hard check
        if (!string.Equals(p.SuppressionStatus, "none", StringComparison.OrdinalIgnoreCase))
        {
            return (new AcqEmailDiscoveryItemResult(
                p.ProspectId, p.Handle, "skipped_suppressed", null, null, null, null, p.SuppressionStatus), 0);
        }

        var descTexts = new List<string>();
        if (!string.IsNullOrWhiteSpace(p.ChannelName)) descTexts.Add(p.ChannelName);
        if (!string.IsNullOrWhiteSpace(p.OfficialWebsite)) descTexts.Add(p.OfficialWebsite);
        if (!string.IsNullOrWhiteSpace(p.Notes)) descTexts.Add(p.Notes);

        // Light YouTube metadata pull for website links in recent titles/descriptions when possible.
        try
        {
            var videos = await TryLoadVideosAsync(p.Handle, cancellationToken);
            descTexts.AddRange(videos.Select(v => v.title + " " + v.description).Take(12));
        }
        catch
        {
            /* continue with website seed only */
        }

        using var http = _httpClientFactory.CreateClient();
        http.Timeout = TimeSpan.FromSeconds(10);
        var research = await CreatorAcquisitionContact.ResearchPublicContactAsync(
            http, p.OfficialWebsite, descTexts, cancellationToken);
        var fetches = research.SourcesChecked?.Count ?? 0;
        var attempts = p.ContactResearchAttempts + 1;
        var detailJson = System.Text.Json.JsonSerializer.Serialize(new
        {
            sourcesChecked = research.SourcesChecked,
            detail = research.Detail,
            confidence = research.Confidence,
            sourceType = research.SourceType,
            at = now
        });

        if (string.Equals(research.Status, "verified_public", StringComparison.OrdinalIgnoreCase)
            && EmailAddressHelpers.LooksLikeEmail(research.Email)
            && !string.IsNullOrWhiteSpace(research.SourceUrl)
            && !CreatorAcquisitionContact.IsPlaceholderEmail(research.Email!)
            && !CreatorAcquisitionContact.IsRejectedLocalPart(research.Email!))
        {
            var dup = await _store.FindDuplicateAsync(null, null, null, research.Email, cancellationToken);
            if (dup is not null && !string.Equals(dup.ProspectId, p.ProspectId, StringComparison.OrdinalIgnoreCase))
            {
                return (new AcqEmailDiscoveryItemResult(
                    p.ProspectId, p.Handle, "failed", research.Email, research.SourceUrl, research.SourceType,
                    research.Confidence, $"Duplicate of {dup.Handle}"), fetches);
            }

            if (EmailAddressHelpers.LooksLikeEmail(research.Email))
            {
                var outreach = await _appDataStore.GetOutreachContactAsync(research.Email!, cancellationToken);
                if (outreach is not null && (
                    string.Equals(outreach.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase)
                    || outreach.Status.Contains("bounce", StringComparison.OrdinalIgnoreCase)))
                {
                    return (new AcqEmailDiscoveryItemResult(
                        p.ProspectId, p.Handle, "failed", research.Email, research.SourceUrl, research.SourceType,
                        research.Confidence, $"Suppressed outreach status: {outreach.Status}"), fetches);
                }
            }

            if (!dryRun)
            {
                var next = p with
                {
                    PublicBusinessEmail = research.Email!.Trim().ToLowerInvariant(),
                    ContactSourceUrl = research.SourceUrl,
                    ContactType = research.ContactType,
                    ContactVerifiedAt = now,
                    OfficialWebsite = p.OfficialWebsite ?? research.OfficialWebsite,
                    ContactResearchAttempts = attempts,
                    ContactResearchLastAt = now,
                    ContactResearchNextAt = null,
                    ContactResearchStatus = "verified_public",
                    ContactConfidence = research.Confidence,
                    ContactDiscoveryDetail = detailJson,
                    ContactDiscoveryResult = "found",
                    UpdatedAt = now
                };
                await _store.UpsertProspectAsync(next, cancellationToken);
                await _appDataStore.TrackEventAsync("EMAIL_DISCOVERED", p.ProspectId, new Dictionary<string, string?>
                {
                    ["admin"] = adminEmail,
                    ["confidence"] = research.Confidence,
                    ["source"] = research.SourceUrl,
                    ["dryRun"] = "false"
                }, cancellationToken);

                var drafted = false;
                if (ShouldAutoPrepareDraft(next))
                {
                    await PrepareDraftAsync(p.ProspectId, cancellationToken);
                    drafted = true;
                }

                return (new AcqEmailDiscoveryItemResult(
                    p.ProspectId, p.Handle, "found", research.Email, research.SourceUrl, research.SourceType,
                    research.Confidence, research.Detail, drafted), fetches);
            }

            return (new AcqEmailDiscoveryItemResult(
                p.ProspectId, p.Handle, "found", research.Email, research.SourceUrl, research.SourceType,
                research.Confidence, "[dry-run] " + research.Detail), fetches);
        }

        if (string.Equals(research.Status, "review_email", StringComparison.OrdinalIgnoreCase)
            && EmailAddressHelpers.LooksLikeEmail(research.Email)
            && !string.IsNullOrWhiteSpace(research.SourceUrl))
        {
            if (!dryRun)
            {
                var next = p with
                {
                    PublicBusinessEmail = research.Email!.Trim().ToLowerInvariant(),
                    ContactSourceUrl = research.SourceUrl,
                    ContactType = research.ContactType,
                    ContactVerifiedAt = null,
                    OfficialWebsite = p.OfficialWebsite ?? research.OfficialWebsite,
                    ContactResearchAttempts = attempts,
                    ContactResearchLastAt = now,
                    ContactResearchNextAt = now.AddDays(CreatorAcquisitionContact.BackoffDays(attempts)),
                    ContactResearchStatus = "review_email",
                    ContactConfidence = research.Confidence,
                    ContactDiscoveryDetail = detailJson,
                    ContactDiscoveryResult = "review",
                    UpdatedAt = now
                };
                await _store.UpsertProspectAsync(next, cancellationToken);
                await _appDataStore.TrackEventAsync("EMAIL_DISCOVERY_REVIEW_REQUIRED", p.ProspectId, new Dictionary<string, string?>
                {
                    ["admin"] = adminEmail,
                    ["source"] = research.SourceUrl,
                    ["confidence"] = research.Confidence
                }, cancellationToken);
            }

            return (new AcqEmailDiscoveryItemResult(
                p.ProspectId, p.Handle, "review", research.Email, research.SourceUrl, research.SourceType,
                research.Confidence, (dryRun ? "[dry-run] " : "") + research.Detail), fetches);
        }

        if (!dryRun)
        {
            var next = p with
            {
                ContactResearchAttempts = attempts,
                ContactResearchLastAt = now,
                ContactResearchNextAt = now.AddDays(CreatorAcquisitionContact.BackoffDays(attempts)),
                ContactResearchStatus = research.Status is "form_only" ? "form_only" : "not_found",
                ContactType = research.ContactType is "form_only" ? "form_only" : p.ContactType,
                ContactSourceUrl = research.SourceUrl ?? p.ContactSourceUrl,
                OfficialWebsite = p.OfficialWebsite ?? research.OfficialWebsite,
                ContactConfidence = null,
                ContactDiscoveryDetail = detailJson,
                ContactDiscoveryResult = research.ContactType is "form_only" ? "form_only" : "not_found",
                UpdatedAt = now
            };
            await _store.UpsertProspectAsync(next, cancellationToken);
            await _appDataStore.TrackEventAsync("EMAIL_DISCOVERY_FAILED", p.ProspectId, new Dictionary<string, string?>
            {
                ["admin"] = adminEmail,
                ["detail"] = research.Detail
            }, cancellationToken);
        }

        return (new AcqEmailDiscoveryItemResult(
            p.ProspectId, p.Handle, "not_found", null, research.SourceUrl, research.SourceType, null,
            (dryRun ? "[dry-run] " : "") + research.Detail), fetches);
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
            if (CreatorAcquisitionContact.IsRejectedLocalPart(email) || CreatorAcquisitionContact.IsPlaceholderEmail(email))
                continue;
            if (email.EndsWith(".png", StringComparison.Ordinal) || email.EndsWith(".jpg", StringComparison.Ordinal))
                continue;
            found.Add(email);
        }
        return found.ToArray();
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
        {
            var drafted = await PrepareDraftAsync(prospectId, cancellationToken);
            next = drafted.Prospect ?? next;
        }
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

        // Hard unsubscribe / bounce from outreach contact ledger (manual cannot bypass).
        if (EmailAddressHelpers.LooksLikeEmail(p.PublicBusinessEmail))
        {
            var outreach = await _appDataStore.GetOutreachContactAsync(p.PublicBusinessEmail!, cancellationToken);
            if (outreach is not null && string.Equals(outreach.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase))
                return (false, "unsubscribed", null);
            if (outreach is not null && outreach.Status.Contains("bounce", StringComparison.OrdinalIgnoreCase))
                return (false, "hard_bounce", null);
        }

        var now = DateTimeOffset.UtcNow;
        var cooldownDays = state.CooldownDays > 0 ? state.CooldownDays : OutreachPolicy.DefaultCooldownDays;
        var inAutomationCooldown = OutreachPolicy.InCooldown(p.LastContactedAt, now, cooldownDays)
            && !CreatorAcquisitionScoring.HasActiveCooldownOverride(p, now)
            && !CreatorAcquisitionScoring.IsFollowUpDue(p, now);
        DateTimeOffset? previousCooldownExpiration = null;
        if (inAutomationCooldown && p.LastContactedAt is not null)
            previousCooldownExpiration = p.LastContactedAt.Value.AddDays(cooldownDays);

        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
            p, now, state, alreadyContacted: p.LastContactedAt is not null, AcqSendMode.ManualAdmin);
        if (!gate.Ok)
            return (false, gate.Reason, null);

        // Same daily pacing cap as weekday automation — approved leftovers stay Ready to Send.
        var allForLimit = await _store.ListProspectsAsync(cancellationToken);
        var todayEt = CreatorAcquisitionScoring.EasternDate(now).Date;
        var sentTodayCount = allForLimit.Count(x =>
            x.LastContactedAt is not null
            && CreatorAcquisitionScoring.EasternDate(x.LastContactedAt.Value).Date == todayEt);
        if (sentTodayCount >= state.DailyLimit)
            return (false, "daily_limit_reached", null);

        var followUpDue = CreatorAcquisitionScoring.IsFollowUpDue(p, now);
        if (!followUpDue && !state.StandingCampaignApproval)
        {
            var approval = p.ApprovalId is null ? null : await _store.GetApprovalAsync(p.ApprovalId, cancellationToken);
            if (approval is null || approval.ExpiresAt < now)
                return (false, "approval_expired", null);
            if (!approval.ContentHashes.TryGetValue(p.ProspectId, out var approvedHash)
                || !string.Equals(approvedHash, CreatorAcquisitionScoring.ContentHash(p), StringComparison.Ordinal))
                return (false, "approval_invalidated", null);
        }

        var today = CreatorAcquisitionScoring.EasternDate(now).Date;
        var runYmd = today.ToString("yyyy-MM-dd");
        var cohortRunId = $"{p.Campaign}-{runYmd}-manual";
        var variant = OutreachPolicy.PersistVariant(p.EmailVariant, p.ProspectId);
        var idem = followUpDue
            ? $"{p.ProspectId}:{cohortRunId}:fu{p.FollowUpStep}:manual_admin"
            : $"{p.ProspectId}:{cohortRunId}:manual_admin";
        if (!await _store.TryClaimIdempotencyAsync(idem, cancellationToken))
            return (false, "idempotency", null);

        if (followUpDue)
        {
            var siteFu = TrackedSite();
            var trackedFu = OutreachPolicy.BuildTrackedUrl(siteFu, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
            var (fuSubject, fuBody) = CreatorAcquisitionCopy.BuildFollowUp(
                p.FollowUpStep, p.ChannelName, p.ChannelName, p.Observation ?? "", trackedFu);
            p = p with { Subject = fuSubject, Body = fuBody, EmailVariant = variant };
        }

        var unsub = UnsubscribeUrl(p.PublicBusinessEmail!, hmac);
        var site = TrackedSite();
        var tracked = OutreachPolicy.BuildTrackedUrl(site, p.OpaqueToken, p.ProspectId, variant, runYmd, p.PrimaryNiche ?? "cooking");
        var mime = CreatorAcquisitionMail.Build(p with { EmailVariant = variant, CohortRunId = cohortRunId }, state, Site(), unsub, tracked);
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
            await _appDataStore.TrackEventAsync("acq_manual_send", prospectId, new Dictionary<string, string?>
            {
                ["sendMode"] = "manual_admin",
                ["admin"] = adminEmail,
                ["creator"] = prospectId,
                ["campaign"] = p.Campaign,
                ["recipientDomain"] = p.PublicBusinessEmail!.Contains('@')
                    ? p.PublicBusinessEmail[(p.PublicBusinessEmail.IndexOf('@') + 1)..]
                    : null,
                ["cooldownBypassed"] = inAutomationCooldown ? "true" : "false",
                ["previousCooldownExpiration"] = previousCooldownExpiration?.ToString("O"),
                ["messageId"] = sesRes.MessageId,
                ["oldStatus"] = "approved",
                ["newStatus"] = "sent",
                ["at"] = DateTimeOffset.UtcNow.ToString("O"),
                ["note"] = inAutomationCooldown
                    ? "MANUAL SEND — Admin manually sent approved outreach. Automation cooldown overridden."
                    : "MANUAL SEND — Admin manually sent approved outreach."
            }, cancellationToken);
            await AuditAsync("acq_send_now", prospectId, adminEmail, "approved", "sent",
                inAutomationCooldown ? "manual_admin;cooldown_bypassed" : "manual_admin", cancellationToken);
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
        var todayEt = CreatorAcquisitionScoring.EasternDate(now).Date;
        var sentTodayCount = all.Count(x =>
            x.LastContactedAt is not null
            && CreatorAcquisitionScoring.EasternDate(x.LastContactedAt.Value).Date == todayEt);
        var remaining = Math.Max(0, state.DailyLimit - sentTodayCount);
        foreach (var p in candidates)
        {
            if (!string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase))
            {
                skipped++;
                results.Add(new AcqSendApprovedItemResult(p.ProspectId, false, "not_approved", null));
                continue;
            }
            if (sent >= remaining)
            {
                skipped++;
                results.Add(new AcqSendApprovedItemResult(p.ProspectId, false, "daily_limit_reached", null));
                continue;
            }
            var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
                p, now, state, alreadyContacted: p.LastContactedAt is not null, AcqSendMode.ManualAdmin);
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
    /// Does not re-approve or re-queue already-sent emails. When includeAlreadyContacted is true,
    /// contacted prospects get brand copy regenerated for CRM preview / follow-up only.
    /// </summary>
    public async Task<object> MigrateBrandCopyAsync(CancellationToken cancellationToken, bool includeAlreadyContacted = false)
    {
        var all = await _store.ListProspectsAsync(cancellationToken);
        var candidates = all
            .Where(p => !p.PreviewPlaceholder)
            .Where(p =>
            {
                var status = (p.OutreachStatus ?? "").ToLowerInvariant();
                if (status is "customer" or "unsubscribed" or "bounced" or "complained" or "suppressed")
                    return false;
                if (!includeAlreadyContacted && p.LastContactedAt is not null)
                    return false;
                if (!includeAlreadyContacted
                    && status is "sent" or "delivered" or "clicked" or "replied" or "interested")
                    return false;

                var legacy = CreatorAcquisitionCopy.LooksLikeLegacyPersonalSender(p.Subject, p.Body)
                    || !string.Equals(p.TemplateVersion, CreatorAcquisitionCopy.TemplateVersion, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(status, "needs_review", StringComparison.OrdinalIgnoreCase);
                if (!legacy && string.IsNullOrWhiteSpace(p.TemplateVersion)
                    && (!string.IsNullOrWhiteSpace(p.Body) || !string.IsNullOrWhiteSpace(p.ApprovalId)))
                    legacy = true;
                return legacy;
            })
            .ToList();

        var regenerated = new List<object>();
        foreach (var p in candidates)
        {
            var wasApproved = !string.IsNullOrWhiteSpace(p.ApprovalId)
                || string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase);
            var alreadyContacted = p.LastContactedAt is not null;
            var priorStatus = p.OutreachStatus;

            var cleared = p with
            {
                ApprovalId = null,
                ContentHash = null,
                ApprovedBy = null,
                ApprovedAt = null,
                OutreachStatus = alreadyContacted ? (priorStatus ?? "sent") : "draft_ready",
                UpdatedAt = DateTimeOffset.UtcNow
            };
            await _store.UpsertProspectAsync(cleared, cancellationToken);

            var drafted = await PrepareDraftAsync(p.ProspectId, cancellationToken);
            var next = drafted.Prospect ?? cleared;

            if (alreadyContacted)
            {
                // Keep funnel status; never put contacted creators back into approved send queue.
                var keepStatus = priorStatus is "approved" ? "sent" : (priorStatus ?? "sent");
                if (string.Equals(next.OutreachStatus, "needs_review", StringComparison.OrdinalIgnoreCase))
                    keepStatus = "needs_review";
                else if (string.Equals(next.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase)
                         && keepStatus is "sent" or "delivered" or "clicked" or "replied" or "interested" or "approved")
                    keepStatus = keepStatus == "approved" ? "sent" : keepStatus;

                next = next with
                {
                    ApprovalId = null,
                    ApprovedBy = null,
                    ApprovedAt = null,
                    OutreachStatus = keepStatus,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
                await _store.UpsertProspectAsync(next, cancellationToken);
            }

            regenerated.Add(new
            {
                prospectId = next.ProspectId,
                channelName = next.ChannelName,
                wasApproved,
                alreadyContacted,
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
            items = regenerated
        };
    }

    private static string GuessLanguage(string title, IReadOnlyList<(DateTimeOffset publishedAt, string title, string description)> videos)
    {
        var blob = title + " " + string.Join(' ', videos.Select(v => v.title + " " + v.description));
        if (blob.Any(c => c is >= '\u0900' and <= '\u097F'))
            return "hi";
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
