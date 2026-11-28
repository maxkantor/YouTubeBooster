/**
 * Cross-runner daily Admin report dedupe (Cursor Automation + Windows backup).
 * Uses SSM so cloud and local share one "already sent today (ET)" flag.
 *
 * Flow:
 *  1. tryClaimAdminReportSlot — status=claiming (blocks concurrent scheduled sends)
 *  2. SES send
 *  3. markAdminReportSentToday — status=sent + messageId (local first, SSM with retries)
 *
 * If SES accepts but SSM put fails, local marker still has messageId (same host),
 * and we write a claiming+messageId hybrid so other hosts treat the day as sent.
 * Claiming without messageId can be released so a pre-SES failure can retry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnAws } from './aws-cli.mjs';
import { etDateParts } from './time.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const REGION = process.env.AWS_REGION || 'us-east-1';
export const ADMIN_REPORT_SSM_NAME = '/youtubebooster/growth/last-admin-report';
export const CLAIM_TTL_MS = 45 * 60 * 1000;
export const CLAIM_SETTLE_MS = 75;
const SSM_PUT_RETRIES = 3;

function defaultLocalMarkerPath(ymd) {
  return path.join(ROOT, 'docs/growth/logs', `admin-report-sent-${ymd}.json`);
}

function syncSleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    /* ignore */
  }
}

function defaultSsmGet() {
  const r = spawnAws(
    [
      'ssm',
      'get-parameter',
      '--name',
      ADMIN_REPORT_SSM_NAME,
      '--region',
      REGION,
      '--query',
      'Parameter.Value',
      '--output',
      'text'
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) return null;
  const raw = (r.stdout || '').trim();
  if (!raw || raw === 'None') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { ymd: raw };
  }
}

function defaultSsmPut(payload) {
  const r = spawnAws(
    [
      'ssm',
      'put-parameter',
      '--name',
      ADMIN_REPORT_SSM_NAME,
      '--type',
      'String',
      '--overwrite',
      '--region',
      REGION,
      '--value',
      JSON.stringify(payload)
    ],
    { encoding: 'utf8' }
  );
  return r.status === 0;
}

/** True when another scheduled send must not proceed for this ET day. */
export function isActiveClaim(record, ymdEt, nowMs = Date.now()) {
  if (!record || record.ymd !== ymdEt) return false;
  // SES already accepted — never allow another scheduled send that day.
  if (record.messageId || record.status === 'sent') return true;
  if (record.status === 'released') return false;
  if (record.status === 'claiming' && record.claimedAt) {
    const ageMs = nowMs - Date.parse(record.claimedAt);
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < CLAIM_TTL_MS;
  }
  // Legacy markers without status still count as already sent for that ET day.
  return true;
}

/**
 * @param {{
 *   ssmGet?: () => object|null,
 *   ssmPut?: (payload: object) => boolean,
 *   localPath?: (ymd: string) => string,
 *   now?: () => number,
 *   sleep?: (ms: number) => void,
 *   claimSettleMs?: number
 * }} [deps]
 */
export function createAdminReportDedupe(deps = {}) {
  const ssmGet = deps.ssmGet || defaultSsmGet;
  const ssmPut = deps.ssmPut || defaultSsmPut;
  const localPath = deps.localPath || defaultLocalMarkerPath;
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || syncSleep;
  const claimSettleMs = deps.claimSettleMs ?? CLAIM_SETTLE_MS;

  function readLocal(ymd) {
    const p = localPath(ymd);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return { ymd };
    }
  }

  function writeLocal(ymd, payload) {
    const p = localPath(ymd);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return true;
  }

  function putWithRetries(payload, retries = SSM_PUT_RETRIES) {
    let ssmOk = false;
    for (let i = 0; i < retries; i++) {
      ssmOk = ssmPut(payload) === true;
      if (ssmOk) break;
      if (i < retries - 1) sleep(25 * (i + 1));
    }
    return ssmOk;
  }

  function readShared(ymd) {
    const ssm = ssmGet();
    if (ssm?.ymd === ymd) return { record: ssm, source: 'ssm' };
    const local = readLocal(ymd);
    if (local?.ymd === ymd) return { record: local, source: 'local' };
    return { record: null, source: null };
  }

  function getAdminReportSentToday(ymdEt = etDateParts().ymd) {
    const ssm = ssmGet();
    if (isActiveClaim(ssm, ymdEt, now())) {
      return { alreadySent: true, record: ssm, source: 'ssm' };
    }
    const local = readLocal(ymdEt);
    if (isActiveClaim(local, ymdEt, now())) {
      return { alreadySent: true, record: local, source: 'local' };
    }
    return { alreadySent: false, record: null, source: null };
  }

  /**
   * Release a claiming slot that failed before SES accept (allows authorized retry).
   * Does not clear status=sent / messageId markers.
   */
  function releaseAdminReportClaim(info = {}) {
    const ymd = info.ymd || etDateParts().ymd;
    const claimId = info.claimId || null;
    const { record: cur } = readShared(ymd);
    if (!cur) return { ok: true, released: false, reason: 'none' };
    if (cur.messageId || cur.status === 'sent') {
      return { ok: false, released: false, reason: 'already_sent' };
    }
    if (cur.status !== 'claiming') return { ok: true, released: false, reason: 'not_claiming' };
    if (claimId && cur.claimId && cur.claimId !== claimId) {
      return { ok: false, released: false, reason: 'not_owner' };
    }
    const released = {
      ymd,
      status: 'released',
      releasedAt: new Date(now()).toISOString(),
      source: info.source || cur.source || 'release',
      priorClaimId: cur.claimId
    };
    writeLocal(ymd, released);
    const ssmOk = putWithRetries(released);
    return { ok: true, released: true, ssmOk };
  }

  function tryClaimAdminReportSlot(info = {}) {
    const ymd = info.ymd || etDateParts().ymd;
    if (info.force === true) {
      return { ok: true, forced: true, ymd };
    }

    const shared = readShared(ymd);
    const cur = shared.record;

    // Resume: parent job claimed, child compose-and-send continues with same claimId.
    if (info.resumeClaimId && cur?.ymd === ymd && cur.status === 'claiming' && cur.claimId === info.resumeClaimId) {
      if (cur.messageId) {
        return { ok: false, alreadySent: true, record: cur, source: shared.source };
      }
      return { ok: true, resumed: true, claim: cur };
    }

    if (isActiveClaim(cur, ymd, now())) {
      return { ok: false, alreadySent: true, record: cur, source: shared.source };
    }

    const claimedAt = new Date(now()).toISOString();
    const claimId = info.claimId || `claim-${claimedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const claim = {
      ymd,
      status: 'claiming',
      claimId,
      source: info.source || 'claim',
      claimedAt,
      diagnostic: info.diagnostic === true ? true : undefined
    };
    writeLocal(ymd, claim);
    const ssmOk = putWithRetries(claim);

    // Settle + re-read so a concurrent last-write cannot leave two winners.
    if (ssmOk && claimSettleMs > 0) sleep(claimSettleMs);
    const after = ssmGet();
    if (after?.ymd === ymd && (after.messageId || after.status === 'sent')) {
      writeLocal(ymd, after);
      return { ok: false, alreadySent: true, record: after, source: 'ssm' };
    }
    if (
      after?.ymd === ymd &&
      after.status === 'claiming' &&
      after.claimId &&
      after.claimId !== claimId &&
      isActiveClaim(after, ymd, now())
    ) {
      writeLocal(ymd, after);
      return { ok: false, alreadySent: true, record: after, source: 'ssm' };
    }
    // If SSM put failed, local claiming still blocks same-host retries; cross-host relies on later mark.
    return { ok: true, claim: { ...claim, ssmOk } };
  }

  /**
   * Persist sent marker after SES acceptance. Local write is mandatory;
   * SSM is retried. If SSM still fails, write claiming+messageId hybrid so
   * other hosts will not send a duplicate.
   */
  function markAdminReportSentToday(info = {}) {
    const ymd = info.ymd || etDateParts().ymd;
    const messageId = info.messageId || null;
    const payload = {
      ymd,
      status: 'sent',
      messageId,
      messageIds: info.messageIds || (messageId ? [messageId] : []),
      subject: info.subject || null,
      source: info.source || 'unknown',
      sentAt: new Date(now()).toISOString(),
      claimId: info.claimId || undefined,
      diagnostic: info.diagnostic === true ? true : undefined
    };
    writeLocal(ymd, payload);
    let ssmOk = putWithRetries(payload);
    if (!ssmOk && messageId) {
      const hybrid = {
        ymd,
        status: 'claiming',
        messageId,
        messageIds: payload.messageIds,
        claimId: info.claimId,
        claimedAt: new Date(now()).toISOString(),
        source: payload.source,
        sesAcceptedMarkerPending: true
      };
      ssmOk = putWithRetries(hybrid, 2);
      return { ...payload, ssmOk, localOk: true, hybridWritten: ssmOk };
    }
    return { ...payload, ssmOk, localOk: true };
  }

  return {
    getAdminReportSentToday,
    tryClaimAdminReportSlot,
    markAdminReportSentToday,
    releaseAdminReportClaim,
    isActiveClaim: (record, ymd) => isActiveClaim(record, ymd, now())
  };
}

const defaultDedupe = createAdminReportDedupe();

export const getAdminReportSentToday = (...args) => defaultDedupe.getAdminReportSentToday(...args);
export const tryClaimAdminReportSlot = (...args) => defaultDedupe.tryClaimAdminReportSlot(...args);
export const markAdminReportSentToday = (...args) => defaultDedupe.markAdminReportSentToday(...args);
export const releaseAdminReportClaim = (...args) => defaultDedupe.releaseAdminReportClaim(...args);
