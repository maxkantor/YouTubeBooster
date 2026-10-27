/**
 * Cross-runner daily Admin report dedupe (Cursor Automation + Windows backup).
 * Uses SSM so cloud and local share one "already sent today (ET)" flag.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { etDateParts } from './time.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const REGION = process.env.AWS_REGION || 'us-east-1';
const SSM_NAME = '/youtubebooster/growth/last-admin-report';

function localMarkerPath(ymd) {
  return path.join(ROOT, 'docs/growth/logs', `admin-report-sent-${ymd}.json`);
}

function ssmGet() {
  const r = spawnSync(
    'aws',
    ['ssm', 'get-parameter', '--name', SSM_NAME, '--region', REGION, '--query', 'Parameter.Value', '--output', 'text'],
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

function ssmPut(payload) {
  const r = spawnSync(
    'aws',
    [
      'ssm',
      'put-parameter',
      '--name',
      SSM_NAME,
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

/**
 * @param {string} [ymdEt]
 * @returns {{ alreadySent: boolean, record: object|null, source: 'ssm'|'local'|null }}
 */
export function getAdminReportSentToday(ymdEt = etDateParts().ymd) {
  const ssm = ssmGet();
  if (ssm?.ymd === ymdEt) {
    return { alreadySent: true, record: ssm, source: 'ssm' };
  }
  const localPath = localMarkerPath(ymdEt);
  if (fs.existsSync(localPath)) {
    try {
      const record = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      return { alreadySent: true, record, source: 'local' };
    } catch {
      return { alreadySent: true, record: { ymd: ymdEt }, source: 'local' };
    }
  }
  return { alreadySent: false, record: null, source: null };
}

/**
 * @param {{ ymd?: string, messageId?: string|null, subject?: string|null, source?: string }} info
 */
export function markAdminReportSentToday(info = {}) {
  const ymd = info.ymd || etDateParts().ymd;
  const payload = {
    ymd,
    messageId: info.messageId || null,
    subject: info.subject || null,
    source: info.source || 'unknown',
    sentAt: new Date().toISOString()
  };
  const dir = path.dirname(localMarkerPath(ymd));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localMarkerPath(ymd), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const ssmOk = ssmPut(payload);
  return { ...payload, ssmOk };
}
