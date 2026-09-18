import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCanonicalWindowMetrics,
  formatMetricValue,
  metricFromAliases,
  reconcileCanonicalWindows,
  sumEventsByName,
  topEventsForDisplay
} from '../lib/canonical-metrics.mjs';
import { composeGrowthReport } from '../lib/compose-report.mjs';
import { weekdayNameForYmd, formatLongDateEt } from '../lib/time.mjs';
import { summarizeStripeSessions } from '../lib/stripe-metrics.mjs';
import { parseActiveExperiments, nextEvaluation } from '../lib/experiment-report.mjs';
import {
  explicitFunnelFixture,
  truncatedTopEventsBugFixture
} from './fixtures/report-inconsistency.mjs';

test('sumEventsByName aggregates channel-group rows', () => {
  const ga4 = {
    rows: [
      {
        dimensionValues: [{ value: 'audit_started' }, { value: 'Organic Search' }],
        metricValues: [{ value: '2' }]
      },
      {
        dimensionValues: [{ value: 'audit_started' }, { value: 'Direct' }],
        metricValues: [{ value: '2' }]
      }
    ]
  };
  assert.equal(sumEventsByName(ga4).audit_started, 4);
});

test('top-events truncation must not be treated as zero for missing audit_started', () => {
  const top = Object.fromEntries(
    topEventsForDisplay(
      {
        page_view: 120,
        session_start: 57,
        audit_completed: 13,
        audit_started: 4
      },
      3
    )
  );
  // audit_started dropped from top 3
  assert.equal(Object.prototype.hasOwnProperty.call(top, 'audit_started'), false);
  const fromTruncated = metricFromAliases(top, ['audit_started'], { truncated: true });
  assert.equal(fromTruncated.value, null);
  assert.equal(formatMetricValue(fromTruncated), 'Unknown');
});

test('explicit map with audit_started=4 is never reported as 0', () => {
  const m = buildCanonicalWindowMetrics({
    byEvent: truncatedTopEventsBugFixture.windows['30d'].ga4ExplicitEvents,
    explicitQueried: true,
    stripe: truncatedTopEventsBugFixture.windows['30d'].stripe
  });
  assert.equal(m.audit_starts.value, 4);
  assert.notEqual(formatMetricValue(m.audit_starts), '0');
});

test('reproduce bug: truncated scoreboard path yields Unknown not 0; fixed path yields 4', () => {
  const buggy = composeGrowthReport({
    snapshot: truncatedTopEventsBugFixture,
    health: { ok: true, checks: [{ name: 'homepage', ok: true }] },
    experiments: [],
    notes: 'Agent notes: 4 audit starts over 30 days.',
    generatedAt: '2026-08-13T16:00:00.000Z',
    shipped: false
  });
  // Truncated path → Unknown (not silent zero)
  assert.match(buggy.text, /audit_starts=Unknown/);
  assert.ok(buggy.warnings.some((w) => /top_events|truncat|absent|Quality|audit_completed/i.test(w) || w.length > 0));

  const fixed = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [{ name: 'homepage', ok: true }] },
    experiments: [],
    notes: 'Agent notes: 4 audit starts over 30 days.',
    generatedAt: '2026-08-13T16:00:00.000Z',
    shipped: false
  });
  assert.match(fixed.text, /30d[\s\S]*audit_starts=4/);
  assert.doesNotMatch(fixed.text, /audit_starts=0/);
  // Decision leads
  assert.match(fixed.text, /1\) DECISION/);
  assert.match(fixed.subject, /America\/New_York|Aug 13|No change deployed/i);
});

test('weekday labels match dates in America/New_York', () => {
  assert.equal(weekdayNameForYmd('2026-08-17'), 'Monday');
  assert.equal(weekdayNameForYmd('2026-08-19'), 'Wednesday');
  assert.equal(weekdayNameForYmd('2026-08-25'), 'Tuesday');
  assert.match(formatLongDateEt('2026-08-19'), /^Wednesday, August 19, 2026$/);
  assert.match(formatLongDateEt('2026-08-25'), /^Tuesday, August 25, 2026$/);
});

test('Stripe separates payments and unique customers; never exposes email; baseline 0 before reconciliation', () => {
  const summary = summarizeStripeSessions({
    data: [
      {
        id: 'cs_1',
        livemode: true,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 1999,
        customer: 'cus_a',
        customer_details: { email: 'secret@example.com' },
        metadata: { app: 'youtubeboosterai' },
        created: 1
      },
      {
        id: 'cs_2',
        livemode: true,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 999,
        customer: 'cus_a',
        customer_details: { email: 'secret@example.com' },
        metadata: { app: 'youtubeboosterai' },
        created: 2
      },
      {
        id: 'cs_3',
        livemode: false,
        status: 'complete',
        payment_status: 'paid',
        amount_total: 999,
        customer: 'cus_test',
        created: 3
      }
    ]
  });
  // Default allowlist reconciliationComplete=false → verified baseline 0
  assert.equal(summary.successfulLivePayments, 0);
  assert.equal(summary.uniquePayingCustomers, 0);
  assert.equal(summary.attribution.attributedCandidatesBeforeBaseline, 2);
  assert.equal(summary.testPaidSessions, 1);
  const json = JSON.stringify(summary);
  assert.doesNotMatch(json, /secret@example\.com/);
});

test('reconcile flags 7d exceeding 30d', () => {
  const a = buildCanonicalWindowMetrics({
    byEvent: { session_start: 10, audit_started: 5, audit_completed: 1, pricing_viewed: 0, checkout_started: 0, demo_opened: 0, page_view: 0, first_visit: 0 },
    explicitQueried: true,
    stripe: { successfulLivePayments: 2, uniquePayingCustomers: 1, netLiveRevenueUsd: 10 }
  });
  const b = buildCanonicalWindowMetrics({
    byEvent: { session_start: 8, audit_started: 4, audit_completed: 1, pricing_viewed: 0, checkout_started: 0, demo_opened: 0, page_view: 0, first_visit: 0 },
    explicitQueried: true,
    stripe: { successfulLivePayments: 1, uniquePayingCustomers: 1, netLiveRevenueUsd: 10 }
  });
  const r = reconcileCanonicalWindows({ '7d': a, '30d': b });
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => /exceeds 30d/.test(w)));
});

test('experiment eval dates get correct weekdays from log ISO dates', () => {
  const md = `
### 2026-08-10 — EXP-001 Post-checkout

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-08-17 |
| Funnel stage | post-purchase activation |
| Primary metric | activation |
| Commit | abc |
| Amplify | 1 |

### 2026-08-12 — EXP-003 Analyzer

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-08-19 |
| Funnel stage | acquisition / SEO |
| Primary metric | starts |
| Commit | def |
| Amplify | 2 |
`;
  const ex = parseActiveExperiments(md);
  assert.equal(ex.length, 2);
  assert.equal(ex.find((e) => e.id === 'EXP-001')?.evalWeekday, 'Monday');
  assert.equal(ex.find((e) => e.id === 'EXP-003')?.evalWeekday, 'Wednesday');
  assert.equal(nextEvaluation(ex)?.id, 'EXP-001');
});

test('email does not attribute payment to experiments; EXP-001 shows CRM unavailable', () => {
  const md = `
### 2026-08-10 — EXP-001 Post-checkout

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-08-17 |
| Funnel stage | post-purchase activation |
| Primary metric | activation |
`;
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: parseActiveExperiments(md),
    generatedAt: '2026-08-13T16:00:00.000Z'
  });
  assert.match(report.text, /Experiment-attributed paid conversions: Unknown/);
  assert.match(report.text, /Admin CRM/);
  assert.doesNotMatch(report.text, /EXP-001.*\$19\.99/);
  assert.match(report.html, /Decision/);
  assert.doesNotMatch(report.html, /@example\.com/);
});

test('awaiting owner approval experiments appear; conversion is unavailable; UTF-8 body kept', () => {
  const md = `
### 2026-08-13 — EXP-004 Mini-audit

| Field | Value |
|-------|--------|
| Status | awaiting owner approval |
| Evaluation date | 2026-08-20 |
| Funnel stage | acquisition / distribution |
`;
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: parseActiveExperiments(md),
    notes: 'Café test — do not strip Unicode.',
    generatedAt: '2026-08-13T16:00:00.000Z'
  });
  assert.equal(parseActiveExperiments(md)[0].status, 'awaiting owner approval');
  assert.match(report.text, /EXP-004/);
  assert.match(report.text, /awaiting owner approval/i);
  assert.match(report.text, /Unavailable \(raw audit_completed/);
  assert.match(report.text, /COOK-001 uses CRM|same-cohort/i);
  assert.doesNotMatch(report.text, /275%/);
  assert.doesNotMatch(report.html, /275%/);
  assert.doesNotMatch(report.text, /complete\/start=/);
  assert.match(report.text, /GA4 data through/);
  assert.match(report.text, /Café test/);
  assert.match(report.html, /Café test/);
  assert.match(report.text, /verified_external_customers=0/);
  assert.match(report.text, /verified_external_revenue=\$0\.00/);
});
