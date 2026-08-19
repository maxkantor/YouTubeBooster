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
  assert.match(report.text, /TODAY/);
  assert.match(report.text, /DELIVERABILITY/);
  assert.match(report.html, />Today</);
  assert.match(report.decision, /10 sent/);
  assert.match(report.text, /Send → Click: 20.0%/);
  assert.match(report.text, /Checkout → Paid: N\/A/);
});
