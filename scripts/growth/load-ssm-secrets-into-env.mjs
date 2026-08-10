#!/usr/bin/env node
/**
 * Load /youtubebooster/growth/* from SSM into process.env (for collectors).
 * Does not print values. No-op if AWS CLI / params unavailable.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REGION = process.env.AWS_REGION || 'us-east-1';
const MAP = [
  ['GA4_PROPERTY_ID', '/youtubebooster/growth/ga4-property-id', false],
  ['GOOGLE_ANALYTICS_CREDENTIALS_JSON', '/youtubebooster/growth/google-analytics-credentials-json', true],
  ['STRIPE_RESTRICTED_READ_KEY', '/youtubebooster/growth/stripe-restricted-read-key', true]
];

export function loadSsmSecretsIntoEnv() {
  const loaded = [];
  const missing = [];

  for (const [envName, ssmName, secure] of MAP) {
    if (process.env[envName]) {
      loaded.push({ env: envName, source: 'env' });
      continue;
    }
    const args = [
      'ssm',
      'get-parameter',
      '--name',
      ssmName,
      '--region',
      REGION,
      '--query',
      'Parameter.Value',
      '--output',
      'text'
    ];
    if (secure) args.splice(4, 0, '--with-decryption');
    const r = spawnSync('aws', args, { encoding: 'utf8' });
    if (r.status !== 0) {
      missing.push(envName);
      continue;
    }
    const value = (r.stdout || '').trim();
    if (!value || value === 'None') {
      missing.push(envName);
      continue;
    }
    process.env[envName] = value;
    loaded.push({ env: envName, source: 'ssm' });
  }

  return { loaded: loaded.map((x) => x.env), missing, region: REGION };
}

const invokedAsCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  console.log(JSON.stringify(loadSsmSecretsIntoEnv(), null, 2));
}
