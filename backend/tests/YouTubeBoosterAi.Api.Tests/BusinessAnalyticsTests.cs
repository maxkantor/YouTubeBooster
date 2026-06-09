using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class BusinessAnalyticsTests
{
    private static PaymentRecord Paid(decimal amount, string mode) => new(
        PaymentId: "pay_test",
        UserId: "user_1",
        AccountEmail: "a@example.com",
        StripeCustomerId: null,
        StripeCheckoutSessionId: "cs_test",
        StripePaymentIntentId: null,
        StripeSubscriptionId: null,
        StripeEmail: null,
        Amount: amount,
        Currency: "USD",
        Status: "completed",
        PlanCode: "premium",
        PaymentMethodBrand: null,
        PaymentMethodLast4: null,
        BillingCountry: null,
        BillingName: null,
        ReceiptUrl: null,
        CreatedAt: DateTimeOffset.UtcNow,
        UpdatedAt: DateTimeOffset.UtcNow,
        Mode: mode,
        PaidAt: DateTimeOffset.UtcNow);

    [Fact]
    public void TestStripePayment_DoesNotIncreaseLiveRevenue()
    {
        var summary = BusinessAnalytics.SummarizePayments([Paid(43.99m, "test")]);
        Assert.Equal(0, summary.LivePaidOrderCount);
        Assert.Equal(0m, summary.LiveRevenueUsd);
        Assert.Equal(1, summary.TestPaidOrderCount);
        Assert.Equal(43.99m, summary.TestRevenueUsd);
    }

    [Fact]
    public void LiveStripePayment_IncreasesLiveRevenue()
    {
        var summary = BusinessAnalytics.SummarizePayments([Paid(9.99m, "live")]);
        Assert.Equal(1, summary.LivePaidOrderCount);
        Assert.Equal(9.99m, summary.LiveRevenueUsd);
        Assert.Equal(0, summary.TestPaidOrderCount);
    }

    [Fact]
    public void UnknownMode_IsTreatedAsTestForMetrics()
    {
        var summary = BusinessAnalytics.SummarizePayments([Paid(9.99m, "")]);
        Assert.Equal(0, summary.LivePaidOrderCount);
        Assert.Equal(1, summary.TestPaidOrderCount);
    }

    [Fact]
    public void DemoToPaid_UsesLiveOrdersOnly()
    {
        var pct = BusinessAnalytics.DemoToLivePaidConversionPct(100, 0);
        Assert.Equal(0d, pct);

        pct = BusinessAnalytics.DemoToLivePaidConversionPct(100, 2);
        Assert.Equal(2d, pct);
    }

    [Fact]
    public void TestPaymentEntitlement_IsNotProduction()
    {
        Assert.False(BusinessAnalytics.IsProductionEntitlementSource(BusinessAnalytics.TestPaymentEntitlement));
        Assert.True(BusinessAnalytics.IsProductionEntitlementSource(BusinessAnalytics.ProductionEntitlementLivePayment));
        Assert.True(BusinessAnalytics.IsProductionEntitlementSource(BusinessAnalytics.ProductionEntitlementAdminGrant));
    }

    [Fact]
    public void SummarizePayments_AdminGrants_DoNotAddRevenue()
    {
        var summary = BusinessAnalytics.SummarizePayments([]);
        Assert.Equal(0m, summary.LiveRevenueUsd);
        Assert.Equal(0, summary.LivePaidOrderCount);
    }

    [Fact]
    public void LiveAndTestPayments_AreCountedSeparately()
    {
        var summary = BusinessAnalytics.SummarizePayments([
            Paid(43.99m, "test"),
            Paid(43.99m, "test"),
            Paid(9.99m, "live")
        ]);
        Assert.Equal(1, summary.LivePaidOrderCount);
        Assert.Equal(9.99m, summary.LiveRevenueUsd);
        Assert.Equal(2, summary.TestPaidOrderCount);
        Assert.Equal(87.98m, summary.TestRevenueUsd);
    }
}
