import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCheckoutSession, summarizeStripeSessions } from '../lib/stripe-metrics.mjs';
import { loadStripeAllowlist } from '../lib/stripe-allowlist.mjs';

function baseAllowlist(overrides = {}) {
  return {
    appKey: 'youtubeboosterai',
    brand: 'YouTubeBoosterAI',
    productNameContains: ['YouTube Booster AI'],
    successUrlHosts: ['youtubeboosterai.com'],
    productIds: ['prod_YB'],
    priceIds: ['price_YB'],
    paymentLinkIds: [],
    excludedCustomerIds: ['cus_owner'],
    excludedEmailHashesSha256Prefix16: [],
    smokeTestMetadataFlags: ['smoke_test', 'setup_test', 'internal_test'],
    reconciliationComplete: false,
    verifiedBaselines: {
      YouTubeBooster: {
        verifiedExternalPayingCustomers: 0,
        verifiedSuccessfulLivePayments: 0,
        verifiedNetLiveRevenueUsd: 0
      },
      GetTrainMate: { verifiedExternalPayingCustomers: 0 }
    },
    hasCatalogAllowlist: true,
    ...overrides
  };
}

test('loadStripeAllowlist defaults reconciliationComplete false and baseline 0', () => {
  const a = loadStripeAllowlist();
  assert.equal(a.reconciliationComplete, false);
  assert.equal(a.verifiedBaselines.YouTubeBooster.verifiedExternalPayingCustomers, 0);
  assert.equal(a.verifiedBaselines.GetTrainMate.verifiedExternalPayingCustomers, 0);
});

test('other-app metadata is excluded from YouTubeBooster revenue', () => {
  const allowlist = baseAllowlist();
  const session = {
    id: 'cs_other',
    livemode: true,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 1999,
    metadata: { app: 'gettrainmate' },
    created: 1
  };
  assert.equal(classifyCheckoutSession(session, allowlist).bucket, 'other_app');
});

test('live paid without conclusive attribution is Unattributed', () => {
  const allowlist = baseAllowlist({ productIds: [], priceIds: [] });
  const session = {
    id: 'cs_unk',
    livemode: true,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 999,
    metadata: {},
    success_url: 'https://youtubeboosterai.com/?checkout=success',
    created: 1
  };
  // success_url alone is supporting — not conclusive
  assert.equal(classifyCheckoutSession(session, allowlist).bucket, 'unattributed');
});

test('metadata.app=youtubeboosterai is conclusive candidate', () => {
  const allowlist = baseAllowlist();
  const session = {
    id: 'cs_yb',
    livemode: true,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 999,
    metadata: { app: 'youtubeboosterai', brand: 'YouTubeBoosterAI' },
    customer: 'cus_ext',
    created: 1
  };
  assert.equal(classifyCheckoutSession(session, allowlist).bucket, 'verified_candidate');
});

test('allowlisted price id is conclusive even without app metadata', () => {
  const allowlist = baseAllowlist();
  const session = {
    id: 'cs_price',
    livemode: true,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 999,
    metadata: {},
    line_items: { data: [{ price: { id: 'price_YB', product: 'prod_YB' } }] },
    created: 1
  };
  assert.equal(classifyCheckoutSession(session, allowlist).bucket, 'verified_candidate');
});

test('owner customer and smoke tests are excluded', () => {
  const allowlist = baseAllowlist();
  assert.equal(
    classifyCheckoutSession(
      {
        id: 'cs_owner',
        livemode: true,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 999,
        customer: 'cus_owner',
        metadata: { app: 'youtubeboosterai' },
        created: 1
      },
      allowlist
    ).bucket,
    'excluded_owner_smoke'
  );
  assert.equal(
    classifyCheckoutSession(
      {
        id: 'cs_smoke',
        livemode: true,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 999,
        metadata: { app: 'youtubeboosterai', smoke_test: 'true' },
        created: 1
      },
      allowlist
    ).bucket,
    'excluded_owner_smoke'
  );
});

test('fully refunded payments are excluded', () => {
  const allowlist = baseAllowlist();
  assert.equal(
    classifyCheckoutSession(
      {
        id: 'cs_ref',
        livemode: true,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 999,
        amount_refunded: 999,
        metadata: { app: 'youtubeboosterai' },
        created: 1
      },
      allowlist
    ).bucket,
    'refunded'
  );
});

test('account-wide live paid must not become verified revenue before reconciliation', () => {
  const allowlist = baseAllowlist({ reconciliationComplete: false });
  const summary = summarizeStripeSessions(
    {
      data: [
        {
          id: 'cs_1',
          livemode: true,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 1999,
          customer: 'cus_a',
          metadata: { app: 'youtubeboosterai' },
          created: 1
        },
        {
          id: 'cs_2',
          livemode: true,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 5000,
          customer: 'cus_train',
          metadata: { app: 'gettrainmate' },
          created: 2
        },
        {
          id: 'cs_3',
          livemode: true,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 3000,
          metadata: {},
          created: 3
        }
      ]
    },
    { allowlist }
  );

  assert.equal(summary.attribution.accountWideLivePaidSessions, 3);
  assert.equal(summary.attribution.otherAppLivePayments, 1);
  assert.equal(summary.attribution.unattributedLivePayments, 1);
  assert.equal(summary.attribution.attributedCandidatesBeforeBaseline, 1);
  // Verified baseline remains 0
  assert.equal(summary.successfulLivePayments, 0);
  assert.equal(summary.uniquePayingCustomers, 0);
  assert.equal(summary.netLiveRevenueUsd, 0);
  assert.equal(summary.attribution.baselines.YouTubeBooster.verifiedExternalPayingCustomers, 0);
  assert.doesNotMatch(JSON.stringify(summary), /@/);
});

test('after reconciliation, attributed payments count; other-app still excluded', () => {
  const allowlist = baseAllowlist({ reconciliationComplete: true });
  const summary = summarizeStripeSessions(
    {
      data: [
        {
          id: 'cs_1',
          livemode: true,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 999,
          customer: 'cus_a',
          metadata: { app: 'youtubeboosterai' },
          payment_intent: 'pi_1',
          created: 1
        },
        {
          id: 'cs_dup',
          livemode: true,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 999,
          customer: 'cus_a',
          metadata: { app: 'youtubeboosterai' },
          payment_intent: 'pi_1',
          created: 2
        },
        {
          id: 'cs_other',
          livemode: true,
          status: 'complete',
          payment_status: 'paid',
          amount_total: 5000,
          metadata: { app: 'gettrainmate' },
          created: 3
        }
      ]
    },
    { allowlist }
  );
  assert.equal(summary.successfulLivePayments, 1);
  assert.equal(summary.uniquePayingCustomers, 1);
  assert.equal(summary.netLiveRevenueUsd, 9.99);
  assert.equal(summary.attribution.duplicateRepresentations, 1);
  assert.equal(summary.attribution.otherAppLivePayments, 1);
});
