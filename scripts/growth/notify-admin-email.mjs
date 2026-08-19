#!/usr/bin/env node
/**
 * Email the Admin inbox a growth-run summary via AWS SES.
 * Uses SSM: /youtubebooster/admin/email, /youtubebooster/ses/from-email
 *
 * Usage:
 *   node scripts/growth/notify-admin-email.mjs --subject "..." --body-file path.txt
 *   node scripts/growth/notify-admin-email.mjs --subject "..." --body "plain text"
 *   echo "body" | node scripts/growth/notify-admin-email.mjs --subject "..."
 *
 * Optional: pass htmlBody for multipart HTML+text (Outlook-friendly).
 * Never prints secret values. Exits non-zero if send fails.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const REGION = process.env.AWS_REGION || 'us-east-1';

function getSsm(name, withDecryption = false) {
  const args = [
    'ssm',
    'get-parameter',
    '--name',
    name,
    '--region',
    REGION,
    '--query',
    'Parameter.Value',
    '--output',
    'text'
  ];
  if (withDecryption) args.splice(4, 0, '--with-decryption');
  const r = spawnSync('aws', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`SSM get failed for ${name}`);
  }
  const value = (r.stdout || '').trim();
  if (!value || value === 'None') throw new Error(`SSM empty for ${name}`);
  return value;
}

function parseArgs(argv) {
  const out = { subject: null, body: null, bodyFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--subject') out.subject = argv[++i];
    else if (a === '--body') out.body = argv[++i];
    else if (a === '--body-file') out.bodyFile = argv[++i];
  }
  return out;
}

export function jsonForAwsCli(obj) {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${hex}`;
  });
}

export function sendAdminGrowthEmail({ subject, body, htmlBody }) {
  if (!subject?.trim()) throw new Error('subject required');
  if (!body?.trim()) throw new Error('body required');

  // Cursor Cloud secrets can supply addresses without SSM (still need AWS keys for ses:SendEmail).
  const from =
    (process.env.SES_FROM_EMAIL || '').trim() || getSsm('/youtubebooster/ses/from-email', true);
  const to =
    (process.env.ADMIN_EMAIL || process.env.SES_ADMIN_EMAIL || '').trim() ||
    getSsm('/youtubebooster/admin/email', false);
  const fromSource = `YouTubeBoosterAI Growth <${from}>`;

  const bodyPayload = {
    Text: { Data: body, Charset: 'UTF-8' }
  };
  if (htmlBody?.trim()) {
    bodyPayload.Html = { Data: htmlBody, Charset: 'UTF-8' };
  }

  // Write temp files for AWS CLI (avoids shell escaping issues)
  const tmpDir = fs.mkdtempSync(path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'yb-growth-mail-'));
  const destPath = path.join(tmpDir, 'dest.json');
  const msgPath = path.join(tmpDir, 'msg.json');
  try {
    fs.writeFileSync(destPath, jsonForAwsCli({ ToAddresses: [to] }), 'utf8');
    fs.writeFileSync(
      msgPath,
      jsonForAwsCli({
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: bodyPayload
      }),
      'utf8'
    );

    const r = spawnSync(
      'aws',
      [
        'ses',
        'send-email',
        '--region',
        REGION,
        '--from',
        fromSource,
        '--destination',
        `file://${destPath.replace(/\\/g, '/')}`,
        '--message',
        `file://${msgPath.replace(/\\/g, '/')}`
      ],
      { encoding: 'utf8' }
    );

    if (r.status !== 0) {
      const err = (r.stderr || r.stdout || '').slice(0, 400);
      throw new Error(`SES send failed: ${err}`);
    }

    let messageId = null;
    try {
      messageId = JSON.parse(r.stdout || '{}').MessageId ?? null;
    } catch {
      /* ignore */
    }
    return { ok: true, to, messageId, subjectSent: subject };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

const invokedAsCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  const args = parseArgs(process.argv.slice(2));
  let body = args.body;
  if (args.bodyFile) {
    body = fs.readFileSync(args.bodyFile, 'utf8');
  } else if (!body && !process.stdin.isTTY) {
    body = fs.readFileSync(0, 'utf8');
  }
  try {
    const result = sendAdminGrowthEmail({ subject: args.subject, body });
    console.log(JSON.stringify({ ok: true, messageId: result.messageId }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
}
