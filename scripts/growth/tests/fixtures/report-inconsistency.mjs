/**
 * Fixture reproducing the Aug 2026 report bug:
 * notes/full map had audit_started=4 over 30d, but scoreboard used top-10 events
 * where audit_started was absent → incorrectly showed 0.
 */
export const truncatedTopEventsBugFixture = {
  generatedAt: '2026-08-13T16:00:00.000Z',
  sources: { ga4: 'configured', stripe: 'configured' },
  windows: {
    '7d': {
      start: '2026-08-06',
      end: '2026-08-13',
      eventsTruncated: false,
      ga4ExplicitEvents: {
        session_start: 16,
        audit_started: 3,
        audit_completed: 7,
        pricing_viewed: 2,
        checkout_started: 1,
        demo_opened: 5,
        page_view: 40,
        first_visit: 10
      },
      stripe: {
        successfulLivePayments: 0,
        livePaidSessions: 0,
        uniquePayingCustomers: 0,
        revenueLiveUsd: 0,
        netLiveRevenueUsd: 0,
        refundsApplied: false,
        entitledPaidUsers: null
      },
      landing: { exp002Sessions: 4, exp003Sessions: 1 }
    },
    '30d': {
      start: '2026-07-14',
      end: '2026-08-13',
      // Simulate the old bug path: only top events available to scoreboard
      eventsTruncated: true,
      topEventsMap: {
        page_view: 120,
        session_start: 57,
        user_engagement: 50,
        first_visit: 40,
        scroll: 30,
        demo_opened: 15,
        audit_completed: 13,
        pricing_viewed: 8,
        click: 6,
        view_search_results: 5
        // audit_started=4 exists in full data but NOT in top 10
      },
      // Full explicit map (what notes / correct pipeline should use)
      ga4ExplicitEvents: {
        session_start: 57,
        audit_started: 4,
        audit_completed: 13,
        pricing_viewed: 8,
        checkout_started: 2,
        demo_opened: 15,
        page_view: 120,
        first_visit: 40
      },
      stripe: {
        successfulLivePayments: 1,
        livePaidSessions: 1,
        uniquePayingCustomers: 1,
        revenueLiveUsd: 19.99,
        netLiveRevenueUsd: 19.99,
        refundsApplied: false,
        entitledPaidUsers: null
      },
      landing: { exp002Sessions: 12, exp003Sessions: 3 }
    }
  }
};

/** Same fixture with explicit (non-truncated) 30d map — scoreboard must show 4 starts. */
export const explicitFunnelFixture = {
  ...truncatedTopEventsBugFixture,
  windows: {
    ...truncatedTopEventsBugFixture.windows,
    '30d': {
      ...truncatedTopEventsBugFixture.windows['30d'],
      eventsTruncated: false,
      topEventsMap: undefined
    }
  }
};
