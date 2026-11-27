/**
 * Resolve AWS CLI on Cloud Agent pods where `aws` may live under ~/.local/bin.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCAL_AWS = path.join(os.homedir(), '.local/bin/aws');

export function resolveAwsCommand() {
  const fromEnv = process.env.AWS_CLI_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  if (fs.existsSync(LOCAL_AWS)) return LOCAL_AWS;
  return 'aws';
}

/** @param {string[]} args @param {import('node:child_process').SpawnSyncOptions} [opts] */
export function spawnAws(args, opts = {}) {
  const cmd = resolveAwsCommand();
  const env = {
    ...process.env,
    PATH: envPathWithLocalBin(process.env.PATH || '')
  };
  return spawnSync(cmd, args, { encoding: 'utf8', ...opts, env });
}

function envPathWithLocalBin(pathVar) {
  const localBin = path.join(os.homedir(), '.local/bin');
  if (pathVar.split(path.delimiter).includes(localBin)) return pathVar;
  return `${localBin}${path.delimiter}${pathVar}`;
}