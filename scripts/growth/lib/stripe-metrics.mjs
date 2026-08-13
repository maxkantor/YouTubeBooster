/**
 * Stripe live payment summary with multi-app attribution guards.
 * Never logs emails or customer PII — only aggregated counts.
 *
 * CRITICAL: Shared Stripe accounts may contain other apps (e.g. GetTrainMate).
 * Never count account-wide live payments as YouTubeBooster revenue.
 */

import { createHash } from 'node:crypto';
import { loadStripeAllowlist } from './stripe-allowlist.mjs';

/**
 * Internal dedupe key only — never written to snapshots/emails.
 * @param {object} session Stripe Checkout Session
 */
export function customerDedupeKey(session) {
  if (session.customer) return `cus:${session.customer}`;
  const email = session.customer_details?.email || session.customer_email;
  if (email && typeof email === 'string') {
    const h = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
    return `emh:${h}`;
  }
  return `sess:${session.id}`;
}

function emailHashPrefix16(session) {
  const email = session.customer_details?.email || session.customer_email;
  if (!email || typeof email !== 'string') return null;
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function meta(session, key) {
  const m = session.metadata || {};
  return m[key] ?? m[key.toLowerCase()] ?? '';
}

function collectLineItemIds(session) {
  const items = session.line_items?.data || session.line_items || [];
  const priceIds = [];
  const productIds = [];
  const names = [];
  for (const item of items) {
    const price = item.price || {};
    if (price.id) priceIds.push(String(price.id));
    const product = price.product;
    if (typeof product === 'string') productIds.push(product);
    else if (product?.id) productIds.push(String(product.id));
    if (price.product_data?.name) names.push(String(price.product_data.name));
    if (item.description) names.push(String(item.description));
    if (typeof product === 'object' && product?.name) names.push(String(product.name));
  }
  return { priceIds, productIds, names };
}

function successHost(session) {
  const url = session.success_url || '';
  try {
    return new URL(url.replace(/\{CHECKOUT_SESSION_ID\}/gi, 'cs_x')).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Classify a single Checkout Session for YouTubeBooster attribution.
 * @returns {{
 *   bucket: 'verified_candidate'|'unattributed'|'other_app'|'excluded_owner_smoke'|'test'|'incomplete'|'refunded'|'duplicate',
 *   reasons: string[]
 * }}
 */
export function classifyCheckoutSession(session, allowlist, seenPaymentIntentIds = new Set()) {
  const reasons = [];
  if (!session) return { bucket: 'incomplete', reasons: ['missing_session'] };

  if (!session.livemode) {
    return { bucket: 'test', reasons: ['test_mode'] };
  }

  if (session.status !== 'complete' || session.payment_status !== 'paid') {
    return { bucket: 'incomplete', reasons: ['not_complete_paid'] };
  }

  // Fully refunded — exclude from payment + revenue counts
  const amountTotal = Number(session.amount_total || 0);
  const amountRefunded = Number(
    session.amount_refunded ??
      session.payment_intent?.amount_refunded ??
      session.total_details?.amount_refunded ??
      0
  );
  if (amountTotal > 0 && amountRefunded >= amountTotal) {
    return { bucket: 'refunded', reasons: ['fully_refunded'] };
  }

  const pi = session.payment_intent;
  const piId = typeof pi === 'string' ? pi : pi?.id;
  if (piId) {
    if (seenPaymentIntentIds.has(piId)) {
      return { bucket: 'duplicate', reasons: ['duplicate_payment_intent'] };
    }
  }

  // Owner / self / smoke exclusions
  if (session.customer && allowlist.excludedCustomerIds.includes(String(session.customer))) {
    return { bucket: 'excluded_owner_smoke', reasons: ['excluded_customer_id'] };
  }
  const eh = emailHashPrefix16(session);
  if (eh && allowlist.excludedEmailHashesSha256Prefix16.includes(eh)) {
    return { bucket: 'excluded_owner_smoke', reasons: ['excluded_email_hash'] };
  }
  for (const flag of allowlist.smokeTestMetadataFlags || []) {
    const v = String(meta(session, flag) || meta(session, 'test_type') || '').toLowerCase();
    if (v === '1' || v === 'true' || v === flag.toLowerCase()) {
      return { bucket: 'excluded_owner_smoke', reasons: [`smoke_flag:${flag}`] };
    }
    if (String(meta(session, 'purchase_type')).toLowerCase() === flag.toLowerCase()) {
      return { bucket: 'excluded_owner_smoke', reasons: [`purchase_type:${flag}`] };
    }
  }

  const app = String(meta(session, 'app')).trim().toLowerCase();
  const brand = String(meta(session, 'brand')).trim();
  const { priceIds, productIds, names } = collectLineItemIds(session);
  const host = successHost(session);
  const paymentLinkId =
    session.payment_link ||
    session.payment_link_id ||
    meta(session, 'payment_link_id') ||
    '';

  // Explicit other-app tag
  if (app && app !== String(allowlist.appKey).toLowerCase()) {
    return { bucket: 'other_app', reasons: [`metadata.app=${app}`] };
  }

  let conclusive = false;

  if (app && app === String(allowlist.appKey).toLowerCase()) {
    conclusive = true;
    reasons.push('metadata.app');
  }

  if (allowlist.priceIds.some((id) => priceIds.includes(id))) {
    conclusive = true;
    reasons.push('allowlisted_price_id');
  }
  if (allowlist.productIds.some((id) => productIds.includes(id))) {
    conclusive = true;
    reasons.push('allowlisted_product_id');
  }
  if (paymentLinkId && allowlist.paymentLinkIds.includes(String(paymentLinkId))) {
    conclusive = true;
    reasons.push('allowlisted_payment_link_id');
  }

  // Supporting signals alone are NOT enough without app/catalog match
  const brandMatch =
    brand && brand.toLowerCase() === String(allowlist.brand || '').toLowerCase();
  const nameMatch = (allowlist.productNameContains || []).some((needle) =>
    names.some((n) => n.toLowerCase().includes(String(needle).toLowerCase()))
  );
  const hostMatch = (allowlist.successUrlHosts || []).some(
    (h) => host === String(h).toLowerCase() || host.endsWith(`.${String(h).toLowerCase()}`)
  );

  if (!conclusive) {
    if (brandMatch || nameMatch || hostMatch) {
      reasons.push(
        `supporting_only:${[brandMatch && 'brand', nameMatch && 'product_name', hostMatch && 'success_host']
          .filter(Boolean)
          .join(',')}`
      );
    }
    return { bucket: 'unattributed', reasons: reasons.length ? reasons : ['no_conclusive_attribution'] };
  }

  // If conclusive via catalog ID but metadata.app points elsewhere — already handled.
  // Prefer requiring app when present empty is ok if catalog allowlist matched.
  return { bucket: 'verified_candidate', reasons };
}

/**
 * @param {object|null} sessionsList Stripe list response
 * @param {{ endUnix?: number, allowlist?: object }} [opts]
 */
export function summarizeStripeSessions(sessionsList, opts = {}) {
  const allowlist = opts.allowlist || loadStripeAllowlist();
  const all = sessionsList?.data ?? [];
  const endUnix = opts.endUnix;
  const seenPi = new Set();

  const inWindow = (s) => {
    if (endUnix == null) return true;
    return (s.created || 0) <= endUnix;
  };

  const windowSessions = all.filter(inWindow);

  let accountWideLivePaid = 0;
  let testPaid = 0;
  let unattributed = 0;
  let otherApp = 0;
  let excluded = 0;
  let refunded = 0;
  let duplicates = 0;
  /** @type {object[]} */
  const attributed = [];

  for (const s of windowSessions) {
    if (s.livemode && s.payment_status === 'paid' && s.status === 'complete') {
      accountWideLivePaid += 1;
    }
    const { bucket } = classifyCheckoutSession(s, allowlist, seenPi);
    const pi = s.payment_intent;
    const piId = typeof pi === 'string' ? pi : pi?.id;
    if (bucket === 'verified_candidate' && piId) seenPi.add(piId);

    switch (bucket) {
      case 'verified_candidate':
        attributed.push(s);
        break;
      case 'unattributed':
        unattributed += 1;
        break;
      case 'other_app':
        otherApp += 1;
        break;
      case 'excluded_owner_smoke':
        excluded += 1;
        break;
      case 'test':
        if (s.payment_status === 'paid' && s.status === 'complete') testPaid += 1;
        break;
      case 'refunded':
        refunded += 1;
        break;
      case 'duplicate':
        duplicates += 1;
        break;
      default:
        break;
    }
  }

  const uniqueAttributed = new Set(attributed.map(customerDedupeKey));
  const grossAttributed =
    attributed.reduce((sum, s) => {
      const total = Number(s.amount_total || 0);
      const refundedAmt = Number(
        s.amount_refunded ?? s.payment_intent?.amount_refunded ?? s.total_details?.amount_refunded ?? 0
      );
      return sum + Math.max(0, total - refundedAmt);
    }, 0) / 100;

  const baseline = allowlist.verifiedBaselines.YouTubeBooster;
  const reconciliationComplete = allowlist.reconciliationComplete === true;

  // Until reconciliation is complete, do not promote attributed Stripe hits to verified revenue.
  const verifiedSuccessfulLivePayments = reconciliationComplete
    ? attributed.length
    : baseline.verifiedSuccessfulLivePayments;
  const verifiedUniquePayingCustomers = reconciliationComplete
    ? uniqueAttributed.size
    : baseline.verifiedExternalPayingCustomers;
  const verifiedNetLiveRevenueUsd = reconciliationComplete
    ? grossAttributed
    : baseline.verifiedNetLiveRevenueUsd;

  return {
    // Scoreboard / canonical (safe)
    successfulLivePayments: verifiedSuccessfulLivePayments,
    livePaidSessions: verifiedSuccessfulLivePayments,
    uniquePayingCustomers: verifiedUniquePayingCustomers,
    revenueLiveUsd: verifiedNetLiveRevenueUsd,
    netLiveRevenueUsd: verifiedNetLiveRevenueUsd,
    grossLiveRevenueUsd: verifiedNetLiveRevenueUsd,
    refundsApplied: true,
    entitledPaidUsers: null,
    experimentAttributedPaid: null,
    activationWithin24h: null,

    // Diagnostics (never use accountWide as YouTubeBooster revenue)
    attribution: {
      reconciliationComplete,
      verifiedSuccessfulLivePayments,
      verifiedUniquePayingCustomers,
      verifiedNetLiveRevenueUsd,
      attributedCandidatesBeforeBaseline: attributed.length,
      attributedUniqueCandidatesBeforeBaseline: uniqueAttributed.size,
      attributedGrossUsdBeforeBaseline: grossAttributed,
      unattributedLivePayments: unattributed,
      otherAppLivePayments: otherApp,
      excludedOwnerOrSmokePayments: excluded,
      refundedLivePayments: refunded,
      duplicateRepresentations: duplicates,
      testPaidSessions: testPaid,
      accountWideLivePaidSessions: accountWideLivePaid,
      allowlist: {
        appKey: allowlist.appKey,
        productIdCount: allowlist.productIds.length,
        priceIdCount: allowlist.priceIds.length,
        paymentLinkIdCount: allowlist.paymentLinkIds.length,
        hasCatalogAllowlist: allowlist.hasCatalogAllowlist
      },
      baselines: allowlist.verifiedBaselines
    },
    testPaidSessions: testPaid
  };
}
