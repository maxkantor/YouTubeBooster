import assert from 'node:assert/strict';
import test from 'node:test';
import { composeGrowthReport, rateOrNa, revenuePer100, buildSubject } from '../lib/compose-report.mjs';
import { jsonForAwsCli } from '../notify-admin-email.mjs';
import { beginAuditAttempt, claimAuditCompletion } from '../lib/audit-event-gate.mjs';
import { classifyExperiment } from '../lib/experiment-report.mjs';
import { explicitFunnelFixture } from './fixtures/report-inconsistency.mjs';

function memoryStorage() {
  const map = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    }
  };
}

test('zero denominators report N/A', () => {
  assert.equal(rateOrNa(1, 0), 'N/A');
  assert.equal(rateOrNa(0, 0), 'N/A');
  assert.equal(rateOrNa(1, 2), '50.0%');
  assert.equal(revenuePer100(10, 0), 'N/A');
});

test('UTF-8 subject uses middot without latin-1 fallback', () => {
  const subject = buildSubject({
    prefix: 'YouTubeBooster Growth',
    et: { date: 'Aug 19, 2026' },
    dist: { executed: true, newCustomersThisRun: 0, blockingApproval: false }
  });
  assert.match(subject, /YouTubeBooster Growth · Distribution executed · 0 new customers this run · Aug 19, 2026/);
  assert.doesNotMatch(subject, /Â/);
  const json = jsonForAwsCli({ Subject: { Data: subject, Charset: 'UTF-8' } });
  assert.match(json, /\\u00b7/);
  assert.doesNotMatch(json, /Â/);
});

test('completion requires a recorded start', () => {
  const s = memoryStorage();
  assert.equal(claimAuditCompletion(s, 'never-started'), false);
  beginAuditAttempt(s, () => 'started-1');
  assert.equal(claimAuditCompletion(s, 'started-1'), true);
});

test('EXP-004 stays collecting before 100 sends or 14 days', () => {
  const ex = classifyExperiment(
    { id: 'EXP-004', status: 'active', evalDate: '2026-08-20', funnelStage: 'founder outreach' },
    { reportYmd: '2026-08-19', outreachSends: 2 }
  );
  assert.equal(ex.collecting, true);
  assert.equal(ex.dueUnevaluated, false);
  assert.equal(ex.decision, 'Keep');
});

test('report renders TODAY and cohort rates', () => {
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: [],
    generatedAt: '2026-08-19T16:00:00.000Z',
    distribution: {
      executed: true,
      channel: 'approved SES outreach',
      audience: 'cooking creators',
      blockingApproval: false,
      newCustomersThisRun: 0,
      cohort: {
        runId: 'COOK-001-2026-08-19',
        emailsSent: 10,
        auditClicks: 2,
        auditStarts: 2,
        auditCompletions: 1,
        signups: 1,
        checkoutStarts: 0,
        verifiedCustomers: 0,
        verifiedRevenue: 0
      }
    }
  });
  assert.match(report.text, /TODAY \(this-run SES ledger\)/);
  assert.match(report.text, /SES accepted this run: 10/);
  assert.match(report.text, /DELIVERABILITY/);
  assert.match(report.html, /SES accepted today/);
  assert.match(report.decision, /10 sent/);
  assert.match(report.text, /Send → Click: 20.0%/);
  assert.match(report.text, /Checkout → Paid: N\/A/);
});

test('sesAcceptedThisRun reconciles TODAY with lifetime CRM SENT', async () => {
  const { normalizeDistribution } = await import('../lib/compose-report.mjs');
  const d = normalizeDistribution({
    executed: true,
    sesAcceptedThisRun: 1,
    outreachFunnel: { drafted: 79, approved: 5, sent: 5, delivered: 'Unknown', clicked: 'Unknown', converted: 0 }
  });
  assert.equal(d.sesAcceptedThisRun, 1);
  assert.equal(d.cohort.emailsSent, 1);
  assert.equal(d.lifetimeCrmSent, 5);
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: [],
    generatedAt: '2026-08-24T16:00:00.000Z',
    distribution: {
      executed: true,
      sesAcceptedThisRun: 1,
      outreachFunnel: { drafted: 79, approved: 5, sent: 5, delivered: 'Unknown', clicked: 'Unknown', converted: 0 },
      blockingApproval: false,
      newCustomersThisRun: 0
    },
    strategyLock: {
      status: 'LOCKED',
      lockDay: 1,
      totalLockDays: 7,
      lockStartYmd: '2026-08-24',
      lockEndYmdInclusive: '2026-08-30',
      reviewYmd: '2026-08-31'
    }
  });
  assert.match(report.text, /STRATEGY STATUS: LOCKED/);
  assert.match(report.text, /LOCK DAY: 1 \/ 7/);
  assert.match(report.text, /SES accepted this run: 1/);
  assert.match(report.text, /Lifetime CRM SENT \(not today\): 5/);
  assert.match(report.text, /SES ACCEPTED TODAY: 1/);
  assert.match(report.text, /SENT LIFETIME \(CRM\): 5/);
  assert.doesNotMatch(report.text, /^Sent: 0$/m);
});

test('zero SES accepted cannot report Distribution executed yes', async () => {
  const { normalizeDistribution, buildSubject, composeGrowthReport } = await import('../lib/compose-report.mjs');
  const d = normalizeDistribution({
    executed: true,
    distributionAttempted: true,
    blockingApproval: false,
    sesAcceptedThisRun: 0,
    sesAttemptedThisRun: 0,
    prospectsEvaluated: 112,
    skipReasonCounts: { COOLDOWN: 7, INVALID_EMAIL: 100 },
    outreachFunnel: { drafted: 108, approved: 7, sent: 12 }
  });
  assert.equal(d.executed, false);
  assert.equal(d.sesAcceptedThisRun, 0);
  assert.equal(d.blockingApproval, false);
  const subject = buildSubject({
    prefix: 'YouTubeBooster Growth',
    et: { date: 'Sep 14, 2026' },
    dist: d
  });
  assert.match(subject, /Distribution failed/);
  assert.doesNotMatch(subject, /Distribution executed/);
  const report = composeGrowthReport({
    snapshot: explicitFunnelFixture,
    health: { ok: true, checks: [] },
    experiments: [],
    generatedAt: '2026-09-14T16:00:00.000Z',
    distribution: d
  });
  assert.match(report.text, /Distribution executed: no/);
  assert.match(report.text, /Distribution attempted: yes/);
  assert.match(report.text, /DISTRIBUTION FAILED \/ BLOCKED/);
  assert.match(report.text, /COOLDOWN: 7/);
  assert.match(report.text, /INVALID_EMAIL: 100/);
  assert.match(report.text, /PROSPECTS EVALUATED: 112/);
  assert.match(report.text, /SES ATTEMPTS \(API calls\): 0/);
});

test('SES accepted increments and keeps executed true', async () => {
  const { normalizeDistribution } = await import('../lib/compose-report.mjs');
  const d = normalizeDistribution({
    executed: true,
    sesAcceptedThisRun: 3,
    sesAttemptedThisRun: 3,
    prospectsEvaluated: 12
  });
  assert.equal(d.executed, true);
  assert.equal(d.sesAcceptedThisRun, 3);
  assert.equal(d.cohort.emailsSent, 3);
});
