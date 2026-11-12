import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('daily runner fails when the report cannot be sent and releases the lock', () => {
  const growthDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-runner-test-'));
  try {
    const target = path.join(temp, 'scripts', 'growth');
    fs.mkdirSync(target, { recursive: true });
    for (const file of ['run-daily-growth-job.mjs', 'load-ssm-secrets-into-env.mjs', 'lib']) {
      fs.cpSync(path.join(growthDir, file), path.join(target, file), { recursive: true });
    }
    const mock = path.join(temp, 'mock.mjs');
    fs.writeFileSync(mock, `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
childProcess.spawnSync = (command, args) => {
  if (command === 'aws') return { status: 1, stdout: '', stderr: 'no AWS' };
  const script = args[0];
  if (script.endsWith('growth-run-lock.mjs')) {
    return { status: 0, stdout: '{"ok":true}', stderr: '' };
  }
  if (script.endsWith('compose-and-send-growth-email.mjs')) {
    return { status: 1, stdout: '{"ok":false}', stderr: '' };
  }
  return { status: 0, stdout: '{}', stderr: '' };
};
syncBuiltinESMExports();
`);
    const result = spawnSync(process.execPath, [
      '--import', mock, path.join(target, 'run-daily-growth-job.mjs'), '--force'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /Email delivery status: FAILED/);
    assert.match(result.stdout, /Lock released/);
    assert.doesNotMatch(result.stdout, /Daily growth job completed successfully/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
