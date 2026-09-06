#!/usr/bin/env node
/** Enable COOK-001 sending: Lambda env + Dynamo campaign flags. Does not print secrets. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REGION = process.env.AWS_REGION || 'us-east-1';
const FN = 'youtubebooster-ai-api';
const TABLE = 'ybai-support';

function awsJson(args) {
  const r = spawnSync('aws', [...args, '--region', REGION, '--output', 'json'], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'aws failed').slice(0, 400));
  }
  return JSON.parse(r.stdout || '{}');
}

const cfg = awsJson(['lambda', 'get-function-configuration', '--function-name', FN]);
const vars = { ...(cfg.Environment?.Variables || {}) };
vars.CreatorAcquisition__MarketingSendingEnabled = 'true';
vars.CreatorAcquisition__ConfigSet = 'yb-creator-acquisition';
vars.YTB_OUTREACH_DAILY_LIMIT = vars.YTB_OUTREACH_DAILY_LIMIT || '10';
vars.YTB_OUTREACH_MAX_LIMIT = '30';
vars.YTB_OUTREACH_RAMP_ENABLED = 'true';
vars.YTB_OUTREACH_COOLDOWN_DAYS = '14';
vars.YTB_OUTREACH_ALLOW_WEEKENDS = 'true';
const payloadPath = path.join(os.tmpdir(), 'yb-lambda-acq-env.json');
fs.writeFileSync(
  payloadPath,
  JSON.stringify({ FunctionName: FN, Environment: { Variables: vars } })
);
const updated = spawnSync('aws', ['lambda', 'update-function-configuration', '--cli-input-json', `file://${payloadPath}`, '--region', REGION, '--output', 'json'], {
  encoding: 'utf8'
});
fs.unlinkSync(payloadPath);
if (updated.status !== 0) {
  console.log(JSON.stringify({ ok: false, step: 'lambda_env', error: (updated.stderr || updated.stdout || '').slice(0, 400) }));
  process.exit(1);
}

const existing = spawnSync(
  'aws',
  [
    'dynamodb',
    'get-item',
    '--table-name',
    TABLE,
    '--key',
    '{"pk":{"S":"ACQFLAGS#COOK-001"},"sk":{"S":"META"}}',
    '--region',
    REGION,
    '--output',
    'json'
  ],
  { encoding: 'utf8' }
);
let pause = 'false';
try {
  const item = JSON.parse(existing.stdout || '{}').Item;
  if (item?.pause?.S === 'true') pause = 'true';
} catch {
  /* ignore */
}

const put = spawnSync(
  'aws',
  [
    'dynamodb',
    'put-item',
    '--table-name',
    TABLE,
    '--item',
    JSON.stringify({
      pk: { S: 'ACQFLAGS#COOK-001' },
      sk: { S: 'META' },
      sending: { S: 'true' },
      pause: { S: pause }
    }),
    '--region',
    REGION
  ],
  { encoding: 'utf8' }
);
if (put.status !== 0) {
  console.log(JSON.stringify({ ok: false, step: 'dynamo_flags', error: (put.stderr || put.stdout || '').slice(0, 400) }));
  process.exit(1);
}

spawnSync(
  'aws',
  [
    'ssm',
    'put-parameter',
    '--name',
    '/youtubebooster/outreach/cooldown-days',
    '--value',
    '14',
    '--type',
    'String',
    '--overwrite',
    '--region',
    REGION
  ],
  { encoding: 'utf8' }
);

spawnSync(
  'aws',
  [
    'ssm',
    'put-parameter',
    '--name',
    '/youtubebooster/outreach/allow-weekends',
    '--value',
    'true',
    '--type',
    'String',
    '--overwrite',
    '--region',
    REGION
  ],
  { encoding: 'utf8' }
);

const ssm = spawnSync(
  'aws',
  ['ssm', 'get-parameter', '--name', '/youtubebooster/outreach/marketing-sending-enabled', '--region', REGION, '--query', 'Parameter.Value', '--output', 'text'],
  { encoding: 'utf8' }
);

let configSet = { created: false };
const describe = spawnSync(
  'aws',
  ['ses', 'describe-configuration-set', '--configuration-set-name', 'yb-creator-acquisition', '--region', REGION],
  { encoding: 'utf8' }
);
if (describe.status !== 0) {
  const create = spawnSync(
    'aws',
    ['ses', 'create-configuration-set', '--configuration-set', 'Name=yb-creator-acquisition', '--region', REGION],
    { encoding: 'utf8' }
  );
  configSet = { created: create.status === 0, error: create.status === 0 ? null : (create.stderr || '').slice(0, 200) };
}

console.log(
  JSON.stringify(
    {
      ok: true,
      lambdaEnvSet: true,
      dynamoCook001Sending: true,
      complaintPausePreserved: pause === 'true',
      ssmMarketingSendingEnabled: (ssm.stdout || '').trim(),
      sesConfigSet: configSet
    },
    null,
    2
  )
);
