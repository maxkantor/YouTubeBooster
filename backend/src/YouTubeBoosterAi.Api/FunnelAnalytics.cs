namespace YouTubeBoosterAi.Api;

/// <summary>
/// Funnel analytics: unique actors vs raw events, identity stitching, conversion math.
/// </summary>
public static class FunnelAnalytics
{
    public static readonly (string Key, string Label, string[] EventNames)[] OrderedSteps =
    [
        ("landing_page_view", "Landing page view", ["landing_page_view"]),
        ("audit_url_entered", "Audit URL entered", ["audit_url_entered"]),
        ("demo_started", "Demo started", ["demo_started"]),
        ("demo_completed", "Demo completed", ["demo_completed"]),
        ("signup_started", "Signup started", ["signup_started"]),
        ("signup_completed", "Signup completed", ["signup_completed", "cognito_user_provisioned"]),
        ("login_completed", "Login completed", ["login_completed", "user_login"]),
        ("checkout_started", "Checkout started", ["checkout_started"]),
        ("payment_succeeded_live", "Payment succeeded (live)", ["payment_succeeded_live"]),
        ("payment_succeeded_test", "Payment succeeded (test)", ["payment_succeeded_test"]),
        ("entitlement_granted_live", "Entitlement granted (live)", ["entitlement_granted_live", "entitlement_granted"]),
        ("contact_submitted", "Contact submitted", ["contact_submitted"])
    ];

    public static DateTimeOffset? RangeStartUtc(string? range, DateTimeOffset now) =>
        (range ?? "30d").Trim().ToLowerInvariant() switch
        {
            "today" => new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero),
            "7d" => now.AddDays(-7),
            "30d" => now.AddDays(-30),
            "all" => null,
            _ => now.AddDays(-30)
        };

    public static bool InRange(DateTimeOffset createdAt, DateTimeOffset? rangeStart, DateTimeOffset now) =>
        rangeStart is null || (createdAt >= rangeStart && createdAt <= now);

    public static IReadOnlyList<AdminActivityEventDto> FilterByRange(
        IReadOnlyList<AdminActivityEventDto> events,
        string range,
        DateTimeOffset now)
    {
        var start = RangeStartUtc(range, now);
        return events.Where(e => InRange(e.CreatedAt, start, now)).ToArray();
    }

    public static string ResolveActorKey(AdminActivityEventDto evt, IReadOnlyDictionary<string, string> anonToCanonical)
    {
        var meta = evt.Metadata ?? new Dictionary<string, string?>();
        string? Pick(params string[] keys)
        {
            foreach (var key in keys)
            {
                if (meta.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v)) return v.Trim();
            }
            return null;
        }

        var userId = Pick("userId");
        if (string.IsNullOrWhiteSpace(userId) && evt.Scope.StartsWith("user_", StringComparison.Ordinal))
        {
            userId = evt.Scope;
        }

        var cognitoSub = Pick("cognitoSub", "sub");
        var emailHash = Pick("email_hash", "emailHash");
        var anonymousId = Pick("anonymousId", "anonymous_id");

        if (!string.IsNullOrWhiteSpace(userId)) return Canonicalize($"user:{userId}", anonToCanonical);
        if (!string.IsNullOrWhiteSpace(cognitoSub)) return Canonicalize($"sub:{cognitoSub}", anonToCanonical);
        if (!string.IsNullOrWhiteSpace(emailHash)) return Canonicalize($"email:{emailHash}", anonToCanonical);
        if (!string.IsNullOrWhiteSpace(anonymousId)) return Canonicalize($"anon:{anonymousId}", anonToCanonical);

        if (!string.IsNullOrWhiteSpace(evt.Scope))
        {
            if (evt.Scope.StartsWith("user_", StringComparison.Ordinal))
            {
                return Canonicalize($"user:{evt.Scope}", anonToCanonical);
            }

            return Canonicalize($"scope:{evt.Scope.Trim().ToLowerInvariant()}", anonToCanonical);
        }

        return $"orphan:{evt.EventName}:{evt.CreatedAt:O}";
    }

    public static Dictionary<string, string> BuildIdentityLinks(
        IReadOnlyList<AdminActivityEventDto> events,
        IReadOnlyDictionary<string, string>? persistedLinks = null)
    {
        var anonToUser = persistedLinks is not null
            ? new Dictionary<string, string>(persistedLinks, StringComparer.OrdinalIgnoreCase)
            : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var evt in events)
        {
            var meta = evt.Metadata ?? new Dictionary<string, string?>();
            meta.TryGetValue("anonymousId", out var anon);
            if (string.IsNullOrWhiteSpace(anon))
            {
                meta.TryGetValue("anonymous_id", out anon);
            }

            string? userId = null;
            if (meta.TryGetValue("userId", out var uid) && !string.IsNullOrWhiteSpace(uid))
            {
                userId = uid.Trim();
            }
            else if (evt.Scope.StartsWith("user_", StringComparison.Ordinal))
            {
                userId = evt.Scope;
            }

            if (!string.IsNullOrWhiteSpace(anon) && !string.IsNullOrWhiteSpace(userId))
            {
                anonToUser[anon.Trim()] = userId;
            }
        }

        return anonToUser;
    }

    private static string Canonicalize(string actor, IReadOnlyDictionary<string, string> anonToUser)
    {
        if (actor.StartsWith("anon:", StringComparison.Ordinal))
        {
            var anon = actor["anon:".Length..];
            if (anonToUser.TryGetValue(anon, out var userId))
            {
                return $"user:{userId}";
            }
        }

        return actor;
    }

    public static (HashSet<string> UniqueActors, int RawCount) CountStep(
        IReadOnlyList<AdminActivityEventDto> events,
        string[] eventNames,
        IReadOnlyDictionary<string, string> anonToUser)
    {
        var names = new HashSet<string>(eventNames, StringComparer.OrdinalIgnoreCase);
        var actors = new HashSet<string>(StringComparer.Ordinal);
        var raw = 0;

        foreach (var evt in events)
        {
            if (!names.Contains(evt.EventName)) continue;
            raw++;
            actors.Add(ResolveActorKey(evt, anonToUser));
        }

        return (actors, raw);
    }

    public static AdminFunnelResponse BuildFunnel(
        IReadOnlyList<AdminActivityEventDto> events,
        string range,
        IReadOnlyDictionary<string, string>? persistedIdentityLinks = null)
    {
        var now = DateTimeOffset.UtcNow;
        var filtered = FilterByRange(events, range, now);
        var identityLinks = BuildIdentityLinks(filtered, persistedIdentityLinks);

        var steps = new List<AdminFunnelStepDto>();
        int? previousUnique = null;

        foreach (var (_, label, eventNames) in OrderedSteps)
        {
            var (actors, raw) = CountStep(filtered, eventNames, identityLinks);
            var unique = actors.Count;

            double? conversion = null;
            double? dropOff = null;
            string? warning = null;

            if (previousUnique is > 0)
            {
                if (unique > previousUnique.Value)
                {
                    warning = "Step has more unique actors than previous step; event order or tracking identity may be incomplete.";
                    conversion = null;
                    dropOff = null;
                }
                else
                {
                    conversion = Math.Round(unique / (double)previousUnique.Value * 100d, 1);
                    dropOff = Math.Round(100d - conversion.Value, 1);
                }
            }

            steps.Add(new AdminFunnelStepDto(
                eventNames[0],
                label,
                unique,
                raw,
                conversion,
                dropOff,
                warning));

            if (unique > 0)
            {
                previousUnique = unique;
            }
        }

        return new AdminFunnelResponse(
            range,
            steps,
            "Unique actors dedupe repeated logins/demos per userId, anonymousId, or stitched identity. Raw events include repeats. GA4 visitors are not included.");
    }

    public static AdminFunnelDropOffInsightDto? FindBiggestDropOff(AdminFunnelResponse funnel)
    {
        AdminFunnelDropOffInsightDto? best = null;
        double bestDrop = -1;

        AdminFunnelStepDto? prev = null;
        foreach (var step in funnel.Steps)
        {
            if (step.UniqueActorCount <= 0) continue;

            if (prev is not null && prev.UniqueActorCount > 0 && step.DropOffFromPreviousPct is not null)
            {
                var drop = step.DropOffFromPreviousPct.Value;
                if (drop > bestDrop)
                {
                    bestDrop = drop;
                    best = new AdminFunnelDropOffInsightDto(
                        prev.Label,
                        step.Label,
                        prev.UniqueActorCount,
                        step.UniqueActorCount,
                        drop,
                        InterpretDropOff(prev.EventKey, step.EventKey));
                }
            }

            prev = step;
        }

        return best;
    }

    public static string InterpretDropOff(string fromKey, string toKey) =>
        (fromKey, toKey) switch
        {
            ("demo_completed", "signup_started") or ("demo_completed", "signup_completed") =>
                "High demo volume but low signup suggests CTA, paywall, or gate friction.",
            ("signup_started", "signup_completed") =>
                "Users start signup but do not finish — check Cognito verification and form errors.",
            ("checkout_started", "payment_succeeded_live") =>
                "Checkouts without live payment suggest pricing, Stripe, or trust friction.",
            ("login_completed", "checkout_started") =>
                "Logged-in users not starting checkout — review pricing page and upgrade prompts.",
            _ => "Review the step UX and whether tracking identity is complete for this transition."
        };

    public static IReadOnlyList<AdminFunnelEventDiagnosticDto> BuildEventDiagnostics(
        IReadOnlyList<AdminActivityEventDto> events,
        string range,
        IReadOnlyDictionary<string, string>? persistedIdentityLinks = null)
    {
        var now = DateTimeOffset.UtcNow;
        var filtered = FilterByRange(events, range, now);
        var identityLinks = BuildIdentityLinks(filtered, persistedIdentityLinks);
        var byName = filtered.GroupBy(e => e.EventName, StringComparer.OrdinalIgnoreCase).ToArray();
        var diagnostics = new List<AdminFunnelEventDiagnosticDto>();

        foreach (var group in byName.OrderBy(g => g.Key))
        {
            var list = group.ToArray();
            var raw = list.Length;
            var actors = new HashSet<string>(StringComparer.Ordinal);
            var missingUser = 0;
            var missingAnon = 0;

            foreach (var evt in list)
            {
                actors.Add(ResolveActorKey(evt, identityLinks));
                var meta = evt.Metadata ?? new Dictionary<string, string?>();
                var hasUser = meta.ContainsKey("userId") && !string.IsNullOrWhiteSpace(meta["userId"])
                              || evt.Scope.StartsWith("user_", StringComparison.Ordinal);
                var hasAnon = (meta.ContainsKey("anonymousId") && !string.IsNullOrWhiteSpace(meta["anonymousId"]))
                              || (meta.ContainsKey("anonymous_id") && !string.IsNullOrWhiteSpace(meta["anonymous_id"]));
                if (!hasUser) missingUser++;
                if (!hasAnon) missingAnon++;
            }

            var first = list.Min(e => e.CreatedAt);
            var last = list.Max(e => e.CreatedAt);
            var missingIdentity = list.Count(e =>
            {
                var meta = e.Metadata ?? new Dictionary<string, string?>();
                var hasUser = meta.ContainsKey("userId") && !string.IsNullOrWhiteSpace(meta["userId"])
                              || e.Scope.StartsWith("user_", StringComparison.Ordinal);
                var hasAnon = meta.ContainsKey("anonymousId") && !string.IsNullOrWhiteSpace(meta["anonymousId"]);
                var hasScope = !string.IsNullOrWhiteSpace(e.Scope);
                return !hasUser && !hasAnon && !hasScope;
            });

            diagnostics.Add(new AdminFunnelEventDiagnosticDto(
                group.Key,
                raw,
                actors.Count,
                first,
                last,
                missingIdentity,
                raw > 0 ? Math.Round(missingUser / (double)raw * 100d, 1) : 0,
                raw > 0 ? Math.Round(missingAnon / (double)raw * 100d, 1) : 0,
                null));
        }

        return diagnostics;
    }

    public static int CountRawEvents(IReadOnlyList<AdminActivityEventDto> events, string range, params string[] eventNames)
    {
        var now = DateTimeOffset.UtcNow;
        var filtered = FilterByRange(events, range, now);
        var names = new HashSet<string>(eventNames, StringComparer.OrdinalIgnoreCase);
        return filtered.Count(e => names.Contains(e.EventName));
    }

    public static int CountUniqueActors(IReadOnlyList<AdminActivityEventDto> events, string range, params string[] eventNames)
    {
        var now = DateTimeOffset.UtcNow;
        var filtered = FilterByRange(events, range, now);
        var identityLinks = BuildIdentityLinks(filtered);
        return CountStep(filtered, eventNames, identityLinks).UniqueActors.Count;
    }
}
