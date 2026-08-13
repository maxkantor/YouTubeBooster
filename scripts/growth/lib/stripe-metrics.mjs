/**
 * Stripe live payment summary for growth reports.
 * Never logs emails or customer PII — only aggregated counts.
 */

import { createHash } from 'node:crypto';

/**
 * Internal dedupe key only — never written to snapshots/emails.
 * @param {object} session Stripe Checkout Session
 */
function customerDedupeKey(session) {
  if (session.customer) return `cus:${session.customer}`;
  const email = session.customer_details?.email || session.customer_email;
  if (email && typeof email === 'string') {
    const h = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
    return `emh:${h}`;
  }
  return `sess:${session.id}`;
}

/**
 * @param {object|null} sessionsList Stripe list response
 * @param {{ endUnix?: number }} [opts]
 */
export function summarizeStripeSessions(sessionsList, opts = {}) {
  const all = sessionsList?.data ?? [];
  const endUnix = opts.endUnix;

  const inWindow = (s) => {
    if (endUnix == null) return true;
    return (s.created || 0) <= endUnix;
  };

  const livePaid = all.filter(
    (s) => s.livemode && s.payment_status === 'paid' && s.status === 'complete' && inWindow(s)
  );
  const testPaid = all.filter(
    (s) => !s.livemode && s.payment_status === 'paid' && s.status === 'complete' && inWindow(s)
  );

  const uniqueKeys = new Set(livePaid.map(customerDedupeKey));
  const grossLive = livePaid.reduce((sum, s) => sum + (s.amount_total || 0), 0) / 100;
  const grossTest = testPaid.reduce((sum, s) => sum + (s.amount_total || 0), 0) / 100;

  // Refunds require PaymentIntent/Charge expansion — not available on restricted list by default
  const refundsApplied = false;
  const netLive = grossLive; // labeled as refunds-unknown in canonical metrics

  return {
    successfulLivePayments: livePaid.length,
    livePaidSessions: livePaid.length, // back-compat
    uniquePayingCustomers: uniqueKeys.size,
    testPaidSessions: testPaid.length,
    revenueLiveUsd: grossLive,
    revenueTestUsd: grossTest,
    netLiveRevenueUsd: netLive,
    grossLiveRevenueUsd: grossLive,
    refundsApplied,
    entitledPaidUsers: null, // requires Admin CRM
    experimentAttributedPaid: null,
    activationWithin24h: null
  };
}
