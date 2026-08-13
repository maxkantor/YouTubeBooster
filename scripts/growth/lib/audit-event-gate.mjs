/**
 * Mirror of frontend/src/lib/auditEventGate.ts for Node tests.
 * Keep behavior in sync when changing audit dedupe rules.
 */

const CURRENT_ATTEMPT_KEY = 'yb_ga4_audit_attempt_current';
const COMPLETED_IDS_KEY = 'yb_ga4_audit_completed_ids';
const STARTED_ORPHAN_KEY = 'yb_ga4_audit_orphan_started';

function readIdSet(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeIdSet(storage, key, set) {
  storage.setItem(key, JSON.stringify([...set].slice(-50)));
}

export function createAuditAttemptId(randomUuid = () => crypto.randomUUID()) {
  try {
    return randomUuid();
  } catch {
    return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function beginAuditAttempt(storage, randomUuid) {
  const attemptId = createAuditAttemptId(randomUuid);
  storage.setItem(CURRENT_ATTEMPT_KEY, attemptId);
  return { attemptId, isNew: true };
}

export function getCurrentAuditAttemptId(storage) {
  return storage.getItem(CURRENT_ATTEMPT_KEY);
}

export function ensureAuditAttemptForDemoLanding(storage, channelKey, randomUuid) {
  const existing = getCurrentAuditAttemptId(storage);
  if (existing) {
    return { attemptId: existing, shouldTrackStart: false };
  }
  const orphans = readIdSet(storage, STARTED_ORPHAN_KEY);
  const orphanKey = `ch:${channelKey}`;
  if (orphans.has(orphanKey)) {
    const stable = `orphan_${channelKey}`.slice(0, 80);
    storage.setItem(CURRENT_ATTEMPT_KEY, stable);
    return { attemptId: stable, shouldTrackStart: false };
  }
  const { attemptId } = beginAuditAttempt(storage, randomUuid);
  orphans.add(orphanKey);
  writeIdSet(storage, STARTED_ORPHAN_KEY, orphans);
  return { attemptId, shouldTrackStart: true };
}

export function claimAuditCompletion(storage, attemptId) {
  if (!attemptId) return false;
  const done = readIdSet(storage, COMPLETED_IDS_KEY);
  if (done.has(attemptId)) return false;
  done.add(attemptId);
  writeIdSet(storage, COMPLETED_IDS_KEY, done);
  return true;
}

export function shouldCountAsUserAudit(isDefaultChannelDemo) {
  return !isDefaultChannelDemo;
}
