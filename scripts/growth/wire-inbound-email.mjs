#!/usr/bin/env node
/**
 * CASE C inbound wiring for youtubeboosterai.com
 *
 * Verified baseline (live DNS):
 *   - Route53 zone owns youtubeboosterai.com
 *   - NO MX records (no WorkMail/Gmail/M365 mailbox for this domain)
 *   - SES domain verified for sending only
 *   - Existing /api/public/acq/inbound processor already in the API
 *
 * Architecture:
 *   Internet → MX (SES inbound) → receipt rule → S3
 *   → Lambda (youtubebooster-inbound-mail) → POST /api/public/acq/inbound
 *   → Acquisition Inbox + Contacts conversation
 *
 * MX CHANGE (net-new; does not replace an existing provider):
 *   BEFORE: (none)
 *   AFTER:  10 inbound-smtp.us-east-1.amazonaws.com.
 *
 * Flags:
 *   --dry-run   report planned changes only (default for MX report)
 *   --apply     create/update AWS resources including MX
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const REGION = process.env.AWS_REGION || 'us-east-1';
const ACCOUNT = process.env.AWS_ACCOUNT_ID || '718522948657';
const ZONE_ID = process.env.YB_HOSTED_ZONE_ID || 'Z014959831X1D2E7R4FQ';
const DOMAIN = 'youtubeboosterai.com';
const RECIPIENT = process.env.YB_INBOUND_RECIPIENT || `hello@${DOMAIN}`;
const BUCKET = process.env.YB_INBOUND_BUCKET || `youtubebooster-inbound-mail-${ACCOUNT}`;
const PREFIX = 'hello/';
const RULE_SET = process.env.YB_SES_RECEIPT_RULE_SET || 'INBOUND_MAIL';
const RULE_NAME = process.env.YB_SES_RECEIPT_RULE || 'youtubebooster-hello-inbound';
const LAMBDA_NAME = process.env.YB_INBOUND_LAMBDA || 'youtubebooster-inbound-mail';
const ROLE_NAME = process.env.YB_INBOUND_ROLE || 'youtubebooster-inbound-mail-role';
const API_BASE =
  process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const SSM_KEY = '/youtubebooster/outreach/inbound-key';
const MX_VALUE = '10 inbound-smtp.us-east-1.amazonaws.com.';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

function aws(args, { json = false } = {}) {
  const r = spawnSync('aws', [...args, '--region', REGION], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status !== 0) {
    return { ok: false, status: r.status, out, err };
  }
  if (json && out) {
    try {
      return { ok: true, data: JSON.parse(out), out };
    } catch {
      return { ok: true, out };
    }
  }
  return { ok: true, out };
}

function ensureInboundKey() {
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
  const existing = (get.out || '').trim();
  if (get.ok && existing && existing !== 'None' && existing.length >= 24) {
    return { ok: true, created: false, length: existing.length };
  }
  if (DRY) return { ok: true, created: false, dryRun: true, length: 0 };
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
  return { ok: put.ok, created: put.ok, length: value.length, error: put.ok ? null : put.err };
}

function listMx() {
  const res = aws(
    [
      'route53',
      'list-resource-record-sets',
      '--hosted-zone-id',
      ZONE_ID,
      '--query',
      `ResourceRecordSets[?Type=='MX' && Name=='${DOMAIN}.']`,
      '--output',
      'json'
    ],
    { json: true }
  );
  if (!res.ok) return { ok: false, error: res.err, records: [] };
  return { ok: true, records: res.data || [] };
}

function classifyCase(mxRecords) {
  const values = [];
  for (const rr of mxRecords) {
    for (const v of rr.ResourceRecords || []) values.push(String(v.Value || ''));
  }
  const joined = values.join(' ').toLowerCase();
  if (!values.length) return { case: 'C', label: 'NO_FUNCTIONING_INBOUND_PROVIDER', mx: [] };
  if (joined.includes('inbound-smtp') && joined.includes('amazonaws')) {
    return { case: 'B', label: 'SES_EMAIL_RECEIVING', mx: values };
  }
  if (joined.includes('awsapps.com') || joined.includes('workmail')) {
    return { case: 'A', label: 'WORKMAIL', mx: values };
  }
  if (joined.includes('google') || joined.includes('aspmx') || joined.includes('outlook') || joined.includes('protection.outlook')) {
    return { case: 'A', label: 'EXISTING_MAILBOX_PROVIDER', mx: values };
  }
  return { case: 'A', label: 'EXISTING_MX_UNKNOWN_PROVIDER', mx: values };
}

function ensureBucket() {
  const head = aws(['s3api', 'head-bucket', '--bucket', BUCKET]);
  if (head.ok) return { ok: true, created: false, bucket: BUCKET };
  if (DRY) return { ok: true, created: false, dryRun: true, bucket: BUCKET };
  const create = aws(['s3api', 'create-bucket', '--bucket', BUCKET]);
  if (!create.ok) return { ok: false, error: create.err, bucket: BUCKET };
  aws([
    's3api',
    'put-public-access-block',
    '--bucket',
    BUCKET,
    '--public-access-block-configuration',
    'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
  ]);
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowSESPuts',
        Effect: 'Allow',
        Principal: { Service: 'ses.amazonaws.com' },
        Action: 's3:PutObject',
        Resource: `arn:aws:s3:::${BUCKET}/${PREFIX}*`,
        Condition: { StringEquals: { 'aws:Referer': ACCOUNT } }
      }
    ]
  };
  const putPolicy = aws([
    's3api',
    'put-bucket-policy',
    '--bucket',
    BUCKET,
    '--policy',
    JSON.stringify(policy)
  ]);
  return { ok: putPolicy.ok, created: true, bucket: BUCKET, error: putPolicy.ok ? null : putPolicy.err };
}

function ensureRole() {
  const get = aws(['iam', 'get-role', '--role-name', ROLE_NAME], { json: true });
  if (get.ok && get.data?.Role?.Arn) {
    return { ok: true, created: false, arn: get.data.Role.Arn };
  }
  if (DRY) {
    return {
      ok: true,
      created: false,
      dryRun: true,
      arn: `arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}`
    };
  }
  const trust = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole'
      }
    ]
  };
  const create = aws([
    'iam',
    'create-role',
    '--role-name',
    ROLE_NAME,
    '--assume-role-policy-document',
    JSON.stringify(trust)
  ], { json: true });
  if (!create.ok) return { ok: false, error: create.err };
  aws([
    'iam',
    'attach-role-policy',
    '--role-name',
    ROLE_NAME,
    '--policy-arn',
    'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
  ]);
  const inline = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject'],
        Resource: `arn:aws:s3:::${BUCKET}/${PREFIX}*`
      },
      {
        Effect: 'Allow',
        Action: ['ssm:GetParameter'],
        Resource: `arn:aws:ssm:${REGION}:${ACCOUNT}:parameter${SSM_KEY}`
      }
    ]
  };
  aws([
    'iam',
    'put-role-policy',
    '--role-name',
    ROLE_NAME,
    '--policy-name',
    'youtubebooster-inbound-mail-access',
    '--policy-document',
    JSON.stringify(inline)
  ]);
  // IAM eventual consistency
  spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', process.platform === 'win32' ? ['/T', '8'] : ['8'], {
    shell: true
  });
  return { ok: true, created: true, arn: create.data?.Role?.Arn || `arn:aws:iam::${ACCOUNT}:role/${ROLE_NAME}` };
}

function zipLambda() {
  const srcDir = join(__dirname, 'inbound-lambda');
  const zipPath = join(__dirname, 'inbound-lambda.zip');
  if (existsSync(zipPath)) rmSync(zipPath);
  // Prefer Compress-Archive on Windows; zip CLI elsewhere.
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${join(srcDir, 'lambda_function.py')}' -DestinationPath '${zipPath}' -Force`
      ],
      { encoding: 'utf8' }
    );
    if (ps.status !== 0) throw new Error(ps.stderr || ps.stdout || 'zip_failed');
  } else {
    const z = spawnSync('zip', ['-j', zipPath, join(srcDir, 'lambda_function.py')], { encoding: 'utf8' });
    if (z.status !== 0) throw new Error(z.stderr || 'zip_failed');
  }
  return zipPath;
}

function ensureLambda(roleArn) {
  const get = aws(['lambda', 'get-function', '--function-name', LAMBDA_NAME], { json: true });
  if (DRY) {
    return {
      ok: true,
      created: false,
      dryRun: true,
      arn: `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${LAMBDA_NAME}`
    };
  }
  const zipPath = zipLambda();
  const env = {
    Variables: {
      YB_API_BASE: API_BASE,
      YB_INBOUND_KEY_SSM: SSM_KEY
    }
  };
  if (get.ok) {
    const updCode = aws([
      'lambda',
      'update-function-code',
      '--function-name',
      LAMBDA_NAME,
      '--zip-file',
      `fileb://${zipPath}`
    ]);
    aws([
      'lambda',
      'wait',
      'function-updated',
      '--function-name',
      LAMBDA_NAME
    ]);
    const updCfg = aws([
      'lambda',
      'update-function-configuration',
      '--function-name',
      LAMBDA_NAME,
      '--timeout',
      '30',
      '--memory-size',
      '256',
      '--environment',
      JSON.stringify(env)
    ]);
    const cfg = aws(['lambda', 'get-function', '--function-name', LAMBDA_NAME], { json: true });
    return {
      ok: updCode.ok && updCfg.ok,
      created: false,
      arn: cfg.data?.Configuration?.FunctionArn,
      error: updCode.ok ? (updCfg.ok ? null : updCfg.err) : updCode.err
    };
  }
  const create = aws(
    [
      'lambda',
      'create-function',
      '--function-name',
      LAMBDA_NAME,
      '--runtime',
      'python3.12',
      '--role',
      roleArn,
      '--handler',
      'lambda_function.lambda_handler',
      '--timeout',
      '30',
      '--memory-size',
      '256',
      '--zip-file',
      `fileb://${zipPath}`,
      '--environment',
      JSON.stringify(env)
    ],
    { json: true }
  );
  return {
    ok: create.ok,
    created: create.ok,
    arn: create.data?.FunctionArn,
    error: create.ok ? null : create.err
  };
}

function ensureS3Notify(lambdaArn) {
  if (DRY) return { ok: true, dryRun: true };
  const perm = aws([
    'lambda',
    'add-permission',
    '--function-name',
    LAMBDA_NAME,
    '--statement-id',
    'AllowS3InvokeInbound',
    '--action',
    'lambda:InvokeFunction',
    '--principal',
    's3.amazonaws.com',
    '--source-arn',
    `arn:aws:s3:::${BUCKET}`,
    '--source-account',
    ACCOUNT
  ]);
  // ignore if already exists
  const notify = {
    LambdaFunctionConfigurations: [
      {
        Id: 'youtubebooster-hello-inbound',
        LambdaFunctionArn: lambdaArn,
        Events: ['s3:ObjectCreated:*'],
        Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: PREFIX }] } }
      }
    ]
  };
  const put = aws([
    's3api',
    'put-bucket-notification-configuration',
    '--bucket',
    BUCKET,
    '--notification-configuration',
    JSON.stringify(notify)
  ]);
  return {
    ok: put.ok,
    permissionOk: perm.ok || /already exists|ResourceConflict/i.test(perm.err || ''),
    error: put.ok ? null : put.err
  };
}

function ensureReceiptRule() {
  const active = aws(['ses', 'describe-active-receipt-rule-set'], { json: true });
  if (!active.ok) return { ok: false, error: active.err };
  const name = active.data?.Metadata?.Name;
  if (name && name !== RULE_SET) {
    return { ok: false, error: `active_rule_set_is_${name}_expected_${RULE_SET}` };
  }
  const rules = active.data?.Rules || [];
  const existing = rules.find((r) => r.Name === RULE_NAME);
  const rule = {
    Name: RULE_NAME,
    Enabled: true,
    TlsPolicy: 'Require',
    Recipients: [RECIPIENT],
    Actions: [
      {
        S3Action: {
          BucketName: BUCKET,
          ObjectKeyPrefix: PREFIX
        }
      }
    ],
    ScanEnabled: true
  };
  if (DRY) return { ok: true, dryRun: true, exists: Boolean(existing), rule };
  if (existing) {
    const upd = aws([
      'ses',
      'update-receipt-rule',
      '--rule-set-name',
      RULE_SET,
      '--rule',
      JSON.stringify(rule)
    ]);
    return { ok: upd.ok, updated: true, error: upd.ok ? null : upd.err };
  }
  // Insert near the top so other domain rules still apply by recipient match.
  const create = aws([
    'ses',
    'create-receipt-rule',
    '--rule-set-name',
    RULE_SET,
    '--rule',
    JSON.stringify(rule)
  ]);
  return { ok: create.ok, created: create.ok, error: create.ok ? null : create.err };
}

function ensureMx(caseInfo) {
  if (caseInfo.case === 'A') {
    return {
      ok: false,
      skipped: true,
      reason: 'CASE_A_existing_provider_do_not_replace_mx',
      mx: caseInfo.mx
    };
  }
  if (caseInfo.case === 'B') {
    const hasInbound = caseInfo.mx.some((v) => /inbound-smtp\.us-east-1\.amazonaws\.com/i.test(v));
    if (hasInbound) return { ok: true, skipped: true, reason: 'mx_already_ses_inbound', mx: caseInfo.mx };
  }
  const change = {
    Comment: 'YouTubeBoosterAI SES Email Receiving MX (CASE C first-time inbound)',
    Changes: [
      {
        Action: 'UPSERT',
        ResourceRecordSet: {
          Name: `${DOMAIN}.`,
          Type: 'MX',
          TTL: 300,
          ResourceRecords: [{ Value: MX_VALUE.replace(/\.$/, '') }]
        }
      }
    ]
  };
  // Route53 MX values should not have trailing period in Value typically: "10 inbound-smtp.us-east-1.amazonaws.com"
  change.Changes[0].ResourceRecordSet.ResourceRecords[0].Value = '10 inbound-smtp.us-east-1.amazonaws.com';
  if (DRY) {
    return {
      ok: true,
      dryRun: true,
      plannedMx: change.Changes[0].ResourceRecordSet.ResourceRecords,
      before: caseInfo.mx
    };
  }
  const put = aws([
    'route53',
    'change-resource-record-sets',
    '--hosted-zone-id',
    ZONE_ID,
    '--change-batch',
    JSON.stringify(change)
  ], { json: true });
  return {
    ok: put.ok,
    changeId: put.data?.ChangeInfo?.Id || null,
    error: put.ok ? null : put.err,
    after: ['10 inbound-smtp.us-east-1.amazonaws.com']
  };
}

function main() {
  const mx = listMx();
  if (!mx.ok) {
    console.log(JSON.stringify({ ok: false, step: 'list_mx', error: mx.error }, null, 2));
    process.exit(1);
  }
  const caseInfo = classifyCase(mx.records);
  const report = {
    ok: true,
    mode: DRY ? 'dry-run' : 'apply',
    case: caseInfo.case,
    caseLabel: caseInfo.label,
    domain: DOMAIN,
    recipient: RECIPIENT,
    mxBefore: caseInfo.mx,
    mxChange: {
      before: caseInfo.mx.length ? caseInfo.mx : '(none — inbound mail currently undeliverable)',
      after:
        caseInfo.case === 'A'
          ? '(unchanged — existing provider preserved)'
          : '10 inbound-smtp.us-east-1.amazonaws.com',
      replacesExistingMailbox: false,
      note:
        caseInfo.case === 'C'
          ? 'Net-new MX. No WorkMail/Google/M365 mailbox exists for this domain today.'
          : caseInfo.case === 'B'
            ? 'SES receiving MX already present; repairing receipt path only.'
            : 'CASE A: will NOT modify MX.'
    }
  };

  if (caseInfo.case === 'A') {
    report.ok = false;
    report.error = 'CASE_A_requires_provider_forwarding_not_mx_replace';
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  if (DRY) {
    report.planned = {
      s3Bucket: BUCKET,
      prefix: PREFIX,
      receiptRuleSet: RULE_SET,
      receiptRule: RULE_NAME,
      lambda: LAMBDA_NAME,
      api: `${API_BASE}/api/public/acq/inbound`,
      mx: '10 inbound-smtp.us-east-1.amazonaws.com'
    };
    console.log(JSON.stringify(report, null, 2));
    console.error('\nRe-run with --apply to create resources and upsert MX.');
    process.exit(0);
  }

  const key = ensureInboundKey();
  const bucket = ensureBucket();
  const role = ensureRole();
  const lambda = ensureLambda(role.arn);
  const notify = ensureS3Notify(lambda.arn);
  const rule = ensureReceiptRule();
  const mxResult = ensureMx(caseInfo);

  report.steps = { key, bucket, role, lambda, notify, rule, mx: mxResult };
  report.ok = Boolean(
    key.ok && bucket.ok && role.ok && lambda.ok && notify.ok && rule.ok && mxResult.ok
  );
  report.mxAfter = mxResult.after || caseInfo.mx;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
