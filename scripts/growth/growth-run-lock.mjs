#!/usr/bin/env node
/**
 * Growth-run lock — prevent overlapping daily growth agents from shipping twice.
 *
 * Usage:
 *   node scripts/growth/growth-run-lock.mjs acquire
 *   node scripts/growth/growth-run-lock.mjs release
 *   node scripts/growth/growth-run-lock.mjs status
 *
 * Stale lock: older than STALE_MS (default 120 minutes).
 * Never delete/bypass an active (non-stale) lock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOCK_PATH = path.join(ROOT, 'docs/growth/.growth-run.lock');
const STALE_MS = Number(process.env.GROWTH_LOCK_STALE_MS || 120 * 60 * 1000);

function readLock() {
  if (!fs.existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return { pid: null, startedAt: null, host: null, corrupt: true };
  }
}

function ageMs(lock) {
  const started = Date.parse(lock?.startedAt ?? '');
  if (!Number.isFinite(started)) return Number.POSITIVE_INFINITY;
  return Date.now() - started;
}

function isStale(lock) {
  return ageMs(lock) > STALE_MS;
}

function status() {
  const lock = readLock();
  if (!lock) {
    console.log(JSON.stringify({ locked: false, path: LOCK_PATH, staleMs: STALE_MS }));
    return 0;
  }
  const stale = isStale(lock);
  console.log(
    JSON.stringify({
      locked: true,
      stale,
      ageMinutes: Math.round(ageMs(lock) / 60000),
      staleMinutes: Math.round(STALE_MS / 60000),
      lock,
      path: LOCK_PATH
    })
  );
  return stale ? 0 : 1;
}

function acquire() {
  const existing = readLock();
  if (existing && !isStale(existing)) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'active_lock',
        message: 'Non-stale growth-run lock exists. Stop without a second report. Do not bypass or delete.',
        ageMinutes: Math.round(ageMs(existing) / 60000),
        staleMinutes: Math.round(STALE_MS / 60000),
        lock: existing,
        path: LOCK_PATH
      })
    );
    process.exit(2);
  }
  if (existing && isStale(existing)) {
    console.warn(
      JSON.stringify({
        ok: true,
        note: 'replacing_stale_lock',
        ageMinutes: Math.round(ageMs(existing) / 60000),
        previous: existing
      })
    );
  }
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    host: process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown',
    agent: process.env.CURSOR_AGENT || process.env.USER || 'growth-agent'
  };
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, acquired: true, lock: payload, path: LOCK_PATH }));
  return 0;
}

function release() {
  const existing = readLock();
  if (!existing) {
    console.log(JSON.stringify({ ok: true, released: false, note: 'no_lock' }));
    return 0;
  }
  fs.unlinkSync(LOCK_PATH);
  console.log(JSON.stringify({ ok: true, released: true, previous: existing }));
  return 0;
}

const cmd = process.argv[2] ?? 'status';
if (cmd === 'acquire') process.exit(acquire());
if (cmd === 'release') process.exit(release());
if (cmd === 'status') process.exit(status());
console.error(`Usage: growth-run-lock.mjs <acquire|release|status>`);
process.exit(1);
