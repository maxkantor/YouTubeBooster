using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class CommunicationCrmTests
{
    private static SupportTicketRequest Contact(string email, string subject, string message) =>
        new(email, "Ada", subject, message, "general", null, null, null, "contact_form");

    [Fact]
    public async Task ContactForm_ReusesTicket_ForSameEmail()
    {
        var store = new InMemoryAppDataStore(new EphemeralDataProtectionProvider());
        var notify = new CountingNotify();
        var svc = new SupportService(store, notify);

        var a = await svc.CreateTicketAsync(Contact("same@example.com", "Hello", "First message here ok"), null, CancellationToken.None);
        var b = await svc.CreateTicketAsync(Contact("same@example.com", "Again", "Second message here ok"), null, CancellationToken.None);

        Assert.Equal(a.TicketId, b.TicketId);
        Assert.Equal(2, notify.Calls);
        var detail = await store.GetSupportTicketAsync(a.TicketId, CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Equal(2, detail!.Thread.Count(m => m.Direction == "inbound"));
    }

    [Fact]
    public async Task ContactNotificationFailure_DoesNotLoseTicket()
    {
        var store = new InMemoryAppDataStore(new EphemeralDataProtectionProvider());
        var svc = new SupportService(store, new ThrowingNotify());
        var res = await svc.CreateTicketAsync(Contact("keep@example.com", "Subject", "Message body long enough"), null, CancellationToken.None);
        var detail = await store.GetSupportTicketAsync(res.TicketId, CancellationToken.None);
        Assert.NotNull(detail);
        Assert.Equal("keep@example.com", detail!.Ticket.Email);
    }

    [Fact]
    public void MarketingUnsubscribe_DoesNotApply_ToContactFormSource()
    {
        Assert.False(AdminNotificationPrefs.IsMarketingSource("contact_form"));
        Assert.True(AdminNotificationPrefs.IsContactLikeSource("contact_form"));
        Assert.True(AdminNotificationPrefs.IsMarketingSource("founder_outreach"));
    }

    private sealed class CountingNotify : ISupportNotificationService
    {
        public int Calls { get; private set; }
        public Task NotifyNewTicketAsync(string ticketId, SupportTicketRequest request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.CompletedTask;
        }
    }

    private sealed class ThrowingNotify : ISupportNotificationService
    {
        public Task NotifyNewTicketAsync(string ticketId, SupportTicketRequest request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("ses_down");
    }
}
