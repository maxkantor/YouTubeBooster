#!/usr/bin/env node
/**
 * Compose a full Admin growth-run email from snapshot + health + experiment log, then send via SES.
 *
 * Usage:
 *   node scripts/growth/compose-and-send-growth-email.mjs
 *   node scripts/growth/compose-and-send-growth-email.mjs --notes "Shipped nothing; EXP-001 still active."
 *   node scripts/growth/compose-and-send-growth-email.mjs --dry-run
 *
 * Optional flags:
 *   --notes "..."     Extra agent notes (what shipped / why not)
 *   --notes-file path
 *   --snapshot path   Default: latest docs/growth/snapshots/funnel-*.json
 *   --dry-run         Print body to stdout; do not send
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSsmSecretsIntoEnv } from './load-ssm-secrets-into-env.mjs';
import { sendAdminGrowthEmail } from './notify-admin-email.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const SNAP_DIR = path.join(ROOT, 'docs/growth/snapshots');
const LOG_PATH = path.join(ROOT, 'docs/growth/EXPERIMENT-LOG.md');

function parseArgs(argv) {
  const out = { notes: '', notesFile: null, snapshot: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--notes') out.notes = argv[++i] ?? '';
    else if (a === '--notes-file') out.notesFile = argv[++i];
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
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

function sumEvents(ga4) {
  const byEvent = {};
  for (const row of ga4?.rows ?? []) {
    const ev = row.dimensionValues?.[0]?.value ?? 'unknown';
    const count = Number(row.metricValues?.[0]?.value ?? 0);
    byEvent[ev] = (byEvent[ev] || 0) + count;
  }
  return byEvent;
}

function topEvents(byEvent, n = 12) {
  return Object.entries(byEvent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function parseActiveExperiments(md) {
  const active = [];
  const re = /###\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(EXP-\d+[^\n]*)([\s\S]*?)(?=\n###\s+\d{4}-\d{2}-\d{2}|\n##\s+Completed|$)/g;
  let m;
  while ((m = re.exec(md))) {
    const block = m[0];
    if (!/\|\s*Status\s*\|\s*active\s*\|/i.test(block)) continue;
    const field = (name) => {
      const fm = block.match(new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|]+)\\s*\\|`, 'i'));
      return fm ? fm[1].trim() : '';
    };
    active.push({
      idLine: `${m[1]} — ${m[2].trim()}`,
      status: field('Status'),
      funnelStage: field('Funnel stage'),
      evalDate: field('Evaluation date'),
      primaryMetric: field('Primary metric'),
      hypothesis: field('Hypothesis'),
      commit: field('Commit'),
      amplify: field('Amplify')
    });
  }
  return active;
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

function formatWindow(label, w) {
  if (!w) return [`${label}: (missing)`];
  const lines = [`${label} (${w.start} → ${w.end})`];
  const events = topEvents(sumEvents(w.ga4));
  if (events.length) {
    lines.push('  GA4 top events:');
    for (const [name, count] of events) {
      lines.push(`    - ${name}: ${count}`);
    }
  } else {
    lines.push('  GA4: no rows (or source missing)');
  }
  const s = w.stripe;
  if (s) {
    lines.push(
      `  Stripe: live paid=${s.livePaidSessions} ($${Number(s.revenueLiveUsd || 0).toFixed(2)})` +
        `; test paid=${s.testPaidSessions} ($${Number(s.revenueTestUsd || 0).toFixed(2)})`
    );
  } else {
    lines.push('  Stripe: (missing)');
  }
  return lines;
}

export function composeGrowthEmailBody({ snapshot, health, experiments, notes, generatedAt }) {
  const date = (generatedAt || new Date()).toISOString().slice(0, 10);
  const lines = [];
  lines.push(`YouTubeBooster AI — Growth run summary`);
  lines.push(`Date: ${date}`);
  lines.push(`Generated (UTC): ${(generatedAt || new Date()).toISOString()}`);
  lines.push(`Site: https://youtubeboosterai.com/`);
  lines.push(`Admin: https://youtubeboosterai.com/admin/orders`);
  lines.push('');

  lines.push('=== Agent notes ===');
  lines.push((notes && notes.trim()) || '(none — measure-only / no-op day)');
  lines.push('');

  lines.push('=== Active experiments ===');
  if (!experiments.length) {
    lines.push('(none marked active in docs/growth/EXPERIMENT-LOG.md)');
  } else {
    for (const ex of experiments) {
      lines.push(`- ${ex.idLine}`);
      lines.push(`  Status: ${ex.status}`);
      lines.push(`  Funnel stage: ${ex.funnelStage || '(n/a)'}`);
      lines.push(`  Eval date: ${ex.evalDate || '(n/a)'}`);
      lines.push(`  Primary metric: ${ex.primaryMetric || '(n/a)'}`);
      if (ex.hypothesis) lines.push(`  Hypothesis: ${ex.hypothesis}`);
      if (ex.commit) lines.push(`  Commit: ${ex.commit}`);
      if (ex.amplify) lines.push(`  Amplify: ${ex.amplify}`);
      lines.push('');
    }
  }

  lines.push('=== Production health ===');
  if (health?.checks?.length) {
    lines.push(`Overall: ${health.ok ? 'OK' : 'FAILED'}`);
    for (const c of health.checks) {
      const detail =
        typeof c.detail === 'string'
          ? c.detail
          : c.detail
            ? JSON.stringify(c.detail)
            : '';
      lines.push(`- ${c.name}: ${c.ok ? 'ok' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
    }
  } else {
    lines.push('(health check unavailable)');
  }
  lines.push('');

  lines.push('=== Funnel / revenue snapshot ===');
  if (!snapshot || snapshot.error) {
    lines.push(`Snapshot unavailable: ${snapshot?.error || 'missing file'}`);
  } else {
    lines.push(`Sources: GA4=${snapshot.sources?.ga4 ?? '?'}; Stripe=${snapshot.sources?.stripe ?? '?'}`);
    if (snapshot.ssm?.loaded) {
      lines.push(`SSM loaded: ${(snapshot.ssm.loaded || []).join(', ') || '(none)'}`);
    }
    if (snapshot.notes?.length) {
      lines.push('Notes:');
      for (const n of snapshot.notes) lines.push(`  - ${n}`);
    }
    lines.push('');
    lines.push(...formatWindow('7d', snapshot.windows?.['7d']));
    lines.push('');
    lines.push(...formatWindow('30d', snapshot.windows?.['30d']));
  }
  lines.push('');

  lines.push('=== Links ===');
  lines.push('- Experiment log: docs/growth/EXPERIMENT-LOG.md');
  lines.push('- Growth skill: .cursor/skills/grow-paid-customers/SKILL.md');
  lines.push('- Snapshots: docs/growth/snapshots/');
  lines.push('');
  lines.push('Truth rule: only Stripe live payments count as paid customers.');
  return lines.join('\n');
}

const invokedAsCli =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  const args = parseArgs(process.argv.slice(2));
  let notes = args.notes;
  if (args.notesFile) notes = fs.readFileSync(args.notesFile, 'utf8');

  const health = runHealth();
  const collectMeta = ensureSnapshot();
  const snapPath = args.snapshot || latestSnapshotPath();
  let snapshot = null;
  if (snapPath && fs.existsSync(snapPath)) {
    snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  } else if (collectMeta?.error) {
    snapshot = { error: collectMeta.error };
  }

  const logMd = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : '';
  const experiments = parseActiveExperiments(logMd);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const body = composeGrowthEmailBody({
    snapshot,
    health,
    experiments,
    notes,
    generatedAt: now
  });
  const subject = `[YouTubeBoosterAI] Growth run - ${date}`;

  if (args.dryRun) {
    console.log(subject);
    console.log('---');
    console.log(body);
    process.exit(0);
  }

  try {
    const result = sendAdminGrowthEmail({ subject, body });
    console.log(
      JSON.stringify(
        {
          ok: true,
          messageId: result.messageId,
          subject,
          snapshotPath: snapPath,
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
