#!/usr/bin/env node
/**
 * Verify growth SSM parameters exist. Never prints values.
 */
import { spawnSync } from 'node:child_process';

const REGION = process.env.AWS_REGION || 'us-east-1';
const PARAMS = [
  { env: 'GA4_PROPERTY_ID', name: '/youtubebooster/growth/ga4-property-id', expect: 'String' },
  {
    env: 'GOOGLE_ANALYTICS_CREDENTIALS_JSON',
    name: '/youtubebooster/growth/google-analytics-credentials-json',
    expect: 'SecureString'
  },
  {
    env: 'STRIPE_RESTRICTED_READ_KEY',
    name: '/youtubebooster/growth/stripe-restricted-read-key',
    expect: 'SecureString'
  }
];

function describe(name) {
  const r = spawnSync(
    'aws',
    [
      'ssm',
      'get-parameter',
      '--name',
      name,
      '--region',
      REGION,
      '--output',
      'json'
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    return { present: false, error: (r.stderr || r.stdout || 'missing').trim().slice(0, 120) };
  }
  try {
    const parsed = JSON.parse(r.stdout);
    const p = parsed.Parameter || parsed;
    return {
      present: true,
      type: p.Type ?? null,
      lastModified: p.LastModifiedDate ?? null
    };
  } catch {
    return { present: false, error: 'parse_error' };
  }
}

const rows = PARAMS.map((p) => {
  const d = describe(p.name);
  return {
    env: p.env,
    ssm: p.name,
    expectType: p.expect,
    present: d.present,
    type: d.type ?? null,
    typeOk: d.present ? d.type === p.expect : false,
    lastModified: d.lastModified ?? null,
    error: d.error ?? null
  };
});

const ok = rows.every((r) => r.present && r.typeOk);
console.log(JSON.stringify({ ok, region: REGION, parameters: rows }, null, 2));
process.exit(ok ? 0 : 1);
