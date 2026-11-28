/**
 * Shared Admin report-send claim: concurrent runners, pre-SES retry, post-sent retry,
 * and SES-accept with marker-write failure. All stores are in-memory mocks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createAdminReportDedupe,
  isActiveClaim,
  CLAIM_TTL_MS
} from '../lib/admin-report-once.mjs';

function mockStore(initial = null) {
  let ssm = initial;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-report-claim-'));
  let clock = Date.parse('2026-11-28T13:00:00.000Z');
  const dedupe = createAdminReportDedupe({
    ssmGet: () => (ssm ? { ...ssm } : null),
    ssmPut: (payload) => {
      ssm = { ...payload };
      return true;
    },
    localPath: (ymd) => path.join(dir, `sent-${ymd}.json`),
    now: () => clock,
    sleep: () => {},
    claimSettleMs: 0
  });
  return {
    dedupe,
    get ssm() {
      return ssm;
    },
    setSsm(v) {
      ssm = v;
    },
    dir,
    advance(ms) {
      clock += ms;
    }
  };
}

test('concurrent claims: settle re-read leaves a single winner', () => {
  let ssm = null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-report-race-'));
  let clock = Date.parse('2026-11-28T13:00:00.000Z');

  const first = createAdminReportDedupe({
    ssmGet: () => (ssm ? { ...ssm } : null),
    ssmPut: (payload) => {
      ssm = { ...payload };
      return true;
    },
    localPath: (ymd) => path.join(dir, `a-${ymd}.json`),
    now: () => clock,
    // During settle, a concurrent runner overwrites SSM — first must lose.
    sleep: () => {
      ssm = {
        ymd: '2026-11-28',
        status: 'claiming',
        claimId: 'claim-b',
        source: 'runner-b',
        claimedAt: new Date(clock).toISOString()
      };
    },
    claimSettleMs: 50
  });

  const c1 = first.tryClaimAdminReportSlot({ ymd: '2026-11-28', source: 'runner-a', claimId: 'claim-a' });
  assert.equal(c1.ok, false);
  assert.equal(c1.alreadySent, true);
  assert.equal(c1.record.claimId, 'claim-b');

  const second = createAdminReportDedupe({
    ssmGet: () => (ssm ? { ...ssm } : null),
    ssmPut: (payload) => {
      ssm = { ...payload };
      return true;
    },
    localPath: (ymd) => path.join(dir, `b-${ymd}.json`),
    now: () => clock + 5,
    sleep: () => {},
    claimSettleMs: 50
  });
  // claim-b already on SSM from the race overwrite; resume as owner.
  const c2 = second.tryClaimAdminReportSlot({
    ymd: '2026-11-28',
    source: 'runner-b',
    resumeClaimId: 'claim-b'
  });
  assert.equal(c2.ok, true);
  assert.equal(c2.resumed, true);

  const stranger = second.tryClaimAdminReportSlot({
    ymd: '2026-11-28',
    source: 'runner-c',
    claimId: 'claim-c'
  });
  assert.equal(stranger.ok, false);
});

test('sequential second runner loses to an active claim', () => {
  const store = mockStore();
  const ymd = '2026-11-28';
  const c1 = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'a', claimId: 'claim-a' });
  const c2 = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'b', claimId: 'claim-b' });
  assert.equal(c1.ok, true);
  assert.equal(c2.ok, false);
  assert.equal(c2.record.claimId, 'claim-a');
});

test('retry after failure before SES acceptance can reclaim', () => {
  const store = mockStore();
  const ymd = '2026-11-28';
  const claim = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'compose', claimId: 'c1' });
  assert.equal(claim.ok, true);

  const rel = store.dedupe.releaseAdminReportClaim({ ymd, claimId: 'c1', source: 'compose' });
  assert.equal(rel.released, true);
  assert.equal(store.ssm.status, 'released');
  assert.equal(isActiveClaim(store.ssm, ymd, Date.parse('2026-11-28T13:00:00.000Z')), false);
  assert.equal(store.dedupe.getAdminReportSentToday(ymd).alreadySent, false);

  const retry = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'compose-retry', claimId: 'c2' });
  assert.equal(retry.ok, true);
  assert.equal(retry.claim.claimId, 'c2');
});

test('retry after completed send is blocked (no duplicate)', () => {
  const store = mockStore();
  const ymd = '2026-11-28';
  const claim = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'compose', claimId: 'c1' });
  assert.equal(claim.ok, true);
  store.dedupe.markAdminReportSentToday({
    ymd,
    messageId: 'ses-msg-1',
    claimId: 'c1',
    source: 'compose'
  });

  const retry = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'compose-retry', claimId: 'c2' });
  assert.equal(retry.ok, false);
  assert.equal(retry.alreadySent, true);
  assert.equal(retry.record.messageId, 'ses-msg-1');

  const rel = store.dedupe.releaseAdminReportClaim({ ymd, claimId: 'c1' });
  assert.equal(rel.released, false);
  assert.equal(rel.reason, 'already_sent');
  assert.equal(store.ssm.messageId, 'ses-msg-1');
});

test('SES accepts but sent-marker SSM write fails: local + hybrid still block duplicates', () => {
  let ssm = null;
  let putAttempts = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-report-ssmfail-'));
  const clock = { t: Date.parse('2026-11-28T13:00:00.000Z') };
  const dedupe = createAdminReportDedupe({
    ssmGet: () => (ssm ? { ...ssm } : null),
    ssmPut: (payload) => {
      putAttempts += 1;
      if (payload.status === 'sent') return false;
      ssm = { ...payload };
      return true;
    },
    localPath: (ymd) => path.join(dir, `sent-${ymd}.json`),
    now: () => clock.t,
    sleep: () => {},
    claimSettleMs: 0
  });

  const ymd = '2026-11-28';
  const claim = dedupe.tryClaimAdminReportSlot({ ymd, source: 'compose', claimId: 'c1' });
  assert.equal(claim.ok, true);

  const marker = dedupe.markAdminReportSentToday({
    ymd,
    messageId: 'ses-accepted-99',
    claimId: 'c1',
    source: 'compose'
  });
  assert.equal(marker.localOk, true);
  assert.equal(marker.messageId, 'ses-accepted-99');
  const local = JSON.parse(fs.readFileSync(path.join(dir, `sent-${ymd}.json`), 'utf8'));
  assert.equal(local.status, 'sent');
  assert.equal(local.messageId, 'ses-accepted-99');
  assert.ok(ssm?.messageId === 'ses-accepted-99');
  assert.equal(isActiveClaim(ssm, ymd, clock.t), true);

  const other = createAdminReportDedupe({
    ssmGet: () => (ssm ? { ...ssm } : null),
    ssmPut: (payload) => {
      ssm = { ...payload };
      return true;
    },
    localPath: (ymd2) => path.join(dir, `other-${ymd2}.json`),
    now: () => clock.t,
    sleep: () => {},
    claimSettleMs: 0
  });
  const dup = other.tryClaimAdminReportSlot({ ymd, source: 'other-runner', claimId: 'c-other' });
  assert.equal(dup.ok, false);
  assert.equal(dup.alreadySent, true);
  assert.ok(putAttempts >= 1);
});

test('resumeClaimId lets parent early-claim continue in child without duplicate claim', () => {
  const store = mockStore();
  const ymd = '2026-11-28';
  const parent = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'run-daily', claimId: 'parent-1' });
  assert.equal(parent.ok, true);

  const child = store.dedupe.tryClaimAdminReportSlot({
    ymd,
    source: 'compose-and-send',
    resumeClaimId: 'parent-1'
  });
  assert.equal(child.ok, true);
  assert.equal(child.resumed, true);

  const stranger = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'windows', claimId: 'win-1' });
  assert.equal(stranger.ok, false);
});

test('expired claiming TTL allows a new claim', () => {
  const store = mockStore();
  const ymd = '2026-11-28';
  store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'stale', claimId: 'old' });
  store.advance(CLAIM_TTL_MS + 1);
  const next = store.dedupe.tryClaimAdminReportSlot({ ymd, source: 'fresh', claimId: 'new' });
  assert.equal(next.ok, true);
  assert.equal(next.claim.claimId, 'new');
});
