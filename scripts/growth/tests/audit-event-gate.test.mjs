import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginAuditAttempt,
  claimAuditCompletion,
  ensureAuditAttemptForDemoLanding,
  shouldCountAsUserAudit
} from '../lib/audit-event-gate.mjs';

function memoryStorage() {
  /** @type {Record<string, string>} */
  const map = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    }
  };
}

test('showcase demo is not a user audit', () => {
  assert.equal(shouldCountAsUserAudit(true), false);
  assert.equal(shouldCountAsUserAudit(false), true);
});

test('completion dedupes across remount / duplicate callback', () => {
  const s = memoryStorage();
  const { attemptId } = beginAuditAttempt(s, () => 'attempt-1');
  assert.equal(claimAuditCompletion(s, attemptId), true);
  assert.equal(claimAuditCompletion(s, attemptId), false);
  assert.equal(claimAuditCompletion(s, attemptId), false);
});

test('refresh with same attempt does not re-complete', () => {
  const s = memoryStorage();
  beginAuditAttempt(s, () => 'attempt-refresh');
  assert.equal(claimAuditCompletion(s, 'attempt-refresh'), true);
  const again = ensureAuditAttemptForDemoLanding(s, 'userchannel', () => 'should-not-create');
  assert.equal(again.shouldTrackStart, false);
  assert.equal(claimAuditCompletion(s, again.attemptId), false);
});

test('new attempt after prior completion is allowed', () => {
  const s = memoryStorage();
  beginAuditAttempt(s, () => 'a1');
  assert.equal(claimAuditCompletion(s, 'a1'), true);
  beginAuditAttempt(s, () => 'a2');
  assert.equal(claimAuditCompletion(s, 'a2'), true);
});

test('orphan demo landing tracks start once per channel key', () => {
  const s = memoryStorage();
  const first = ensureAuditAttemptForDemoLanding(s, 'acme', () => 'orphan-1');
  assert.equal(first.shouldTrackStart, true);
  const second = ensureAuditAttemptForDemoLanding(s, 'acme', () => 'orphan-2');
  assert.equal(second.shouldTrackStart, false);
});

test('cached-result / retry path: claim blocks second completion fire', () => {
  const s = memoryStorage();
  const { attemptId } = beginAuditAttempt(s, () => 'retry-1');
  assert.equal(claimAuditCompletion(s, attemptId), true);
  assert.equal(claimAuditCompletion(s, attemptId), false);
});
