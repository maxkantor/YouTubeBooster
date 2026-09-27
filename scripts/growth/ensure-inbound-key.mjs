/**
 * Ensure outreach inbound SSM key exists (does not print secret).
 * Full SES receipt → Inbox still requires MX/receipt-rule owner setup for the reply domain.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const SSM_KEY = '/youtubebooster/outreach/inbound-key';

function aws(args) {
  const r = spawnSync('aws', [...args, '--region', REGION], { encoding: 'utf8' });
  return {
    ok: r.status === 0,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim()
  };
}

const get = aws([
  'ssm',
  'get-parameter',
  '--name',
  SSM_KEY,
  '--with-decryption',
  '--query',
  'Parameter.Value',
  '--output',
  'text'
]);
if (get.ok && get.out && get.out !== 'None' && get.out.length >= 24) {
  console.log(JSON.stringify({ ok: true, created: false, keyLength: get.out.length }));
  process.exit(0);
}

const value = randomBytes(32).toString('hex');
const put = aws([
  'ssm',
  'put-parameter',
  '--name',
  SSM_KEY,
  '--type',
  'SecureString',
  '--value',
  value,
  '--overwrite'
]);
console.log(
  JSON.stringify({
    ok: put.ok,
    created: put.ok,
    keyLength: value.length,
    error: put.ok ? null : put.err,
    note: 'Inbound API key ready. Wire SES receipt/WorkMail for hello@ to POST /api/public/acq/inbound with X-Outreach-Inbound-Key.'
  })
);
process.exit(put.ok ? 0 : 1);
