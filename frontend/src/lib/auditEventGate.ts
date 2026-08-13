/**
 * Audit start/completion gate — prevents duplicate GA4 completion fires on
 * remount/refresh/retry while allowing legitimate new audit attempts.
 *
 * No PII: attempt ids are random UUIDs; channel URLs are never stored in GA4 params.
 */

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const CURRENT_ATTEMPT_KEY = 'yb_ga4_audit_attempt_current';
const COMPLETED_IDS_KEY = 'yb_ga4_audit_completed_ids';
const STARTED_ORPHAN_KEY = 'yb_ga4_audit_orphan_started';

function readIdSet(storage: StorageLike, key: string): Set<string> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeIdSet(storage: StorageLike, key: string, set: Set<string>) {
  const arr = [...set].slice(-50);
  storage.setItem(key, JSON.stringify(arr));
}

export function createAuditAttemptId(randomUuid: () => string = () => crypto.randomUUID()): string {
  try {
    return randomUuid();
  } catch {
    return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Begin a user-initiated audit attempt (form submit). Persists current attempt id.
 */
export function beginAuditAttempt(
  storage: StorageLike,
  randomUuid?: () => string
): { attemptId: string; isNew: true } {
  const attemptId = createAuditAttemptId(randomUuid);
  storage.setItem(CURRENT_ATTEMPT_KEY, attemptId);
  return { attemptId, isNew: true };
}

export function getCurrentAuditAttemptId(storage: StorageLike): string | null {
  return storage.getItem(CURRENT_ATTEMPT_KEY);
}

/**
 * For /demo landings with a real user channel but no prior form start in this tab,
 * create at most one orphan start id per normalized channel key per session.
 */
export function ensureAuditAttemptForDemoLanding(
  storage: StorageLike,
  channelKey: string,
  randomUuid?: () => string
): { attemptId: string; shouldTrackStart: boolean } {
  const existing = getCurrentAuditAttemptId(storage);
  if (existing) {
    return { attemptId: existing, shouldTrackStart: false };
  }
  const orphans = readIdSet(storage, STARTED_ORPHAN_KEY);
  const orphanKey = `ch:${channelKey}`;
  if (orphans.has(orphanKey)) {
    // Already started once this session for this channel without a form id —
    // reuse a stable synthetic id so completion can dedupe.
    const stable = `orphan_${channelKey}`.slice(0, 80);
    storage.setItem(CURRENT_ATTEMPT_KEY, stable);
    return { attemptId: stable, shouldTrackStart: false };
  }
  const { attemptId } = beginAuditAttempt(storage, randomUuid);
  orphans.add(orphanKey);
  writeIdSet(storage, STARTED_ORPHAN_KEY, orphans);
  return { attemptId, shouldTrackStart: true };
}

/**
 * Returns true only the first time this attempt successfully completes.
 * Safe across remounts (sessionStorage) and duplicate callbacks.
 */
export function claimAuditCompletion(storage: StorageLike, attemptId: string | null): boolean {
  if (!attemptId) return false;
  const done = readIdSet(storage, COMPLETED_IDS_KEY);
  if (done.has(attemptId)) return false;
  done.add(attemptId);
  writeIdSet(storage, COMPLETED_IDS_KEY, done);
  return true;
}

/**
 * Showcase / built-in demo must not count as audit_completed.
 */
export function shouldCountAsUserAudit(isDefaultChannelDemo: boolean): boolean {
  return !isDefaultChannelDemo;
}

/** Test helpers */
export const auditGateKeys = {
  CURRENT_ATTEMPT_KEY,
  COMPLETED_IDS_KEY,
  STARTED_ORPHAN_KEY
};
