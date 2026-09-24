using Amazon.SimpleEmail.Model;

namespace YouTubeBoosterAi.Api;

public sealed partial class CreatorAcquisitionService
{
    public const int Cook001ProductionDailyLimit = 100;

    public async Task<AcqCampaignConfig> EnsureCook001PersistedAsync(CancellationToken cancellationToken)
    {
        var existing = (await ReadCampaignRegistryAsync(cancellationToken)).ToList();
        var prior = existing.FirstOrDefault(c =>
            string.Equals(c.CampaignId, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase));
        var alreadyProduction = prior is not null
            && prior.DailyLimit >= Cook001ProductionDailyLimit
            && string.Equals(prior.SendingMode, "automatic", StringComparison.OrdinalIgnoreCase)
            && prior.AutoSend
            && !prior.DryRun
            && prior.AutoDiscover
            && prior.AutoFindEmails
            && prior.AutoPrepareDrafts
            && prior.AutoFollowUps;
        if (alreadyProduction)
        {
            var flagsOk = await _store.GetCampaignFlagsAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken);
            if (!flagsOk.SendingEnabled)
                await _store.SaveCampaignFlagsAsync(CreatorAcquisitionCampaigns.Cook001, true, flagsOk.ComplaintPause, cancellationToken);
            return prior!;
        }

        var flags = await _store.GetCampaignFlagsAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken);
        var row = new AcqCampaignConfig(
            CreatorAcquisitionCampaigns.Cook001,
            prior?.Name ?? "COOK-001",
            prior?.Category ?? AcquisitionTaxonomy.DefaultCategory,
            prior?.Language ?? AcquisitionTaxonomy.DefaultLanguage,
            prior?.Market ?? "",
            prior?.Tier,
            Cook001ProductionDailyLimit,
            true,
            prior?.CreatedAt is { } created && created > DateTimeOffset.UnixEpoch.AddDays(1)
                ? created
                : DateTimeOffset.UtcNow,
            SendingMode: "automatic",
            DryRun: false,
            MaxFollowUps: OutreachPolicy.DefaultMaxFollowUps,
            AutoDiscover: true,
            AutoFindEmails: true,
            AutoPrepareDrafts: true,
            AutoSend: true,
            AutoFollowUps: true);
        existing.RemoveAll(c => string.Equals(c.CampaignId, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase));
        existing.Add(row);
        await _store.SaveCohortRunAsync("SYSTEM", "campaign-registry",
            System.Text.Json.JsonSerializer.Serialize(existing, AcqJson.Options), cancellationToken);
        await _store.SaveCampaignFlagsAsync(CreatorAcquisitionCampaigns.Cook001, true, flags.ComplaintPause, cancellationToken);
        return row;
    }

    private async Task<IReadOnlyList<AcqCampaignConfig>> ReadCampaignRegistryAsync(CancellationToken cancellationToken)
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

    public async Task<AcqCampaignConfig?> FindCampaignConfigAsync(string campaign, CancellationToken cancellationToken)
    {
        var id = (campaign ?? "").Trim();
        if (string.IsNullOrWhiteSpace(id)) return null;
        var all = await ListCampaignConfigsAsync(cancellationToken);
        return all.FirstOrDefault(c => string.Equals(c.CampaignId, id, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<AcqCampaignConfig> ResolveCampaignConfigAsync(string campaign, CancellationToken cancellationToken)
    {
        var saved = await FindCampaignConfigAsync(campaign, cancellationToken);
        if (saved is not null) return saved;
        var flags = await _store.GetCampaignFlagsAsync(campaign, cancellationToken);
        if (string.Equals(campaign, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase))
        {
            return new AcqCampaignConfig(
                CreatorAcquisitionCampaigns.Cook001,
                "COOK-001",
                AcquisitionTaxonomy.DefaultCategory,
                AcquisitionTaxonomy.DefaultLanguage,
                "",
                null,
                Cook001ProductionDailyLimit,
                flags.SendingEnabled || true,
                DateTimeOffset.UnixEpoch,
                SendingMode: "automatic",
                DryRun: false,
                MaxFollowUps: OutreachPolicy.DefaultMaxFollowUps,
                AutoDiscover: true,
                AutoFindEmails: true,
                AutoPrepareDrafts: true,
                AutoSend: true,
                AutoFollowUps: true);
        }

        return new AcqCampaignConfig(
            campaign,
            campaign,
            AcquisitionTaxonomy.DefaultCategory,
            AcquisitionTaxonomy.DefaultLanguage,
            "",
            null,
            OutreachPolicy.DefaultDailyLimit,
            false,
            DateTimeOffset.UtcNow,
            SendingMode: "manual",
            DryRun: true,
            AutoSend: false);
    }

    public async Task<IReadOnlyList<AcqCampaignCard>> ListCampaignCardsAsync(CancellationToken cancellationToken)
    {
        var extra = await ListCampaignConfigsAsync(cancellationToken);
        var cookSaved = extra.FirstOrDefault(c =>
            string.Equals(c.CampaignId, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase));
        var cook = cookSaved ?? await ResolveCampaignConfigAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken);
        var ordered = new[] { cook }.Concat(extra.Where(c =>
            !string.Equals(c.CampaignId, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase)));
        var cards = new List<AcqCampaignCard>();
        foreach (var cfg in ordered)
            cards.Add(await ToCampaignCardAsync(cfg, cancellationToken));
        return cards;
    }

    public async Task<AcqCampaignConfig> UpdateCampaignSettingsAsync(
        string campaignId,
        AcqCampaignSettingsRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(campaignId))
            throw new InvalidOperationException("campaign_required");
        var id = campaignId.Trim().ToUpperInvariant();
        var existing = (await ListCampaignConfigsAsync(cancellationToken)).ToList();
        var prior = existing.FirstOrDefault(c => string.Equals(c.CampaignId, id, StringComparison.OrdinalIgnoreCase))
                    ?? await ResolveCampaignConfigAsync(id, cancellationToken);
        var mode = NormalizeSendingMode(request.SendingMode, prior.SendingMode);
        var sending = request.SendingEnabled ?? prior.SendingEnabled;
        var row = prior with
        {
            Name = string.IsNullOrWhiteSpace(request.Name) ? prior.Name : request.Name.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? prior.Category : AcquisitionTaxonomy.NormalizeCategory(request.Category),
            Language = string.IsNullOrWhiteSpace(request.Language) ? prior.Language : AcquisitionTaxonomy.NormalizeLanguage(request.Language),
            Market = request.Market is null ? prior.Market : AcquisitionTaxonomy.NormalizeMarket(request.Market),
            Tier = request.Tier ?? prior.Tier,
            DailyLimit = request.DailyLimit is null
                ? prior.DailyLimit
                : OutreachPolicy.ClampConfiguredDailyLimit(request.DailyLimit.Value),
            SendingEnabled = sending,
            SendingMode = mode,
            DryRun = request.DryRun ?? prior.DryRun,
            MaxFollowUps = request.MaxFollowUps is null
                ? prior.MaxFollowUps
                : Math.Clamp(request.MaxFollowUps.Value, 0, OutreachPolicy.DefaultMaxFollowUps),
            AutoDiscover = request.AutoDiscover ?? prior.AutoDiscover,
            AutoFindEmails = request.AutoFindEmails ?? prior.AutoFindEmails,
            AutoPrepareDrafts = request.AutoPrepareDrafts ?? prior.AutoPrepareDrafts,
            AutoSend = mode == "automatic" && (request.AutoSend ?? prior.AutoSend),
            AutoFollowUps = request.AutoFollowUps ?? prior.AutoFollowUps
        };
        existing.RemoveAll(c => string.Equals(c.CampaignId, id, StringComparison.OrdinalIgnoreCase));
        existing.Add(row);
        await _store.SaveCohortRunAsync("SYSTEM", "campaign-registry",
            System.Text.Json.JsonSerializer.Serialize(existing, AcqJson.Options), cancellationToken);
        var flags = await _store.GetCampaignFlagsAsync(id, cancellationToken);
        await _store.SaveCampaignFlagsAsync(id, sending, flags.ComplaintPause, cancellationToken);
        return row;
    }

    public async Task<AcqSendPreviewResult> PreviewSendAsync(AcqSendPreviewRequest request, CancellationToken cancellationToken)
    {
        var campaign = string.IsNullOrWhiteSpace(request.Campaign)
            ? CreatorAcquisitionCampaigns.Cook001
            : request.Campaign.Trim();
        var cfg = await ResolveCampaignConfigAsync(campaign, cancellationToken);
        var state = await LoadStateAsync(campaign, cancellationToken);
        var all = await _store.ListProspectsAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var today = CreatorAcquisitionScoring.EasternDate(now).Date;
        var sentToday = all.Count(p => p.LastContactedAt is not null && CreatorAcquisitionScoring.EasternDate(p.LastContactedAt.Value).Date == today);
        var remaining = await CapRemainingByProviderAsync(Math.Max(0, state.DailyLimit - sentToday), cancellationToken);

        IEnumerable<AcqProspectRecord> selected;
        if (request.ProspectIds is { Count: > 0 })
        {
            var idSet = request.ProspectIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            selected = all.Where(p => idSet.Contains(p.ProspectId));
        }
        else if (request.SelectAllEligible)
        {
            selected = all.Where(p =>
                string.Equals(p.Campaign, campaign, StringComparison.OrdinalIgnoreCase)
                && MatchesCampaignAudience(p, cfg)
                && (string.Equals(p.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)));
        }
        else
        {
            selected = [];
        }

        var items = new List<AcqSendPreviewItem>();
        var already = 0;
        var unsub = 0;
        var cooldown = 0;
        var invalid = 0;
        var other = 0;
        var eligible = 0;
        var reasonCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var p in selected)
        {
            var reason = await EvaluateLiveEligibilityAsync(p, all, state, now, cancellationToken, request.ApproveFirst);
            if (reason is null)
            {
                eligible++;
                items.Add(new AcqSendPreviewItem(p.ProspectId, true, null, "Ready to send"));
                continue;
            }
            var bucket = AcqSendGuard.ClassifyPreviewBucket(reason);
            switch (bucket)
            {
                case "alreadyContacted": already++; break;
                case "unsubscribed": unsub++; break;
                case "cooldown": cooldown++; break;
                case "invalid": invalid++; break;
                default: other++; break;
            }
            var code = OutreachPolicy.NormalizeSkipReason(reason);
            reasonCounts[code] = reasonCounts.GetValueOrDefault(code) + 1;
            items.Add(new AcqSendPreviewItem(p.ProspectId, false, reason, AcqSendGuard.HumanSkipReason(reason)));
        }

        var willSend = Math.Min(eligible, remaining);
        return new AcqSendPreviewResult(
            campaign,
            items.Count,
            eligible,
            already,
            unsub,
            cooldown,
            invalid,
            other,
            state.DailyLimit,
            sentToday,
            remaining,
            willSend,
            cfg.DryRun || request.DryRun,
            cfg.SendingMode,
            reasonCounts,
            items);
    }

    public async Task<AcqBulkSendJobState> StartBulkSendAsync(
        AcqBulkSendStartRequest request,
        string adminEmail,
        CancellationToken cancellationToken)
    {
        var campaign = string.IsNullOrWhiteSpace(request.Campaign)
            ? CreatorAcquisitionCampaigns.Cook001
            : request.Campaign.Trim();
        if (campaign.Length > 32 || campaign.Any(c => !(char.IsLetterOrDigit(c) || c is '-' or '_')))
            throw new InvalidOperationException("invalid_campaign");

        var preview = await PreviewSendAsync(new AcqSendPreviewRequest(
            campaign, request.ProspectIds, request.SelectAllEligible, request.DryRun, request.ApproveFirst), cancellationToken);
        var ids = preview.Items.Where(i => i.Eligible).Select(i => i.ProspectId).ToList();
        if (ids.Count > OutreachPolicy.ConfiguredMaxDailyLimit)
            ids = ids.Take(OutreachPolicy.ConfiguredMaxDailyLimit).ToList();

        if (request.ApproveFirst && ids.Count > 0)
        {
            foreach (var chunk in ids.Chunk(MaxBatchApprove))
            {
                var (approval, error) = await ApproveBatchAsync(
                    new AcqApproveBatchRequest(campaign, chunk.ToArray(), chunk.Length, "v1"),
                    adminEmail,
                    cancellationToken);
                if (error is not null && approval is null)
                    throw new InvalidOperationException(error);
            }
        }

        var job = new AcqBulkSendJobState(
            "bs-" + Guid.NewGuid().ToString("N")[..12],
            campaign,
            "manual",
            adminEmail,
            preview.DryRun,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            "running",
            ids,
            0,
            preview.Selected,
            ids.Count,
            0,
            0,
            0,
            ids.Count,
            preview.ReasonCounts,
            [],
            null);
        await SaveBulkSendJobAsync(job, cancellationToken);
        return job;
    }

    public async Task<AcqBulkSendJobState?> GetBulkSendJobAsync(string jobId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(jobId) || jobId.Length > 40) return null;
        var json = await _store.GetCohortRunAsync(CreatorAcquisitionCampaigns.Cook001, "bulk-send-" + jobId.Trim(), cancellationToken);
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<AcqBulkSendJobState>(json, AcqJson.Options);
        }
        catch
        {
            return null;
        }
    }

    public async Task<AcqBulkSendJobState> TickBulkSendAsync(string jobId, CancellationToken cancellationToken)
    {
        var job = await GetBulkSendJobAsync(jobId, cancellationToken)
                  ?? throw new InvalidOperationException("job_not_found");
        if (job.Status is "complete" or "failed")
            return job;

        var deadline = DateTime.UtcNow.AddSeconds(DispatchTickBudgetSeconds);
        var results = job.Results.ToList();
        var reasons = new Dictionary<string, int>(job.ReasonCounts, StringComparer.Ordinal);
        var sent = job.Sent;
        var skipped = job.Skipped;
        var failed = job.Failed;
        var cursor = job.Cursor;
        var ids = job.ProspectIds;

        while (cursor < ids.Count && DateTime.UtcNow < deadline)
        {
            var id = ids[cursor];
            cursor++;
            if (job.DryRun)
            {
                skipped++;
                results.Add(new AcqBulkSendItem(id, "skipped", "dry_run", null));
                reasons["DRY_RUN"] = reasons.GetValueOrDefault("DRY_RUN") + 1;
                continue;
            }

            var (ok, error, messageId) = await SendNowAsync(id, job.AdminEmail, cancellationToken);
            if (ok)
            {
                sent++;
                results.Add(new AcqBulkSendItem(id, "sent", null, messageId));
            }
            else if (string.Equals(error, AcqSendGuard.ReasonAlreadyProcessing, StringComparison.OrdinalIgnoreCase)
                     || string.Equals(error, AcqSendGuard.ReasonAlreadyContacted, StringComparison.OrdinalIgnoreCase)
                     || string.Equals(error, "idempotency", StringComparison.OrdinalIgnoreCase))
            {
                skipped++;
                var code = OutreachPolicy.NormalizeSkipReason(error);
                reasons[code] = reasons.GetValueOrDefault(code) + 1;
                results.Add(new AcqBulkSendItem(id, "skipped", error, null));
            }
            else if ((error ?? "").StartsWith("ses:", StringComparison.OrdinalIgnoreCase))
            {
                failed++;
                reasons["SES_ERROR"] = reasons.GetValueOrDefault("SES_ERROR") + 1;
                results.Add(new AcqBulkSendItem(id, "failed", error, null));
            }
            else
            {
                skipped++;
                var code = OutreachPolicy.NormalizeSkipReason(error);
                reasons[code] = reasons.GetValueOrDefault(code) + 1;
                results.Add(new AcqBulkSendItem(id, "skipped", error, null));
            }
        }

        var done = cursor >= ids.Count;
        var next = job with
        {
            Cursor = cursor,
            Sent = sent,
            Skipped = skipped,
            Failed = failed,
            Remaining = Math.Max(0, ids.Count - cursor),
            ReasonCounts = reasons,
            Results = results,
            Status = done ? "complete" : "running",
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await SaveBulkSendJobAsync(next, cancellationToken);
        return next;
    }

    public async Task<AcqWeekdaySendResult> RunScheduledAcquisitionAsync(CancellationToken cancellationToken)
    {
        var first = await RunWeekdaySendAsync(CreatorAcquisitionCampaigns.Cook001, cancellationToken);
        var extras = await ListCampaignConfigsAsync(cancellationToken);
        foreach (var cfg in extras)
        {
            if (string.Equals(cfg.CampaignId, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase))
                continue;
            if (!cfg.SendingEnabled) continue;
            if (cancellationToken.IsCancellationRequested) break;
            await RunWeekdaySendAsync(cfg.CampaignId, cancellationToken);
        }
        return first;
    }

    internal async Task<(int Discovered, int EmailsFound, int DraftsPrepared)> ReplenishCampaignInventoryAsync(
        AcqCampaignConfig cfg,
        int remaining,
        CancellationToken cancellationToken)
    {
        var discovered = 0;
        var emailsFound = 0;
        var drafts = 0;
        if (remaining <= 0) return (0, 0, 0);

        var all = await _store.ListProspectsAsync(cancellationToken);
        var ready = all.Count(p =>
            string.Equals(p.Campaign, cfg.CampaignId, StringComparison.OrdinalIgnoreCase)
            && MatchesCampaignAudience(p, cfg)
            && (string.Equals(p.OutreachStatus, "approved", StringComparison.OrdinalIgnoreCase)
                || (string.Equals(cfg.SendingMode, "automatic", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(p.OutreachStatus, "draft_ready", StringComparison.OrdinalIgnoreCase))));

        if (cfg.AutoPrepareDrafts && ready < remaining)
        {
            var batch = await PrepareDraftBatchAsync(new AcqDraftPrepareBatchRequest(cfg.CampaignId, null, "email_found", false), cancellationToken);
            drafts = batch.Prepared;
            ready += batch.Prepared;
        }

        if (cfg.AutoFindEmails && ready < remaining)
        {
            try
            {
                var job = await StartEmailDiscoveryAsync(
                    new AcqEmailDiscoveryStartRequest(cfg.CampaignId, null, "email_required", false, false, 3),
                    "scheduler",
                    cancellationToken);
                emailsFound = job.Found;
            }
            catch
            {
                // Discovery start is best-effort inside the send tick.
            }
        }

        if (cfg.AutoDiscover && ready < remaining)
        {
            try
            {
                var job = await StartCreatorDiscoveryAsync(
                    new AcqCreatorDiscoveryStartRequest(
                        cfg.Category,
                        cfg.Language,
                        string.IsNullOrWhiteSpace(cfg.Market) ? null : cfg.Market,
                        cfg.Tier,
                        Math.Min(20, Math.Max(5, remaining - ready)),
                        cfg.CampaignId),
                    "scheduler",
                    cancellationToken);
                if (string.Equals(job.Status, "running", StringComparison.OrdinalIgnoreCase))
                    job = await TickCreatorDiscoveryAsync(job.JobId, cancellationToken);
                discovered = job.Added;
            }
            catch
            {
            }
        }

        return (discovered, emailsFound, drafts);
    }

    internal static bool MatchesCampaignAudience(AcqProspectRecord p, AcqCampaignConfig cfg)
    {
        if (string.Equals(cfg.CampaignId, CreatorAcquisitionCampaigns.Cook001, StringComparison.OrdinalIgnoreCase))
        {
            return string.Equals(p.PrimaryNiche, "cooking", StringComparison.OrdinalIgnoreCase)
                   || string.IsNullOrWhiteSpace(p.PrimaryNiche);
        }

        if (!string.IsNullOrWhiteSpace(cfg.Category)
            && !string.Equals(p.PrimaryNiche, cfg.Category, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(AcquisitionTaxonomy.NormalizeCategory(p.PrimaryNiche), cfg.Category, StringComparison.OrdinalIgnoreCase))
            return false;
        if (!string.IsNullOrWhiteSpace(cfg.Language)
            && !string.Equals(p.Language, cfg.Language, StringComparison.OrdinalIgnoreCase))
            return false;
        if (!string.IsNullOrWhiteSpace(cfg.Market)
            && !string.Equals(p.Market ?? p.Country ?? "", cfg.Market, StringComparison.OrdinalIgnoreCase))
            return false;
        return true;
    }

    internal static string NormalizeSendingMode(string? requested, string fallback)
    {
        var raw = (requested ?? fallback ?? "manual").Trim().ToLowerInvariant();
        return raw is "automatic" or "auto" ? "automatic" : "manual";
    }

    internal async Task<bool> ClaimOutreachIdentityAsync(AcqProspectRecord p, bool followUpDue, CancellationToken cancellationToken)
    {
        var step = followUpDue ? Math.Max(1, p.FollowUpStep + 1) : 0;
        var keys = AcqSendGuard.IdempotencyKeys(p.Campaign, p.PublicBusinessEmail, p.ChannelId, step);
        foreach (var key in keys)
        {
            if (!await _store.TryClaimIdempotencyAsync(key, cancellationToken))
                return false;
        }
        return true;
    }

    public async Task<bool> IsGloballyUnsubscribedAsync(string email, CancellationToken cancellationToken)
    {
        var code = await GlobalSuppressionBlockAsync(email, cancellationToken);
        return code is AcqSendGuard.ReasonGlobalUnsub;
    }

    internal async Task<string?> GlobalSuppressionBlockAsync(string? email, CancellationToken cancellationToken)
    {
        var normalized = AcqSendGuard.NormalizeEmail(email);
        if (string.IsNullOrWhiteSpace(normalized)) return null;
        var json = await _store.GetCohortRunAsync("SYSTEM", AcqSendGuard.SuppressionLedgerRunId(normalized), cancellationToken);
        var row = AcqSendGuard.ParseLedger(json);
        if (row is not null)
            return AcqSendGuard.LedgerReasonToCode(row.Reason);
        var outreach = await _appDataStore.GetOutreachContactAsync(normalized, cancellationToken);
        if (outreach is not null && string.Equals(outreach.Status, "unsubscribed", StringComparison.OrdinalIgnoreCase))
            return AcqSendGuard.ReasonGlobalUnsub;
        if (outreach is not null && outreach.Status.Contains("bounce", StringComparison.OrdinalIgnoreCase))
            return AcqSendGuard.ReasonGlobalBounce;
        return null;
    }

    internal async Task SaveSuppressionLedgerAsync(string email, string reason, string source, CancellationToken cancellationToken)
    {
        var normalized = AcqSendGuard.NormalizeEmail(email);
        if (string.IsNullOrWhiteSpace(normalized)) return;
        var existing = AcqSendGuard.ParseLedger(
            await _store.GetCohortRunAsync("SYSTEM", AcqSendGuard.SuppressionLedgerRunId(normalized), cancellationToken));
        if (existing is not null) return;
        await _store.SaveCohortRunAsync(
            "SYSTEM",
            AcqSendGuard.SuppressionLedgerRunId(normalized),
            AcqSendGuard.FormatLedger(new AcqSuppressionRecord(normalized, reason, DateTimeOffset.UtcNow, source)),
            cancellationToken);
    }

    internal async Task<AcqProspectRecord> ApplyGlobalSuppressionToProspectAsync(AcqProspectRecord record, CancellationToken cancellationToken)
    {
        var block = await GlobalSuppressionBlockAsync(record.PublicBusinessEmail, cancellationToken);
        if (block is null) return record;
        return record with
        {
            SuppressionStatus = block == AcqSendGuard.ReasonGlobalUnsub ? "unsubscribed"
                : block == AcqSendGuard.ReasonGlobalBounce ? "bounced"
                : block == AcqSendGuard.ReasonGlobalComplaint ? "complained"
                : "suppressed",
            OutreachStatus = block == AcqSendGuard.ReasonGlobalUnsub ? "unsubscribed" : record.OutreachStatus,
            NextFollowUpAt = null
        };
    }

    internal async Task<int> CapRemainingByProviderAsync(int remaining, CancellationToken cancellationToken)
    {
        if (remaining <= 0) return 0;
        try
        {
            var quota = await _ses.GetSendQuotaAsync(cancellationToken);
            var left = (int)Math.Max(0, Math.Floor(quota.Max24HourSend - quota.SentLast24Hours));
            if (quota.MaxSendRate is > 0 and < 1)
                return Math.Min(remaining, 1);
            return Math.Min(remaining, left);
        }
        catch
        {
            return remaining;
        }
    }

    internal async Task<string?> EvaluateLiveEligibilityAsync(
        AcqProspectRecord p,
        IReadOnlyList<AcqProspectRecord> all,
        AcqCampaignState state,
        DateTimeOffset now,
        CancellationToken cancellationToken,
        bool approveFirst = false)
    {
        if (AcqSendGuard.IsStoppedOutreachStatus(p.OutreachStatus, p.SuppressionStatus))
            return AcqSendGuard.SuppressionReasonCode(p.SuppressionStatus == "none" ? p.OutreachStatus : p.SuppressionStatus);
        var ledger = await GlobalSuppressionBlockAsync(p.PublicBusinessEmail, cancellationToken);
        if (ledger is not null) return ledger;
        var followUpDue = CreatorAcquisitionScoring.IsFollowUpDue(p, now);
        var history = AcqSendGuard.HistoryBlockReason(all, p, followUpDue);
        if (history is not null) return history;
        var mode = state.StandingCampaignApproval || approveFirst ? AcqSendMode.ManualAdmin : AcqSendMode.ManualAdmin;
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
            p, now, state, alreadyContacted: p.LastContactedAt is not null, AcqSendMode.ManualAdmin);
        if (!gate.Ok)
        {
            if (approveFirst && string.Equals(gate.Reason, "not_approved", StringComparison.OrdinalIgnoreCase))
                return null;
            if (state.StandingCampaignApproval && string.Equals(gate.Reason, "not_approved", StringComparison.OrdinalIgnoreCase))
                return null;
            return gate.Reason;
        }
        _ = mode;
        return null;
    }

    public static string WhyNotSentCode(
        AcqProspectRecord p,
        DateTimeOffset now,
        AcqCampaignState state,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        if (all is not null)
        {
            var history = AcqSendGuard.HistoryBlockReason(all, p, CreatorAcquisitionScoring.IsFollowUpDue(p, now));
            if (history is not null)
                return OutreachPolicy.NormalizeSkipReason(history);
        }
        if (p.LastContactedAt is not null && !CreatorAcquisitionScoring.IsFollowUpDue(p, now))
            return "ALREADY_CONTACTED";
        if (AcqSendGuard.IsStoppedOutreachStatus(p.OutreachStatus, p.SuppressionStatus))
            return OutreachPolicy.NormalizeSkipReason(
                AcqSendGuard.SuppressionReasonCode(p.SuppressionStatus == "none" ? p.OutreachStatus : p.SuppressionStatus));
        if (string.IsNullOrWhiteSpace(p.PublicBusinessEmail))
            return "NO_PUBLIC_EMAIL_FOUND";
        if (!CreatorAcquisitionScoring.IsVerifiedPublicEmail(p) || OutreachPolicy.IsSpamTrapOrInvalid(p.PublicBusinessEmail))
            return "INVALID_EMAIL";
        if (state.ComplaintPause || state.RampBlockReason is "bounce_rate" or "complaint_rate")
            return "SAFETY_PAUSED";
        if (!state.MarketingSendingEnabled) return "CAMPAIGN_DISABLED";
        var gate = CreatorAcquisitionScoring.ExplainSendEligibility(
            p, now, state, alreadyContacted: p.LastContactedAt is not null, AcqSendMode.Automated);
        if (gate.Ok) return "READY_TO_SEND";
        if (string.Equals(gate.Reason, "not_approved", StringComparison.OrdinalIgnoreCase))
            return state.StandingCampaignApproval ? "READY_TO_SEND" : "MANUAL_APPROVAL_REQUIRED";
        return OutreachPolicy.NormalizeSkipReason(gate.Reason);
    }

    public static string SendLaneFor(
        AcqProspectRecord p,
        DateTimeOffset now,
        AcqCampaignState state,
        IReadOnlyList<AcqProspectRecord>? all = null)
    {
        var why = WhyNotSentCode(p, now, state, all);
        if (p.LastContactedAt is not null) return "sent";
        if (why is "ALREADY_CONTACTED" or "DUPLICATE_EMAIL" or "DUPLICATE_CHANNEL") return "sent";
        if (why == "READY_TO_SEND") return "ready_to_send";
        if (why is "MANUAL_APPROVAL_REQUIRED") return "needs_approval";
        if (CreatorAcquisitionScoring.IsReadyForApproval(p)) return "needs_approval";
        return "other";
    }

    public async Task<AcqProviderQuota> GetProviderQuotaAsync(CancellationToken cancellationToken)
    {
        try
        {
            var quota = await _ses.GetSendQuotaAsync(cancellationToken);
            var remaining = (int)Math.Max(0, Math.Floor(quota.Max24HourSend - quota.SentLast24Hours));
            return new AcqProviderQuota(
                (int)Math.Floor(quota.Max24HourSend),
                (int)Math.Floor(quota.SentLast24Hours),
                remaining,
                true);
        }
        catch
        {
            return new AcqProviderQuota(0, 0, 0, false);
        }
    }

    private async Task<AcqCampaignCard> ToCampaignCardAsync(AcqCampaignConfig cfg, CancellationToken cancellationToken)
    {
        var state = await LoadStateAsync(cfg.CampaignId, cancellationToken);
        var all = await _store.ListProspectsAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var today = CreatorAcquisitionScoring.EasternDate(now).Date;
        var scoped = all.Where(p => string.Equals(p.Campaign, cfg.CampaignId, StringComparison.OrdinalIgnoreCase)).ToList();
        var sentToday = scoped.Count(p => p.LastContactedAt is not null && CreatorAcquisitionScoring.EasternDate(p.LastContactedAt.Value).Date == today);
        var remaining = Math.Max(0, state.DailyLimit - sentToday);
        var ready = scoped.Count(p => SendLaneFor(p, now, state, all) == "ready_to_send");
        var needs = scoped.Count(p => SendLaneFor(p, now, state, all) == "needs_approval");
        var replies = scoped.Count(p => string.Equals(p.OutreachStatus, "replied", StringComparison.OrdinalIgnoreCase));
        var unsubs = scoped.Count(p => string.Equals(p.SuppressionStatus, "unsubscribed", StringComparison.OrdinalIgnoreCase));
        string status;
        string? reason = null;
        if (state.ComplaintPause || !string.IsNullOrWhiteSpace(state.RampBlockReason) && state.RampBlockReason is "bounce_rate" or "complaint_rate")
        {
            status = "SAFETY_PAUSED";
            reason = "Deliverability threshold exceeded";
        }
        else if (!state.MarketingSendingEnabled)
        {
            status = "PAUSED";
            reason = "Sending is off";
        }
        else
        {
            status = "ACTIVE";
        }

        return new AcqCampaignCard(
            cfg.CampaignId,
            cfg.Name,
            cfg.Category,
            cfg.Language,
            cfg.Market,
            cfg.Tier,
            state.DailyLimit,
            sentToday,
            remaining,
            ready,
            needs,
            replies,
            unsubs,
            state.MarketingSendingEnabled,
            cfg.SendingMode,
            cfg.DryRun,
            cfg.AutoDiscover,
            cfg.AutoFindEmails,
            cfg.AutoPrepareDrafts,
            cfg.AutoSend,
            cfg.AutoFollowUps,
            cfg.MaxFollowUps,
            status,
            reason,
            CreatorAcquisitionScoring.NextWeekdaySendEastern(now).ToString("O"),
            cfg.CreatedAt);
    }

    private async Task SaveBulkSendJobAsync(AcqBulkSendJobState job, CancellationToken cancellationToken)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(job, AcqJson.Options);
        await _store.SaveCohortRunAsync(CreatorAcquisitionCampaigns.Cook001, "bulk-send-" + job.JobId, json, cancellationToken);
    }
}
