import assert from 'node:assert/strict';
import test from 'node:test';
import { composeGrowthReport } from '../lib/compose-report.mjs';
import { parseActiveExperiments, nextFutureEvaluation, classifyExperiment } from '../lib/experiment-report.mjs';
import { formatDateRangeEt, ga4DataThroughYmd, inclusiveWindowStart } from '../lib/time.mjs';
import { explicitFunnelFixture } from './fixtures/report-inconsistency.mjs';

const FOUR_EXP = `
### 2026-08-10 — EXP-001 Post-checkout

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-08-17 |
| Funnel stage | post-purchase activation |
| Primary metric | activation |

### 2026-08-11 — EXP-002 SEO form

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-08-25 |
| Funnel stage | acquisition / SEO |

### 2026-08-12 — EXP-003 Analyzer

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-08-19 |
| Funnel stage | acquisition / SEO (nested surface) |

### 2026-08-13 — EXP-004 Mini-audit

| Field | Value |
|-------|--------|
| Status | awaiting owner approval |
| Evaluation date | 2026-08-20 |
| Funnel stage | founder outreach / acquisition distribution |
`;

test('date helpers: 7d/30d through Aug 16 match Aug 10-16 and Jul 18-Aug 16', () => {
  assert.equal(ga4DataThroughYmd('2026-08-17'), '2026-08-16');
  assert.equal(inclusiveWindowStart('2026-08-16', 7), '2026-08-10');
  assert.equal(inclusiveWindowStart('2026-08-16', 30), '2026-07-18');
  assert.equal(formatDateRangeEt('2026-08-10', '2026-08-16'), 'August 10-16, 2026');
  assert.equal(formatDateRangeEt('2026-07-18', '2026-08-16'), 'July 18-August 16, 2026');
});

test('subject does not count awaiting-approval as collecting; due eval is not future', () => {
  const report = composeGrowthReport({
    snapshot: {
      ...explicitFunnelFixture,
      reportDateEt: '2026-08-17',
      ga4DataThrough: '2026-08-16',
      windows: {
        '7d': { ...explicitFunnelFixture.windows['7d'], start: '2026-08-10', end: '2026-08-16' },
        '30d': { ...explicitFunnelFixture.windows['30d'], start: '2026-07-18', end: '2026-08-16' }
      }
    },
    health: { ok: true, checks: [] },
    experiments: parseActiveExperiments(FOUR_EXP),
    generatedAt: '2026-08-17T14:30:00.000Z',
    shipped: false
  });
  assert.match(report.subject, /Blocking approval required/);
  assert.match(report.subject, /0 new customers this run/);
  assert.doesNotMatch(report.subject, /4 experiments collecting/);
  assert.doesNotMatch(report.subject, /Change deployed/);
  assert.match(report.text, /ACQUISITION ACTION/);
  assert.match(report.text, /Newly attributed external customers \(this run\): 0/);
  assert.match(report.html, /Acquisition action/);
  assert.match(report.text, /GA4 data through: August 16, 2026/);
  assert.match(report.text, /7d: August 10-16, 2026/);
  assert.match(report.text, /30d: July 18-August 16, 2026/);
  assert.doesNotMatch(report.text, /The next evaluation is EXP-001/);
  assert.match(report.decision, /EXP-001 was due/);
  assert.match(report.decision, /not evaluated/);
  assert.match(report.text, /Decision: Due - not evaluated/);
  assert.doesNotMatch(report.text, /Decision: continue/i);
  assert.match(report.html, /Audit landing sessions/);
  assert.match(report.text, /Audit landing sessions:/);
  assert.doesNotMatch(report.html, /Qualified landings/i);
  const stripeWarns = report.warnings.filter((w) => /Stripe reconciliation is incomplete/i.test(w));
  assert.equal(stripeWarns.length, 1);
  assert.ok(report.warnings.some((w) => /unattributed 30-day Stripe/i.test(w)));
  assert.ok(report.warnings.some((w) => /Admin CRM/i.test(w)));
  assert.ok(report.warnings.some((w) => /same-cohort conversion/i.test(w)));
});

test('EXP-001 Inconclusive eval is recorded; EXP-004 is awaiting approval not collecting', () => {
  const md = FOUR_EXP.replace(
    '| Evaluation date | 2026-08-17 |',
    '| Evaluation date | 2026-08-17 |\n| Evaluation decision | Inconclusive |\n| Evaluation reason | Admin CRM activation data remains unavailable |'
  );
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: parseActiveExperiments(md),
    generatedAt: '2026-08-17T14:30:00.000Z',
    shipped: false
  });
  assert.match(report.decision, /EXP-001 was evaluated and marked Inconclusive/);
  assert.doesNotMatch(report.subject, /due eval missed/);
  const exp004 = report.experiments.find((e) => e.id === 'EXP-004');
  assert.equal(exp004.decision, 'Awaiting approval');
  assert.equal(exp004.collecting, false);
  const next = nextFutureEvaluation(report.experiments, '2026-08-17');
  assert.equal(next.id, 'EXP-003');
});

test('ship attribution block is required in executive section', () => {
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: parseActiveExperiments(FOUR_EXP),
    generatedAt: '2026-08-13T16:00:00.000Z',
    shipped: true,
    ship: {
      kind: 'acquisition',
      change: 'Reporting composer honesty repair (not a funnel treatment)',
      experiment: 'n/a',
      url: 'n/a',
      primaryMetric: 'report accuracy',
      attribution: 'none - measurement/reporting only',
      commit: 'abc123',
      amplify: 'not required',
      verification: 'growth tests passed'
    }
  });
  assert.match(report.subject, /Blocking approval required/);
  assert.match(report.html, /Acquisition action/);
  assert.match(report.text, /Commit: abc123/);
  assert.match(report.decision, /Production change \(not distribution by itself\)/);
  assert.match(report.text, /New customers acquired by the current run: 0/);
});

test('executed distribution leads the subject and scoreboard', () => {
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: parseActiveExperiments(FOUR_EXP),
    generatedAt: '2026-08-13T16:00:00.000Z',
    distribution: {
      executed: true,
      sesAcceptedThisRun: 1,
      channel: 'approved SES outreach',
      audience: 'named cooking creator (public contact page)',
      attributedVisits: 'Unknown until UTM',
      activations: '0 this run',
      checkoutStarts: '0 this run',
      newCustomersThisRun: 0,
      existingCustomers: 0,
      customersObservedInWindow: 0,
      experimentAttributedCustomers: 'Unknown',
      verifiedRevenue: '$0.00',
      requiredOwnerApproval: 'none',
      blockingApproval: false,
      exactActionPrepared: 'sent approved message id appr_1'
    }
  });
  assert.match(report.subject, /Distribution executed/);
  assert.match(report.text, /Distribution executed: yes/);
  assert.match(report.decision, /Distribution executed via approved SES outreach/);
  assert.doesNotMatch(report.decision, /BLOCKING OWNER APPROVAL/);
});

test('classifyExperiment never uses Continue', () => {
  const ex = classifyExperiment(
    { id: 'EXP-002', status: 'active', evalDate: '2026-08-25', funnelStage: 'acquisition / SEO' },
    { reportYmd: '2026-08-17' }
  );
  assert.equal(ex.decision, 'Keep');
  assert.notEqual(ex.decision, 'Continue');
});
