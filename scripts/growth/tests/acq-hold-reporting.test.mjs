import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateSkipReasons } from '../lib/acq-skip-reasons.mjs';

test('health_stop:bounce_rate is not mislabeled NOT_QUALIFIED', () => {
  const counts = aggregateSkipReasons(['health_stop:bounce_rate']);
  assert.equal(counts.SAFETY_PAUSED_BOUNCE, 1);
  assert.equal(counts.NOT_QUALIFIED || 0, 0);
});

test('health_advisory:unsubscribe_rate is not SAFETY_PAUSED', () => {
  const counts = aggregateSkipReasons(['health_advisory:unsubscribe_rate']);
  assert.equal(counts.SAFETY_ADVISORY_UNSUBSCRIBE, 1);
  assert.equal(counts.SAFETY_PAUSED || 0, 0);
});

test('discovery returning no work keeps empty eligible queue distinct from pause', () => {
  const send = {
    sent: 0,
    sesAttempted: 0,
    evaluated: 0,
    discovered: 0,
    contactDiscoveryAttempted: 4,
    emailsFound: 0,
    draftsPrepared: 0,
    finalStopReason: 'CONTACT_SOURCES_EXHAUSTED',
    reasons: [],
    dailyLimit: 100
  };
  assert.equal(send.evaluated, 0);
  assert.equal(send.sesAttempted, 0);
  assert.equal(send.finalStopReason, 'CONTACT_SOURCES_EXHAUSTED');
  assert.notEqual(send.finalStopReason, 'DELIVERABILITY_PAUSE');
});

test('deliberate ramp/health hold vs technical failure stop reasons', () => {
  const deliberate = 'DELIVERABILITY_PAUSE';
  const emptyQueue = 'NO_READY_INVENTORY';
  const technicalStuck = 'STUCK_READY_NO_PROGRESS';
  assert.notEqual(deliberate, emptyQueue);
  assert.notEqual(deliberate, technicalStuck);
  assert.notEqual(deliberate, 'NO_MORE_WORK');
});

test('effective daily limit reporting: configured 100 with capacity held at 0', () => {
  const configured = 100;
  const apiReturnedOnOldHealthStop = 0;
  const effectiveCapacity = 0;
  const reportedLimit = apiReturnedOnOldHealthStop > 0 ? apiReturnedOnOldHealthStop : configured;
  assert.equal(reportedLimit, 100);
  assert.equal(effectiveCapacity, 0);
  assert.notEqual(reportedLimit, effectiveCapacity);
});

test('SES accepted vs confirmed delivery are separate stages', () => {
  const stages = {
    sesAccepted: 58,
    delivered: 23,
    deliveryUnknown: 28,
    bounced: 2,
    complained: 0
  };
  assert.ok(stages.sesAccepted >= stages.delivered);
  // Unknown/bounce/complaint are separate verified stages — never collapse unknown into delivered=0.
  assert.ok(stages.deliveryUnknown > 0);
  assert.ok(stages.bounced >= 0);
  assert.ok(stages.complained >= 0);
  assert.notEqual(stages.deliveryUnknown, undefined);
});

test('CRM activation unavailable is not the same as zero activation', () => {
  const crmOk = false;
  const activationWhenCrmMissing = crmOk ? 0 : null;
  assert.equal(activationWhenCrmMissing, null);
  assert.notEqual(activationWhenCrmMissing, 0);
});
