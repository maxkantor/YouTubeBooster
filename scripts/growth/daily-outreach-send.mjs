#!/usr/bin/env node
/**
 * Daily cooking-creator outreach (SES via API).
 * Skips unsubscribed addresses. Rotates so the same person is not emailed twice the same day.
 *
 *   node scripts/growth/daily-outreach-send.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const ROSTER = path.join(__dirname, 'config/cooking-outreach-roster.json');
const API = process.env.YOUTUBEBOOSTER_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const REGION = process.env.AWS_REGION || 'us-east-1';

function ssmGet(name, withDecryption = false) {
  const args = ['ssm', 'get-parameter', '--name', name, '--region', REGION, '--query', 'Parameter.Value', '--output', 'text'];
  if (withDecryption) args.splice(4, 0, '--with-decryption');
  const r = spawnSync('aws', args, { encoding: 'utf8' });
  if (r.status !== 0) return '';
  const v = (r.stdout || '').trim();
  return !v || v === 'None' ? '' : v;
}

function ssmPutSecure(name, value) {
  const r = spawnSync(
    'aws',
    [
      'ssm',
      'put-parameter',
      '--name',
      name,
      '--type',
      'SecureString',
      '--value',
      value,
      '--overwrite',
      '--region',
      REGION
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    throw new Error(`Failed to write ${name}: ${(r.stderr || r.stdout || '').slice(0, 300)}`);
  }
}

function ensureSecret(name) {
  let v = ssmGet(name, true);
  if (!v) {
    v = randomBytes(32).toString('hex');
    ssmPutSecure(name, v);
  }
  return v;
}

const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
const cronKey = ensureSecret('/youtubebooster/outreach/cron-key');
ensureSecret('/youtubebooster/outreach/unsubscribe-hmac');

const contacts = (roster.contacts || []).map((c) => ({
  email: c.email,
  name: c.name,
  prospectId: c.id,
  channelUrl: c.channelUrl,
  handle: c.handle,
  subject: c.subject,
  body: c.body
}));

const res = await fetch(`${API}/api/public/outreach/daily-send`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Outreach-Cron-Key': cronKey
  },
  body: JSON.stringify({ count: roster.dailyCount || 2, contacts })
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}
if (!res.ok) {
  console.error(JSON.stringify({ ok: false, status: res.status, data }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, ...data }, null, 2));
