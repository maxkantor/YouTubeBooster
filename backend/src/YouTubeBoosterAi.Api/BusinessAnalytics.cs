namespace YouTubeBoosterAi.Api;

/// <summary>
/// Canonical rules for payment live/test classification and CRM revenue metrics.
/// Revenue "live" counts only completed paid rows where mode is explicitly live.
/// Unknown or missing mode is treated as test for metrics safety until backfilled.
/// </summary>
public static class BusinessAnalytics
{
    public const string ProductionEntitlementLivePayment = "live_payment";
    public const string ProductionEntitlementAdminGrant = "admin_grant";
    public const string ProductionEntitlementLegacy = "legacy";
    public const string TestPaymentEntitlement = "test_payment";
    public const string LegacyUnverifiedNote = "legacy_unverified_test_assumed";

    public static string NormalizePaymentMode(string? mode)
    {
        if (string.IsNullOrWhiteSpace(mode)) return "test";
        var normalized = mode.Trim().ToLowerInvariant();
        return normalized switch
        {
            "live" => "live",
            "test" => "test",
            _ => "test"
        };
    }

    public static bool IsLiveMode(string? mode) =>
        string.Equals(NormalizePaymentMode(mode), "live", StringComparison.Ordinal);

    public static bool IsCompletedPaid(PaymentRecord payment) =>
        string.Equals(payment.Status, "completed", StringComparison.OrdinalIgnoreCase) &&
        payment.Amount > 0m;

    public static bool IsLivePaidOrder(PaymentRecord payment) =>
        IsCompletedPaid(payment) && IsLiveMode(payment.Mode);

    public static bool IsTestPaidOrder(PaymentRecord payment) =>
        IsCompletedPaid(payment) && !IsLiveMode(payment.Mode);

    public static bool IsProductionEntitlementSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source)) return true;
        return !string.Equals(source, TestPaymentEntitlement, StringComparison.OrdinalIgnoreCase)
               && !string.Equals(source, "test", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsActiveEntitlement(EntitlementRecord entitlement, DateTimeOffset now) =>
        string.Equals(entitlement.Status, "active", StringComparison.OrdinalIgnoreCase) &&
        (entitlement.ExpiresAt is null || entitlement.ExpiresAt > now);

    public static bool IsProductionEntitlement(EntitlementRecord entitlement, DateTimeOffset now) =>
        IsActiveEntitlement(entitlement, now) && IsProductionEntitlementSource(entitlement.Source);

    public static PaymentMetricsSummary SummarizePayments(IEnumerable<PaymentRecord> payments)
    {
        var rows = payments.ToArray();
        var livePaid = rows.Where(IsLivePaidOrder).ToArray();
        var testPaid = rows.Where(IsTestPaidOrder).ToArray();
        var failed = rows.Count(p =>
            string.Equals(p.Status, "failed", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(p.Status, "unpaid", StringComparison.OrdinalIgnoreCase));
        var unmatched = rows.Count(p => string.IsNullOrWhiteSpace(p.UserId));

        return new PaymentMetricsSummary(
            LivePaidOrderCount: livePaid.Length,
            LiveRevenueUsd: livePaid.Sum(p => p.Amount),
            TestPaidOrderCount: testPaid.Length,
            TestRevenueUsd: testPaid.Sum(p => p.Amount),
            FailedOrUnpaidCount: failed,
            UnmatchedCount: unmatched);
    }

    public static double DemoToLivePaidConversionPct(int totalDemos, int livePaidOrders)
    {
        if (totalDemos <= 0 || livePaidOrders <= 0) return 0d;
        return Math.Min(100d, livePaidOrders / (double)totalDemos * 100d);
    }

    public static AdminFunnelResponse BuildFunnel(IReadOnlyList<AdminActivityEventDto> events, string range)
    {
        var orderedSteps = new (string Key, string Label)[]
        {
            ("landing_page_view", "Landing page views"),
            ("audit_url_entered", "Audit URL entered"),
            ("demo_started", "Demo started"),
            ("demo_completed", "Demo completed"),
            ("signup_started", "Signup started"),
            ("signup_completed", "Signup completed"),
            ("cognito_user_provisioned", "Cognito user provisioned"),
            ("user_login", "User login"),
            ("login_completed", "Login completed"),
            ("checkout_started", "Checkout started"),
            ("payment_succeeded_live", "Payment succeeded (live)"),
            ("payment_succeeded_test", "Payment succeeded (test)"),
            ("payment_failed", "Payment failed"),
            ("entitlement_granted", "Entitlement granted"),
            ("contact_submitted", "Contact submitted")
        };

        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var evt in events)
        {
            var name = evt.EventName ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name)) continue;
            counts.TryGetValue(name, out var current);
            counts[name] = current + 1;
        }

        var steps = new List<AdminFunnelStepDto>();
        int? previous = null;
        foreach (var (key, label) in orderedSteps)
        {
            counts.TryGetValue(key, out var count);
            double? conversionFromPrevious = null;
            double? dropOffFromPrevious = null;
            if (previous is > 0)
            {
                conversionFromPrevious = Math.Round(count / (double)previous.Value * 100d, 1);
                dropOffFromPrevious = Math.Round(100d - conversionFromPrevious.Value, 1);
            }

            steps.Add(new AdminFunnelStepDto(key, label, count, conversionFromPrevious, dropOffFromPrevious));
            if (count > 0) previous = count;
        }

        return new AdminFunnelResponse(
            range,
            steps,
            "Funnel counts come from the internal activity log (ybai-activity), not GA4. GA4 visitors are anonymous and will not match registered CRM users.");
    }

    public static IReadOnlyList<AdminDiagnosticRowDto> BuildDiagnostics(
        string range,
        PaymentMetricsSummary payments,
        int totalDemos,
        int totalUsers,
        int usersPageCount,
        int activeLiveEntitled,
        int activeEntitledPurchasedFlag)
    {
        var rows = new List<AdminDiagnosticRowDto>
        {
            new("paid_live_orders", payments.LivePaidOrderCount.ToString(), "DynamoDB PAYMENT# rows", "status=completed, amount>0, mode=live", DateTimeOffset.UtcNow,
                payments.LivePaidOrderCount > 0 ? null : "No live Stripe payments recorded."),
            new("revenue_live_usd", payments.LiveRevenueUsd.ToString("F2"), "DynamoDB PAYMENT# rows", "Sum amount where live paid", DateTimeOffset.UtcNow,
                "Revenue Live excludes mode=test and unknown-mode rows (treated as test until backfilled)."),
            new("paid_test_orders", payments.TestPaidOrderCount.ToString(), "DynamoDB PAYMENT# rows", "status=completed, amount>0, mode!=live", DateTimeOffset.UtcNow,
                payments.TestPaidOrderCount > 0 ? "Test payments are excluded from live revenue and production entitlements." : null),
            new("revenue_test_usd", payments.TestRevenueUsd.ToString("F2"), "DynamoDB PAYMENT# rows", "Sum amount where test paid", DateTimeOffset.UtcNow, null),
            new("demo_to_paid_pct", DemoToLivePaidConversionPct(totalDemos, payments.LivePaidOrderCount).ToString("F1"), "Activity + payments", "live paid / demos", DateTimeOffset.UtcNow,
                "Uses live paid orders only; test checkouts do not count."),
            new("total_users", totalUsers.ToString(), "DynamoDB users sk=PROFILE", "Count profile rows", DateTimeOffset.UtcNow,
                usersPageCount != totalUsers ? $"Users page loaded {usersPageCount} rows; dashboard scans full profile count ({totalUsers})." : null),
            new("active_entitled_live", activeLiveEntitled.ToString(), "DynamoDB entitlements", "active production entitlements", DateTimeOffset.UtcNow,
                activeEntitledPurchasedFlag != activeLiveEntitled ? "Purchased flag may include legacy/test entitlements; live entitled uses entitlement source." : null),
            new("ga4_vs_crm", "N/A in CRM", "GA4 (external)", "Not stored in CRM", DateTimeOffset.UtcNow,
                "GA4 active users are anonymous visitors/devices. CRM users are registered accounts with Cognito/DynamoDB profiles.")
        };
        return rows;
    }
}

public sealed record PaymentMetricsSummary(
    int LivePaidOrderCount,
    decimal LiveRevenueUsd,
    int TestPaidOrderCount,
    decimal TestRevenueUsd,
    int FailedOrUnpaidCount,
    int UnmatchedCount);
