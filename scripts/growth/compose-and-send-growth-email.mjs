#!/usr/bin/env node
/**
 * Compose a full Admin growth-run email from snapshot + health + experiment log, then send via SES.
 *
 * Usage:
 *   node scripts/growth/compose-and-send-growth-email.mjs
 *   node scripts/growth/compose-and-send-growth-email.mjs --notes "..."
 *   node scripts/growth/compose-and-send-growth-email.mjs --dry-run
 *   node scripts/growth/compose-and-send-growth-email.mjs --subject-prefix "[TEST] YouTubeBooster Growth Report"
 *
 * Optional flags:
 *   --notes "..."     Extra agent notes
 *   --notes-file path
 *   --decision "..."  Overrides default Decision section
 *   --snapshot path   Default: latest docs/growth/snapshots/funnel-*.json
 *   --dry-run         Print body to stdout; do not send
 *   --preview-dir path  Write text+html previews
 *   --shipped         Mark that a production change shipped this run
 *   --ship-file path  JSON: change, experiment, url, primaryMetric, attribution, commit, amplify, verification, kind
 *   --distribution-file path  JSON acquisition lead: executed, channel, audience, attributedVisits, activations, checkoutStarts, newCustomersThisRun, existingCustomers, customersObservedInWindow, experimentAttributedCustomers, verifiedRevenue, requiredOwnerApproval, blockingApproval, exactActionPrepared
 *   --subject-prefix  Override subject prefix
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { composeGrowthReport } from './lib/compose-report.mjs';
import { parseActiveExperiments } from './lib/experiment-report.mjs';
import { loadSsmSecretsIntoEnv } from './load-ssm-secrets-into-env.mjs';
import { sendAdminGrowthEmail } from './notify-admin-email.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const SNAP_DIR = path.join(ROOT, 'docs/growth/snapshots');
const LOG_PATH = path.join(ROOT, 'docs/growth/EXPERIMENT-LOG.md');

function parseArgs(argv) {
  const out = {
    notes: '',
    notesFile: null,
    decision: '',
    snapshot: null,
    dryRun: false,
    previewDir: null,
    shipped: false,
    shipFile: null,
    evaluationsFile: null,
    distributionFile: null,
    subjectPrefix: 'YouTubeBooster Growth',
    skipCollect: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--notes') out.notes = argv[++i] ?? '';
    else if (a === '--notes-file') out.notesFile = argv[++i];
    else if (a === '--decision') out.decision = argv[++i] ?? '';
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--preview-dir') out.previewDir = argv[++i];
    else if (a === '--shipped') out.shipped = true;
    else if (a === '--ship-file') out.shipFile = argv[++i];
    else if (a === '--evaluations-file') out.evaluationsFile = argv[++i];
    else if (a === '--distribution-file') out.distributionFile = argv[++i];
    else if (a === '--subject-prefix') out.subjectPrefix = argv[++i] ?? out.subjectPrefix;
    else if (a === '--skip-collect') out.skipCollect = true;
  }
  return out;
}

function latestSnapshotPath() {
  if (!fs.existsSync(SNAP_DIR)) return null;
  const files = fs
    .readdirSync(SNAP_DIR)
    .filter((f) => /^funnel-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (!files.length) return null;
  return path.join(SNAP_DIR, files[files.length - 1]);
}

function runHealth() {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'check-production-health.mjs')], {
    encoding: 'utf8',
    cwd: ROOT
  });
  try {
    return JSON.parse(r.stdout || '{}');
  } catch {
    return { ok: false, checks: [], parseError: true, exit: r.status };
  }
}

function ensureSnapshot() {
  loadSsmSecretsIntoEnv();
  const r = spawnSync(process.execPath, [path.join(__dirname, 'collect-funnel-snapshot.mjs')], {
    encoding: 'utf8',
    cwd: ROOT
  });
  if (r.status !== 0) {
    return { error: (r.stderr || r.stdout || '').slice(0, 500) };
  }
  try {
    return JSON.parse(r.stdout || '{}');
  } catch {
    return { error: 'snapshot stdout not JSON' };
  }
}

/** @deprecated use composeGrowthReport — kept for import compatibility in tests */
export function composeGrowthEmailBody(args) {
  const report = composeGrowthReport({
    snapshot: args.snapshot,
    health: args.health,
    experiments: args.experiments,
    notes: args.notes,
    generatedAt: args.generatedAt
  });
  return { text: report.text, html: report.html, subject: report.subject };
}

const invokedAsCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  const args = parseArgs(process.argv.slice(2));
  let notes = args.notes;
  if (args.notesFile) notes = fs.readFileSync(args.notesFile, 'utf8');

  const health = runHealth();
  let collectMeta = {};
  if (!args.skipCollect && !args.snapshot) {
    collectMeta = ensureSnapshot();
  }

  const snapPath = args.snapshot || latestSnapshotPath();
  let snapshot = null;
  if (snapPath && fs.existsSync(snapPath)) {
    snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  } else if (collectMeta?.error) {
    snapshot = { error: collectMeta.error, sources: {}, windows: {} };
  } else {
    snapshot = { error: 'missing snapshot', sources: {}, windows: {} };
  }

  const logMd = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : '';
  const experiments = parseActiveExperiments(logMd);
  const now = new Date();
  const ship = args.shipFile ? JSON.parse(fs.readFileSync(args.shipFile, 'utf8')) : undefined;
  const evaluations = args.evaluationsFile
    ? JSON.parse(fs.readFileSync(args.evaluationsFile, 'utf8'))
    : undefined;
  const distribution = args.distributionFile
    ? JSON.parse(fs.readFileSync(args.distributionFile, 'utf8'))
    : undefined;

  const lockPath = path.join(ROOT, 'docs/growth/strategy-lock.json');
  let strategyLock = undefined;
  if (fs.existsSync(lockPath)) {
    const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (raw.status === 'LOCKED') {
      const etYmd = new Intl.DateTimeFormat('en-CA', {
        timeZone: raw.timezone || 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(now);
      const start = Date.parse(`${raw.lockStartYmd}T12:00:00Z`);
      const today = Date.parse(`${etYmd}T12:00:00Z`);
      const day =
        Number.isFinite(start) && Number.isFinite(today)
          ? Math.max(1, Math.floor((today - start) / 86400000) + 1)
          : 1;
      strategyLock = { ...raw, lockDay: Math.min(day, raw.totalLockDays || 7), etYmd };
    }
  }

  const report = composeGrowthReport({
    snapshot,
    health,
    experiments,
    notes,
    decision: args.decision,
    shipped: args.shipped,
    ship,
    evaluations,
    distribution,
    strategyLock,
    generatedAt: now,
    subjectPrefix: args.subjectPrefix
  });

  if (args.previewDir) {
    fs.mkdirSync(args.previewDir, { recursive: true });
    fs.writeFileSync(path.join(args.previewDir, 'growth-report.txt'), report.text, 'utf8');
    fs.writeFileSync(path.join(args.previewDir, 'growth-report.html'), report.html, 'utf8');
    fs.writeFileSync(
      path.join(args.previewDir, 'growth-report.meta.json'),
      JSON.stringify(
        {
          subject: report.subject,
          warnings: report.warnings,
          decision: report.decision,
          et: report.et
        },
        null,
        2
      ),
      'utf8'
    );
  }

  if (args.dryRun) {
    console.log(report.subject);
    console.log('--- TEXT ---');
    console.log(report.text);
    process.exit(0);
  }

  try {
    const result = sendAdminGrowthEmail({
      subject: report.subject,
      body: report.text,
      htmlBody: report.html
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          messageId: result.messageId,
          subject: result.subjectSent ?? report.subject,
          snapshotPath: snapPath,
          warnings: report.warnings,
          activeExperiments: experiments.map((e) => e.idLine)
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
}
