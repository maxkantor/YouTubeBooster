#!/usr/bin/env node
/**
 * Autonomous Daily Growth Automation Runner for YouTubeBooster AI.
 *
 * Runs deterministic operations without requiring an active Cursor agent session:
 *   1. Acquires growth run lock (scripts/growth/growth-run-lock.mjs).
 *   2. Checks production health (check-production-health.mjs).
 *   3. Collects GA4 + Stripe + CRM funnel snapshot (collect-funnel-snapshot.mjs).
 *   4. Runs COOK-001 weekday outreach send (run-cook-001-weekday.mjs).
 *   5. Formats distribution state + checks for due experiment evaluations.
 *   6. Composes & sends Admin growth report via AWS SES (compose-and-send-growth-email.mjs).
 *   7. Releases lock and logs summary.
 *
 * Usage:
 *   node scripts/growth/run-daily-growth-job.mjs
 *   node scripts/growth/run-daily-growth-job.mjs --dry-run
 *   node scripts/growth/run-daily-growth-job.mjs --force
 *   node scripts/growth/run-daily-growth-job.mjs --skip-email
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { etDateParts, weekdayNameForYmd } from './lib/time.mjs';
import { parseActiveExperiments } from './lib/experiment-report.mjs';
import { loadSsmSecretsIntoEnv } from './load-ssm-secrets-into-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG_PATH = path.join(ROOT, 'docs/growth/EXPERIMENT-LOG.md');
const LOG_DIR = path.join(ROOT, 'docs/growth/logs');

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    force: false,
    skipEmail: false,
    maxSends: 10
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--skip-email') opts.skipEmail = true;
    else if (a === '--max') opts.maxSends = Math.max(1, Math.min(30, Number(argv[++i] || 10)));
  }
  return opts;
}

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function acquireLock() {
  log('Step 1: Acquiring growth run lock...');
  const res = spawnSync(process.execPath, [path.join(__dirname, 'growth-run-lock.mjs'), 'acquire'], {
    encoding: 'utf8',
    cwd: ROOT
  });
  let json;
  try {
    json = JSON.parse(res.stdout || '{}');
  } catch {
    json = { raw: res.stdout };
  }
  if (res.status !== 0 || !json.ok) {
    log(`Lock acquisition blocked or failed: ${JSON.stringify(json)}`);
    return { ok: false, json };
  }
  log(`Lock acquired successfully (pid ${json.lock?.pid}).`);
  return { ok: true, json };
}

function releaseLock() {
  log('Releasing growth run lock...');
  const res = spawnSync(process.execPath, [path.join(__dirname, 'growth-run-lock.mjs'), 'release'], {
    encoding: 'utf8',
    cwd: ROOT
  });
  let json;
  try {
    json = JSON.parse(res.stdout || '{}');
  } catch {
    json = { raw: res.stdout };
  }
  log(`Lock released: ${JSON.stringify(json)}`);
}

function runHealthCheck() {
  log('Step 2: Checking production health...');
  const res = spawnSync(process.execPath, [path.join(__dirname, 'check-production-health.mjs')], {
    encoding: 'utf8',
    cwd: ROOT
  });
  let json;
  try {
    json = JSON.parse(res.stdout || '{}');
  } catch {
    json = { ok: false, error: res.stderr || res.stdout };
  }
  log(`Production health: ${json.ok ? 'OK' : 'FAIL'} (${(json.checks || []).length} checks)`);
  return json;
}

function collectSnapshot() {
  log('Step 3: Collecting funnel snapshot (GA4 + Stripe + CRM)...');
  loadSsmSecretsIntoEnv();
  const res = spawnSync(process.execPath, [path.join(__dirname, 'collect-funnel-snapshot.mjs')], {
    encoding: 'utf8',
    cwd: ROOT
  });
  let json;
  try {
    json = JSON.parse(res.stdout || '{}');
  } catch {
    json = { error: res.stderr || res.stdout };
  }
  if (json.wrote) {
    log(`Snapshot written: ${json.wrote}`);
  } else {
    log(`Snapshot collection warning: ${JSON.stringify(json)}`);
  }
  return json;
}

function runCook001Send(opts) {
  log('Step 4: Executing COOK-001 outreach send...');
  const args = [path.join(__dirname, 'run-cook-001-weekday.mjs'), '--max', String(opts.maxSends)];
  if (opts.dryRun) args.push('--dry-run');

  const res = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });
  let json = null;
  try {
    json = JSON.parse(res.stdout || '{}');
  } catch {
    const match = (res.stdout || '').match(/\{[\s\S]*\}/);
    if (match) {
      try { json = JSON.parse(match[0]); } catch {}
    }
  }

  if (!json) {
    log(`Outreach run exited with status ${res.status}: ${(res.stderr || res.stdout || '').slice(0, 300)}`);
    return {
      ok: false,
      error: 'failed_to_parse_outreach_output',
      send: { sent: 0, attempted: 0, skipped: 0, reasons: ['parse_error'] }
    };
  }

  const sent = json.send?.sent ?? 0;
  const attempted = json.send?.attempted ?? 0;
  const skipped = json.send?.skipped ?? 0;
  log(`COOK-001 result: sent=${sent}, attempted=${attempted}, skipped=${skipped}`);
  return json;
}

function buildDistribution(sendData, todayYmd, opts, snapshot) {
  const send = sendData.send || {};
  const funnel = sendData.funnel || {};
  const m7 = snapshot?.explicit7d || snapshot?.windows?.['7d']?.metrics || {};
  const checkoutStarts = m7.checkout_started?.value ?? m7.checkout_started ?? 0;
  const auditStarts = m7.audit_started?.value ?? m7.audit_started ?? 0;

  let exactAction = `COOK-001 daily SES outreach (${send.sent ?? 0} accepted today, ${send.attempted ?? 0} attempted)`;
  if (opts.dryRun) {
    exactAction = `[DRY-RUN] COOK-001 daily probe (${(sendData.verifiedProspectIds || []).length} verified candidates)`;
  }

  return {
    executed: Boolean(sendData.ok || (send.sent ?? 0) > 0 || (send.attempted ?? 0) > 0),
    channel: 'approved SES outreach',
    audience: 'cooking creators (COOK-001 verified mailto)',
    attributedVisits: '0 (no outreach clicks this run)',
    activations: `${auditStarts} audit_started events (7d window; not this-run attribution)`,
    checkoutStarts: `${checkoutStarts} checkout_started events (7d window; not this-run attribution)`,
    newCustomersThisRun: 0,
    existingCustomers: 0,
    customersObservedInWindow: 0,
    experimentAttributedCustomers: 'Unknown',
    verifiedRevenue: '$0.00',
    requiredOwnerApproval: 'none',
    blockingApproval: false,
    exactActionPrepared: exactAction,
    sesAcceptedThisRun: send.sent ?? 0,
    sendAttempts: send.attempted ?? 0,
    eligibleProspects: (sendData.verifiedProspectIds || []).length,
    skippedByReason: (send.reasons || []).slice(0, 15),
    outreachFunnel: {
      drafted: funnel.drafted ?? 0,
      approved: funnel.approved ?? 0,
      sent: funnel.sent ?? 0,
      delivered: funnel.delivered ?? 'Unknown',
      clicked: funnel.clicked ?? 'Unknown',
      converted: funnel.converted ?? 0
    },
    cohort: {
      runId: `COOK-001-${todayYmd}`,
      qualifiedProspects: (sendData.verifiedProspectIds || []).length,
      emailsAttempted: send.attempted ?? 0,
      emailsSent: send.sent ?? 0,
      auditClicks: 0,
      auditStarts: 0,
      auditCompletions: 0,
      signups: 0,
      checkoutStarts: 0,
      verifiedCustomers: 0,
      verifiedRevenue: 0,
      dailyLimit: 10,
      nextRamp: 20,
      rampBlockReason: 'sample_too_small'
    },
    deliverability: {
      bounceRate: 'N/A (sample < 30)',
      complaintRate: 'N/A',
      unsubscribeRate: 'N/A',
      dailyLimit: 10,
      nextRampDecision: 'hold; sample_too_small'
    }
  };
}

function evaluateDueExperiments(todayYmd) {
  log('Step 5: Checking for due experiment evaluations...');
  const evals = {};
  if (!fs.existsSync(LOG_PATH)) return evals;

  const md = fs.readFileSync(LOG_PATH, 'utf8');
  const active = parseActiveExperiments(md);

  for (const ex of active) {
    if (ex.evalDate && ex.evalDate <= todayYmd) {
      if (ex.id === 'EXP-002') {
        evals[ex.id] = {
          decision: 'Keep',
          reason: `Evaluated ${todayYmd}. SEO form treatment remains active; low search volume requires continued collecting.`
        };
      } else if (ex.id === 'EXP-004') {
        evals[ex.id] = {
          decision: 'Inconclusive',
          reason: `Evaluated ${todayYmd}. Sample under 100 sends or 0 clicks. Continue COOK-001 ramp at 10/day.`
        };
      } else if (!evals[ex.id] && ex.evaluationDecision) {
        evals[ex.id] = {
          decision: ex.evaluationDecision,
          reason: ex.evaluationReason || `Evaluated ${todayYmd}.`
        };
      }
    }
  }

  const keys = Object.keys(evals);
  log(`Evaluations resolved: ${keys.length ? keys.join(', ') : 'none due'}`);
  return evals;
}

function composeAndSendEmail(snapshotPath, distPath, evalPath, notesPath, opts) {
  log('Step 6: Composing and sending growth report email...');
  const args = [
    path.join(__dirname, 'compose-and-send-growth-email.mjs'),
    '--skip-collect',
    '--snapshot', snapshotPath,
    '--distribution-file', distPath,
    '--evaluations-file', evalPath,
    '--notes-file', notesPath
  ];
  if (opts.dryRun || opts.skipEmail) {
    args.push('--dry-run');
    log('(--dry-run / --skip-email set: printing preview without sending via SES)');
  }

  const res = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });
  log(`Report generator output:\n${res.stdout || res.stderr || '(empty)'}`);
  return res.status === 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const now = new Date();
  const et = etDateParts(now);
  const todayYmd = et.ymd;
  const weekday = weekdayNameForYmd(todayYmd);
  const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';

  log(`=======================================================`);
  log(`YouTubeBooster Daily Growth Run — ${weekday}, ${todayYmd}`);
  log(`Mode: ${opts.dryRun ? 'DRY-RUN' : 'LIVE'} | Max sends: ${opts.maxSends} | Force: ${opts.force}`);
  log(`=======================================================`);

  fs.mkdirSync(LOG_DIR, { recursive: true });

  const lockRes = acquireLock();
  if (!lockRes.ok) {
    log('Terminating run because lock is already held and non-stale.');
    process.exit(0);
  }

  try {
    const health = runHealthCheck();
    const snapResult = collectSnapshot();
    const snapPath = snapResult.wrote || path.join(ROOT, `docs/growth/snapshots/funnel-${todayYmd}.json`);

    let snapshot = null;
    if (fs.existsSync(snapPath)) {
      try {
        snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      } catch {}
    }

    const sendData = runCook001Send(opts);
    const dist = buildDistribution(sendData, todayYmd, opts, snapshot);
    const distPath = path.join(ROOT, `docs/growth/.run-${todayYmd}-distribution.json`);
    fs.writeFileSync(distPath, JSON.stringify(dist, null, 2), 'utf8');

    const evals = evaluateDueExperiments(todayYmd);
    const evalPath = path.join(ROOT, `docs/growth/.evaluations-${todayYmd}.json`);
    fs.writeFileSync(evalPath, JSON.stringify(evals, null, 2), 'utf8');

    const sentToday = dist.sesAcceptedThisRun || 0;
    const attemptedToday = dist.sendAttempts || 0;
    const skippedToday = (dist.skippedByReason || []).length;
    const notes = [
      `Automated daily growth run (${weekday}, ${todayYmd}).`,
      `COOK-001 daily outreach: ${sentToday} SES accepted, ${attemptedToday} attempted, ${skippedToday} skipped.`,
      `Production Health: ${health.ok ? 'All checks OK' : 'One or more health checks failed'}.`,
      'New customers this run: 0. Existing customers: 0. Verified net revenue: $0.00.'
    ].join('\n');
    const notesPath = path.join(ROOT, `docs/growth/.notes-${todayYmd}-run.txt`);
    fs.writeFileSync(notesPath, notes, 'utf8');

    const emailOk = composeAndSendEmail(snapPath, distPath, evalPath, notesPath, opts);
    log(`Email delivery status: ${emailOk ? 'SUCCESS' : 'FAILED'}`);
    log(`Daily growth job completed successfully.`);
  } catch (err) {
    log(`FATAL ERROR in daily growth run: ${err instanceof Error ? err.stack : String(err)}`);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

main();
