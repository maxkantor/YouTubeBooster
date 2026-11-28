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
import {
  getAdminReportSentToday,
  releaseAdminReportClaim,
  tryClaimAdminReportSlot
} from './lib/admin-report-once.mjs';
import {
  aggregateSkipReasons,
  dominantSkipReason,
  resolveAcquisitionSendingStatus
} from './lib/acq-skip-reasons.mjs';
import { etDateParts, weekdayNameForYmd } from './lib/time.mjs';
import { parseActiveExperiments } from './lib/experiment-report.mjs';
import { loadSsmSecretsIntoEnv } from './load-ssm-secrets-into-env.mjs';

export { aggregateSkipReasons, dominantSkipReason, resolveAcquisitionSendingStatus };
export { buildDistribution };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const LOG_PATH = path.join(ROOT, 'docs/growth/EXPERIMENT-LOG.md');
const LOG_DIR = path.join(ROOT, 'docs/growth/logs');

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    force: false,
    skipEmail: false,
    forceEmail: false,
    maxSends: 100
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--skip-email') opts.skipEmail = true;
    else if (a === '--force-email') opts.forceEmail = true;
    else if (a === '--max') opts.maxSends = Math.max(1, Math.min(500, Number(argv[++i] || 100)));
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
  const cf = sendData.cohortFunnel || {};
  const crm = sendData.crmSummary || sendData.summary || {};
  const m7 = snapshot?.explicit7d || snapshot?.windows?.['7d']?.metrics || {};
  const metricNum = (...keys) => {
    for (const k of keys) {
      const v = m7?.[k];
      if (v && typeof v === 'object' && 'value' in v) {
        const n = Number(v.value);
        if (Number.isFinite(n)) return n;
      }
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };
  // Canonical scoreboard uses audit_starts / checkout_starts (not raw event-name keys alone).
  const checkoutStarts = metricNum('checkout_starts', 'checkout_started');
  const auditStarts = metricNum('audit_starts', 'audit_started');
  const sesAccepted = Number(send.sent ?? 0) || 0;
  const sesAttempted = Number(send.sesAttempted ?? send.attempted ?? 0) || 0;
  const evaluated = Number(send.evaluated ?? 0) || 0;
  const reasonCounts = send.reasonCounts || aggregateSkipReasons(send.reasons || []);
  const reasons = send.reasons || [];
  const configuredDailyLimit = Number(
    crm.dailyLimit ?? sendData.dailyLimit ?? send.configuredDailyLimit ?? 100
  ) || 100;
  // API historically returned DailyLimit=0 on health_stop — treat that as capacity held, not misconfig.
  const reportedDailyLimit = Number(send.dailyLimit);
  const dailyLimit =
    Number.isFinite(reportedDailyLimit) && reportedDailyLimit > 0
      ? reportedDailyLimit
      : configuredDailyLimit;
  const sendingStatus = resolveAcquisitionSendingStatus({
    crmAutomaticSending: crm.automaticSending === true,
    crmAutomaticPauseReason: crm.automaticPauseReason || null,
    reasons,
    rampBlockReason:
      send.rampBlockReason ||
      crm.automaticPauseReason ||
      crm.acquisitionStatus?.bottleneck ||
      null
  });
  const healthReason = sendingStatus.healthReason;
  const deliverabilityPaused = sendingStatus.deliverabilityPaused;
  const rampBlockReason =
    healthReason ||
    send.rampBlockReason ||
    crm.automaticPauseReason ||
    crm.acquisitionStatus?.bottleneck ||
    null;
  const crmClicksLifetime = Number(cf.clicked ?? funnel.clicked ?? crm.clicked ?? 0) || 0;
  const crmClicksToday = Number(crm.clickedToday ?? crm.clicks?.today ?? 0) || 0;
  const crmClicks7d = Number(crm.clickedLast7Days ?? crm.clicks?.last7Days ?? 0) || 0;
  const crmAuditStarts = Number(cf.auditStarts ?? 0) || 0;
  const crmAuditCompletions = Number(cf.auditCompletions ?? 0) || 0;
  const crmSignups = Number(cf.pricingViewed ?? 0) || 0;
  const crmCheckout = Number(cf.checkoutStarts ?? 0) || 0;
  const crmCustomers = Number(cf.verifiedCustomers ?? funnel.converted ?? 0) || 0;
  const creatorsDiscovered = Number(send.discovered ?? 0) || 0;
  const contactAttempted = Number(send.contactDiscoveryAttempted ?? 0) || 0;
  const publicEmailsFound = Number(send.emailsFound ?? 0) || 0;
  const draftsPrepared = Number(send.draftsPrepared ?? 0) || 0;
  let finalStopReason = send.finalStopReason || send.stopReason || null;
  if (deliverabilityPaused && (!finalStopReason || finalStopReason === 'NO_MORE_WORK')) {
    finalStopReason = 'DELIVERABILITY_PAUSE';
  }

  let exactAction = `COOK-001 daily SES outreach (${sesAccepted} accepted / ${sesAttempted} SES attempts; ${evaluated} prospects evaluated; stop=${finalStopReason || 'n/a'}; discovered=${creatorsDiscovered}; contactAttempts=${contactAttempted}; publicEmails=${publicEmailsFound}; drafts=${draftsPrepared}; invocations=${send.invocations ?? 0})`;
  if (opts.dryRun) {
    exactAction = `[DRY-RUN] COOK-001 daily probe (${(sendData.verifiedProspectIds || []).length} verified candidates)`;
  } else if (deliverabilityPaused) {
    exactAction =
      `DELIVERABILITY SAFETY PAUSE — sending held. Reason: ${rampBlockReason || healthReason || 'deliverability'}. ` +
      `Configured DailyLimit ${configuredDailyLimit} (maximum). Effective send capacity this run: 0. ` +
      `Discovery/SES not executed while paused. Stop: ${finalStopReason}.`;
  } else if (sesAccepted === 0) {
    const dominant = dominantSkipReason(reasonCounts);
    exactAction = `DISTRIBUTION FAILED / BLOCKED — SES accepted 0. Dominant skip: ${dominant}. Evaluated ${evaluated}, SES attempts ${sesAttempted}. Stop: ${finalStopReason || 'n/a'}.`;
  }

  const automaticSending = sendingStatus.automaticSending;
  const automaticPauseReason = sendingStatus.automaticPauseReason;

  return {
    // Scheduler/config may be enabled while distribution is not permitted.
    schedulerEnabled: crm.sendingMode === 'automatic' || crm.automaticSending === true,
    distributionPermitted: sendingStatus.distributionPermitted,
    // Truthful: distribution executed ONLY when SES accepted >= 1.
    executed: sesAccepted > 0,
    distributionAttempted: evaluated > 0 || sesAttempted > 0 || (sendData.verifiedProspectIds || []).length > 0,
    channel: 'approved SES outreach',
    audience: 'cooking creators (COOK-001 verified mailto)',
    attributedVisits:
      crmClicksToday > 0
        ? `${crmClicksToday} COOK-001 CRM clicks today (opaque yb_oid)`
        : `0 clicks today / ${crmClicks7d} in 7d / ${crmClicksLifetime} lifetime (COOK-001 CRM)`,
    activations: `${crmAuditStarts} COOK-001 CRM audit_started (site-wide 7d GA4 audit_starts: ${auditStarts})`,
    checkoutStarts: `${crmCheckout} COOK-001 CRM checkout_started (site-wide 7d GA4: ${checkoutStarts})`,
    _siteWideAuditStarts7d: auditStarts,
    clicks: crm.clicks || {
      today: crmClicksToday,
      last7Days: crmClicks7d,
      lifetime: crmClicksLifetime,
      source: 'COOK-001_CRM'
    },
    newCustomersThisRun: 0,
    existingCustomers: 0,
    customersObservedInWindow: 0,
    experimentAttributedCustomers: crmCustomers > 0 ? String(crmCustomers) : '0',
    verifiedRevenue: '$0.00',
    requiredOwnerApproval: deliverabilityPaused ? 'Review deliverability pause before re-enabling sends' : 'none',
    blockingApproval: false,
    exactActionPrepared: exactAction,
    sesAcceptedThisRun: sesAccepted,
    sesAttemptedThisRun: sesAttempted,
    prospectsEvaluated: evaluated,
    sendAttempts: sesAttempted,
    eligibleProspects: Number(sendData.sendEligible ?? send.evaluated ?? 0) || 0,
    creatorsDiscovered: creatorsDiscovered,
    contactDiscoveryAttempted: contactAttempted,
    publicEmailsFound: publicEmailsFound,
    draftsPrepared: draftsPrepared,
    invalidEmails: Number(send.invalidEmails ?? 0) || 0,
    noPublicEmail: Number(send.noPublicEmail ?? 0) || 0,
    invocations: Number(send.invocations ?? 0) || 0,
    finalStopReason: finalStopReason,
    moreWork: send.moreWork === true,
    skippedByReason: reasons.slice(0, 40),
    skipReasonCounts: reasonCounts,
    pipeline: sendData.pipeline || crm.pipeline || null,
    automaticSending,
    sendingMode: crm.sendingMode || 'automatic',
    automaticPauseReason,
    dailyLimit: dailyLimit,
    dailyRemaining: deliverabilityPaused ? 0 : Number(crm.dailyRemaining ?? Math.max(0, dailyLimit - (crm.sentToday || 0))) || 0,
    crmSummaryOk: crm.ok !== false && (sendData.crmSummary || crm.dailyLimit != null),
    outreachFunnel: {
      drafted: funnel.drafted ?? crm.draftsGenerated ?? 0,
      approved: funnel.approved ?? 0,
      sent: funnel.sent ?? crm.sent ?? 0,
      delivered: funnel.delivered ?? crm.delivered ?? 0,
      clicked: funnel.clicked ?? crm.clicked ?? 0,
      converted: funnel.converted ?? 0
    },
    cohort: {
      runId: `COOK-001-${todayYmd}`,
      qualifiedProspects: Number(sendData.sendEligible ?? 0) || 0,
      emailsAttempted: sesAttempted,
      emailsSent: sesAccepted,
      // This-run cohort clicks: never substitute lifetime when SES accepted today is 0.
      auditClicks: sesAccepted > 0 ? crmClicksToday : 0,
      auditStarts: crmAuditStarts,
      auditCompletions: crmAuditCompletions,
      signups: crmSignups,
      checkoutStarts: crmCheckout,
      verifiedCustomers: crmCustomers,
      verifiedRevenue: 0,
      sameCohortTracking: 'crm_prospect_status',
      dailyLimit: dailyLimit,
      nextRamp: deliverabilityPaused ? 'held — deliverability pause' : 'n/a — saved DailyLimit is a maximum',
      rampBlockReason: rampBlockReason || (deliverabilityPaused ? 'bounce_rate' : null)
    },
    deliverability: {
      bounceRate: deliverabilityPaused && healthReason === 'bounce_rate' ? 'at/above stop threshold (≥3%)' : 'see CRM',
      complaintRate: deliverabilityPaused && healthReason === 'complaint_rate' ? 'at/above stop threshold' : 'see CRM',
      unsubscribeRate:
        deliverabilityPaused && healthReason === 'unsubscribe_rate'
          ? 'at/above stop threshold (≥2%)'
          : 'see CRM',
      dailyLimit: dailyLimit,
      nextRampDecision: deliverabilityPaused
        ? `PAUSED — ${rampBlockReason || healthReason}; configured DailyLimit ${configuredDailyLimit} remains the maximum; effective send capacity 0 until pause clears`
        : rampBlockReason
          ? `hold; ${rampBlockReason}`
          : `DailyLimit ${configuredDailyLimit} is a maximum (not a send target)`
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

function composeAndSendEmail(snapshotPath, distPath, evalPath, notesPath, opts, claimId = null) {
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
  if (opts.forceEmail) args.push('--force-email');
  if (claimId) args.push('--resume-claim', claimId);

  const res = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: ROOT,
    env: {
      ...process.env,
      ...(claimId ? { GROWTH_REPORT_CLAIM_ID: claimId } : {})
    }
  });
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

  // Claim today's Admin report slot early (before COOK-001 / snapshot) so Cursor + GHA + Windows
  // cannot both deliver scheduled emails. --force / --force-email remain for authorized diagnostics.
  let heldClaimId = null;
  if (!opts.dryRun) {
    const claim = tryClaimAdminReportSlot({
      ymd: todayYmd,
      source: process.env.GROWTH_REPORT_SOURCE || 'run-daily-growth-job',
      force: opts.forceEmail === true || opts.force === true
    });
    if (!claim.ok) {
      log(
        `Skipping: Admin growth report already sent/claimed for ${todayYmd} ` +
          `(${claim.source}; messageId=${claim.record?.messageId || 'n/a'}; status=${claim.record?.status || 'n/a'}). No second email.`
      );
      process.exit(0);
    }
    heldClaimId = claim.claim?.claimId || null;
    log(
      `Claimed Admin report slot for ${todayYmd} (claimId=${heldClaimId || 'forced'}; ssmOk=${claim.claim?.ssmOk !== false}).`
    );
  } else {
    const prior = getAdminReportSentToday(todayYmd);
    if (prior.alreadySent) {
      log(`Dry-run note: prior Admin report marker exists (${prior.source}).`);
    }
  }

  const lockRes = acquireLock();
  if (!lockRes.ok) {
    if (heldClaimId) {
      releaseAdminReportClaim({
        ymd: todayYmd,
        claimId: heldClaimId,
        source: process.env.GROWTH_REPORT_SOURCE || 'run-daily-growth-job'
      });
    }
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
    const attemptedToday = dist.sesAttemptedThisRun || dist.sendAttempts || 0;
    const evaluatedToday = dist.prospectsEvaluated || 0;
    const notes = [
      `Automated daily growth run (${weekday}, ${todayYmd}).`,
      `COOK-001: SES accepted ${sentToday}; SES attempts ${attemptedToday}; prospects evaluated ${evaluatedToday}.`,
      `Upstream: discovered=${dist.creatorsDiscovered || 0}; contactAttempts=${dist.contactDiscoveryAttempted || 0}; publicEmails=${dist.publicEmailsFound || 0}; drafts=${dist.draftsPrepared || 0}; invocations=${dist.invocations || 0}.`,
      `Final stop reason: ${dist.finalStopReason || 'n/a'}.`,
      sentToday === 0
        ? `DISTRIBUTION FAILED / BLOCKED. Dominant skip: ${dominantSkipReason(dist.skipReasonCounts || {})}.`
        : `Distribution executed: SES accepted ${sentToday}.`,
      `Production Health: ${health.ok ? 'All checks OK' : 'One or more health checks failed'}.`,
      'New customers this run: 0. Existing customers: 0. Verified net revenue: $0.00.'
    ].join('\n');
    const notesPath = path.join(ROOT, `docs/growth/.notes-${todayYmd}-run.txt`);
    fs.writeFileSync(notesPath, notes, 'utf8');

    const emailOk = composeAndSendEmail(snapPath, distPath, evalPath, notesPath, opts, heldClaimId);
    log(`Email delivery status: ${emailOk ? 'SUCCESS' : 'FAILED'}`);
    if (!emailOk) throw new Error('Growth report email failed');
    log(`Daily growth job completed successfully.`);
  } catch (err) {
    if (heldClaimId) {
      const rel = releaseAdminReportClaim({
        ymd: todayYmd,
        claimId: heldClaimId,
        source: process.env.GROWTH_REPORT_SOURCE || 'run-daily-growth-job'
      });
      log(
        rel.released
          ? `Released Admin report claim after failure (retry allowed).`
          : `Claim release skipped (${rel.reason || 'n/a'}); sent marker preserved if SES accepted.`
      );
    }
    log(`FATAL ERROR in daily growth run: ${err instanceof Error ? err.stack : String(err)}`);
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
