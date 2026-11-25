import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateSkipReasons,
  dominantSkipReason,
  normalizeSkipReason,
  resolveAcquisitionSendingStatus
} from '../lib/acq-skip-reasons.mjs';
import { buildDistribution } from '../run-daily-growth-job.mjs';
import {
  composeGrowthReport,
  formatCrmAcquisitionText,
  isAcquisitionRunning,
  normalizeDistribution
} from '../lib/compose-report.mjs';

test('health_advisory:unsubscribe_rate is not SAFETY_PAUSED', () => {
  assert.equal(normalizeSkipReason('health_advisory:unsubscribe_rate'), 'SAFETY_ADVISORY_UNSUBSCRIBE');
  const counts = aggregateSkipReasons(['health_advisory:unsubscribe_rate']);
  assert.equal(counts.SAFETY_ADVISORY_UNSUBSCRIBE, 1);
  assert.equal(counts.SAFETY_PAUSED || 0, 0);
  assert.equal(counts.SAFETY_PAUSED_UNSUBSCRIBE || 0, 0);
});

test('health_stop:unsubscribe_rate maps to SAFETY_PAUSED_UNSUBSCRIBE', () => {
  const counts = aggregateSkipReasons(['health_stop:unsubscribe_rate']);
  assert.equal(counts.SAFETY_PAUSED_UNSUBSCRIBE, 1);
  assert.equal(counts.SAFETY_ADVISORY_UNSUBSCRIBE || 0, 0);
});

test('health_stop bounce and complaint remain distinct hard pauses', () => {
  assert.equal(aggregateSkipReasons(['health_stop:bounce_rate']).SAFETY_PAUSED_BOUNCE, 1);
  assert.equal(aggregateSkipReasons(['health_stop:complaint_rate']).SAFETY_PAUSED_COMPLAINT, 1);
});

test('resolveAcquisitionSendingStatus hard-stops unsubscribe_rate', () => {
  const status = resolveAcquisitionSendingStatus({
    crmAutomaticSending: true,
    crmAutomaticPauseReason: null,
    reasons: ['health_stop:unsubscribe_rate'],
    rampBlockReason: 'unsubscribe_rate'
  });
  assert.equal(status.deliverabilityPaused, true);
  assert.equal(status.automaticSending, false);
  assert.equal(status.distributionPermitted, false);
  assert.equal(status.healthReason, 'unsubscribe_rate');
  assert.match(status.automaticPauseReason, /DELIVERABILITY|unsubscribe/i);
});

test('advisory alone does not invent hard SAFETY_PAUSED skip code', () => {
  const counts = aggregateSkipReasons(['health_advisory:unsubscribe_rate', 'score_below_70']);
  assert.equal(dominantSkipReason(counts).startsWith('SAFETY_ADVISORY_UNSUBSCRIBE'), true);
  assert.equal(counts.NOT_QUALIFIED, 1);
});

test('buildDistribution: hard unsub pause is not RUNNING', () => {
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
        invalidEmails: 0,
        invocations: 1
      },
      crmSummary: {
        automaticSending: true,
        automaticPauseReason: null,
        sendingMode: 'automatic',
        dailyLimit: 100,
        dailyRemaining: 100,
        sentToday: 0
      },
      funnel: {},
      cohortFunnel: {}
    },
    '2026-11-10',
    { dryRun: false },
    null
  );
  assert.equal(dist.automaticSending, false);
  assert.ok(dist.automaticPauseReason);
  assert.equal(dist.distributionPermitted, false);
  assert.equal(dist.executed, false);
  assert.equal(dist.skipReasonCounts.SAFETY_PAUSED_UNSUBSCRIBE, 1);
  assert.equal(dist.skipReasonCounts.SAFETY_PAUSED || 0, 0);
  assert.match(dist.exactActionPrepared, /DELIVERABILITY SAFETY PAUSE/);
  assert.match(dist.deliverability.unsubscribeRate, /≥2%/);
});

test('buildDistribution: empty inventory / CONTACT_DISCOVERY_NO_PROGRESS stays distinct', () => {
  const dist = buildDistribution(
    {
      send: {
        sent: 0,
        attempted: 0,
        sesAttempted: 0,
        evaluated: 0,
        reasons: [],
        finalStopReason: 'CONTACT_DISCOVERY_NO_PROGRESS',
        rampBlockReason: 'ramp_disabled',
        dailyLimit: 100,
        contactDiscoveryAttempted: 4,
        emailsFound: 0,
        draftsPrepared: 0,
        discovered: 0,
        invalidEmails: 4,
        invocations: 1
      },
      crmSummary: {
        automaticSending: true,
        automaticPauseReason: null,
        sendingMode: 'automatic',
        dailyLimit: 100,
        dailyRemaining: 100,
        pipeline: { eligibleNow: 0, readyToSend: 0 }
      },
      funnel: {},
      cohortFunnel: {}
    },
    '2026-11-10',
    { dryRun: false },
    null
  );
  assert.equal(dist.automaticSending, true);
  assert.equal(dist.finalStopReason, 'CONTACT_DISCOVERY_NO_PROGRESS');
  assert.equal(dist.executed, false);
  assert.equal(dist.sesAcceptedThisRun, 0);
  assert.equal(dist.contactDiscoveryAttempted, 4);
  assert.equal(dist.publicEmailsFound, 0);
  assert.doesNotMatch(dist.exactActionPrepared, /DELIVERABILITY SAFETY PAUSE/);
});

test('buildDistribution: successful SES marks executed and RUNNING when not paused', () => {
  const dist = buildDistribution(
    {
      send: {
        sent: 2,
        attempted: 2,
        sesAttempted: 2,
        evaluated: 5,
        reasons: [],
        finalStopReason: 'COMPLETE',
        dailyLimit: 100,
        contactDiscoveryAttempted: 0,
        emailsFound: 0,
        draftsPrepared: 0,
        discovered: 0,
        invocations: 1
      },
      crmSummary: {
        automaticSending: true,
        automaticPauseReason: null,
        sendingMode: 'automatic',
        dailyLimit: 100,
        dailyRemaining: 98
      },
      funnel: { sent: 60, delivered: 25, clicked: 1, converted: 0 },
      cohortFunnel: {}
    },
    '2026-11-10',
    { dryRun: false },
    null
  );
  assert.equal(dist.executed, true);
  assert.equal(dist.automaticSending, true);
  assert.equal(dist.sesAcceptedThisRun, 2);
  assert.equal(dist.distributionPermitted, true);
});

test('compose report does not say RUNNING when safety pause is active', () => {
  const d = normalizeDistribution({
    executed: false,
    distributionAttempted: false,
    sesAcceptedThisRun: 0,
    sendingMode: 'automatic',
    automaticSending: false,
    automaticPauseReason: 'DELIVERABILITY SAFETY PAUSE (unsubscribe_rate)',
    finalStopReason: 'DELIVERABILITY_PAUSE',
    skipReasonCounts: { SAFETY_PAUSED_UNSUBSCRIBE: 1 },
    crmSummaryOk: true,
    dailyLimit: 100,
    dailyRemaining: 0
  });
  assert.equal(isAcquisitionRunning(d), false);
  assert.match(d.crmActionMessage, /PAUSED/);
  assert.doesNotMatch(d.crmActionMessage, /^AUTOMATIC ACQUISITION: RUNNING$/);

  const report = composeGrowthReport({
    snapshot: { sources: { ga4: 'ok', stripe: 'ok', crm: 'ok' }, windows: {} },
    health: { ok: true, checks: [{ name: 'api', ok: true }] },
    experiments: [],
    generatedAt: '2026-11-10T16:00:00.000Z',
    distribution: d
  });
  assert.match(report.subject, /Safety paused/i);
  assert.match(report.text, /SAFETY_PAUSED|PAUSED/);
  assert.doesNotMatch(report.text, /AUTOMATIC ACQUISITION: RUNNING\. Owner action required: NONE/);

  const lines = formatCrmAcquisitionText(d).join('\n');
  assert.match(lines, /PAUSED/);
  assert.doesNotMatch(lines, /Automatic: RUNNING/);
});
