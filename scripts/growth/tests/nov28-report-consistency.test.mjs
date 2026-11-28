import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeGrowthReport,
  normalizeDistribution,
  buildSubject
} from '../lib/compose-report.mjs';
import { validateGrowthReportConsistency } from '../lib/report-consistency.mjs';
import { metricNumber } from '../lib/report-consistency.mjs';
import { tryClaimAdminReportSlot } from '../lib/admin-report-once.mjs';
import { parseActiveExperiments } from '../lib/experiment-report.mjs';
import { buildDistribution } from '../run-daily-growth-job.mjs';

test('zero eligible approvals cannot produce BLOCKING APPROVAL', () => {
  const d = normalizeDistribution({
    needsApproval: 0,
    blockingApproval: true,
    requiredOwnerApproval: 'APR-20261127-cook001-two',
    automaticSending: true,
    sendingMode: 'automatic',
    sesAcceptedThisRun: 0,
    crmSummaryOk: true,
    pipeline: { eligibleNow: 0, readyToSend: 0, approvedEligibleNow: 0 }
  });
  assert.equal(d.blockingApproval, false);
  assert.equal(d.requiredOwnerApproval, 'none');
  const subject = buildSubject({
    prefix: 'YouTubeBooster Growth',
    et: { date: 'Nov 28, 2026' },
    dist: d,
    paidCustomers7d: 0
  });
  assert.doesNotMatch(subject, /BLOCKING APPROVAL/i);
});

test('unsubscribed / invented APR package is rejected by validation', () => {
  const v = validateGrowthReportConsistency({
    dist: {
      needsApproval: 0,
      blockingApproval: true,
      readyToSend: 0,
      clicks: { today: 0, last7Days: 0, lifetime: 1 },
      cohort: { auditClicks: 1, emailsSent: 0 },
      sesAcceptedThisRun: 0
    },
    decision: 'BLOCKING OWNER APPROVAL: true\nAPR-20261127-cook001-two\n@bowlofdelicious @thecafesucrefarine',
    notes: 'Clear the COOK-001 safety pause and send APR-20261127-cook001-two'
  });
  assert.equal(v.ok, false);
  assert.equal(v.dist.blockingApproval, false);
  assert.ok(v.errors.some((e) => /needsApproval=0|narrative|approval/i.test(e)));
  assert.ok(v.errors.some((e) => /pause/i.test(e)) || /preserve safety pause/i.test(v.notes));
});

test('lifetime click is not presented as this-run cohort click when SES=0', () => {
  const d = normalizeDistribution({
    sesAcceptedThisRun: 0,
    clicks: { today: 0, last7Days: 0, lifetime: 1 },
    outreachFunnel: { clicked: 1, sent: 58 },
    cohort: { emailsSent: 0, auditClicks: 1, verifiedCustomers: 0, verifiedRevenue: 0 },
    needsApproval: 0,
    crmSummaryOk: true
  });
  const v = validateGrowthReportConsistency({ dist: d, decision: 'Current funnel: 0 sent → 1 click' });
  assert.equal(v.dist.cohort.auditClicks, 0);
});

test('site-wide audit_starts key is read (not only audit_started)', () => {
  const m7 = { audit_starts: { value: 5, unit: 'events' }, audit_started: undefined };
  assert.equal(metricNumber(m7, 'audit_starts', 'audit_started'), 5);
  const dist = buildDistribution(
    {
      send: {
        sent: 0,
        attempted: 0,
        sesAttempted: 0,
        evaluated: 0,
        reasons: ['health_stop:unsubscribe_rate'],
        finalStopReason: 'DELIVERABILITY_PAUSE',
        rampBlockReason: 'unsubscribe_rate',
        dailyLimit: 100,
        contactDiscoveryAttempted: 0,
        emailsFound: 0,
        draftsPrepared: 0,
        discovered: 0,
        invocations: 1
      },
      crmSummary: {
        automaticSending: false,
        automaticPauseReason: 'DELIVERABILITY SAFETY PAUSE',
        sendingMode: 'automatic',
        dailyLimit: 100,
        dailyRemaining: 0,
        clickedToday: 0,
        clickedLast7Days: 0,
        clicked: 1,
        clicks: { today: 0, last7Days: 0, lifetime: 1 }
      },
      funnel: { clicked: 1, sent: 58 },
      cohortFunnel: { clicked: 1, auditStarts: 0, auditCompletions: 0 }
    },
    '2026-11-28',
    { dryRun: true },
    { windows: { '7d': { metrics: m7 } } }
  );
  assert.match(dist.activations, /site-wide 7d GA4 audit_starts: 5/);
  assert.equal(dist.cohort.auditClicks, 0);
  assert.match(dist.attributedVisits, /0 clicks today/);
});

test('safety pause keeps capacity 0 and does not recommend clearing', () => {
  const report = composeGrowthReport({
    snapshot: {
      sources: { ga4: 'ok', stripe: 'ok', crm: 'ok' },
      windows: {
        '7d': {
          metrics: {
            sessions: { value: 24 },
            audit_starts: { value: 5 },
            audit_completions: { value: 5 },
            pricing_viewers: { value: 5 },
            checkout_starts: { value: 0 },
            unique_paying_customers: { value: 0 }
          }
        },
        '30d': { metrics: {} }
      }
    },
    health: { ok: true, checks: [{ name: 'api', ok: true }] },
    experiments: [],
    generatedAt: '2026-11-28T13:10:00.000Z',
    notes:
      'BLOCKING OWNER APPROVAL: true. APR-20261127-cook001-two for @bowlofdelicious and @thecafesucrefarine. Clear the safety pause.',
    distribution: {
      executed: false,
      distributionAttempted: false,
      sesAcceptedThisRun: 0,
      needsApproval: 0,
      blockingApproval: true,
      automaticSending: false,
      automaticPauseReason: 'DELIVERABILITY SAFETY PAUSE (unsubscribe_rate)',
      sendingMode: 'automatic',
      dailyLimit: 100,
      dailyRemaining: 0,
      crmSummaryOk: true,
      clicks: { today: 0, last7Days: 0, lifetime: 1 },
      outreachFunnel: { drafted: 127, sent: 58, delivered: 23, clicked: 1, converted: 0 },
      cohort: {
        emailsSent: 0,
        auditClicks: 1,
        auditStarts: 0,
        auditCompletions: 0,
        verifiedCustomers: 0,
        verifiedRevenue: 0,
        rampBlockReason: 'unsubscribe_rate',
        dailyLimit: 100
      },
      deliverability: {
        unsubscribeRate: 'at/above stop threshold (≥2%)',
        dailyLimit: 100,
        nextRampDecision: 'PAUSED — unsubscribe_rate; effective send capacity 0'
      },
      activations: '0 COOK-001 CRM audit_started (site-wide 7d GA4 audit_starts: 5)',
      attributedVisits: '0 clicks today / 0 in 7d / 1 lifetime (COOK-001 CRM)',
      _siteWideAuditStarts7d: 5,
      pipeline: { eligibleNow: 0, readyToSend: 0, approvedEligibleNow: 0 },
      skipReasonCounts: { SAFETY_PAUSED_UNSUBSCRIBE: 1 }
    }
  });
  assert.doesNotMatch(report.subject, /BLOCKING APPROVAL/i);
  assert.match(report.subject, /Safety paused/i);
  assert.equal(report.dist.blockingApproval, false);
  assert.equal(report.consistency.ok, false);
  assert.doesNotMatch(report.text, /APR-20261127-cook001-two/);
  assert.match(report.text, /site-wide 7d GA4 audit_starts: 5|Audit starts[\s\S]*5/i);
  assert.match(report.text, /SAFETY_PAUSED|PAUSED/);
  assert.doesNotMatch(report.text, /Clear the COOK-001 safety pause/i);
});

test('force claim allows authorized diagnostic without treating as normal scheduled send', () => {
  const forced = tryClaimAdminReportSlot({ ymd: '2099-01-01', force: true, source: 'diagnostic' });
  assert.equal(forced.ok, true);
  assert.equal(forced.forced, true);
});

test('experiment status comes from persisted experiment log, not agent notes', () => {
  const md = `
### 2026-08-14 — EXP-004 COOK-001 weekday outreach

| Field | Value |
|-------|--------|
| Status | active |
| Evaluation date | 2026-12-01 |
| Funnel stage | founder outreach / acquisition distribution |
| Primary metric | attributed paid customers |
`;
  const experiments = parseActiveExperiments(md);
  assert.equal(experiments.length, 1);
  assert.match(String(experiments[0].status || ''), /active/i);
  const report = composeGrowthReport({
    snapshot: { sources: {}, windows: { '7d': { metrics: {} }, '30d': { metrics: {} } } },
    health: { ok: true, checks: [] },
    experiments,
    notes: 'Agent override: EXP-004 is paused and evaluation already failed.',
    generatedAt: '2026-11-28T13:10:00.000Z',
    distribution: {
      needsApproval: 0,
      crmSummaryOk: true,
      automaticSending: false,
      automaticPauseReason: 'DELIVERABILITY SAFETY PAUSE (unsubscribe_rate)',
      clicks: { today: 0, last7Days: 0, lifetime: 0 },
      sesAcceptedThisRun: 0
    }
  });
  const exp004 = report.experiments.find((e) => e.id === 'EXP-004');
  assert.ok(exp004);
  assert.match(String(exp004.status || ''), /active/i);
  // Experiment block is driven by the persisted log status, not the agent narrative.
  assert.match(report.text, /Status:\s*active/i);
  assert.doesNotMatch(report.text, /Status:\s*paused/i);
  assert.match(report.text, /Decision recorded: Keep \(COLLECTING\)/i);
});
