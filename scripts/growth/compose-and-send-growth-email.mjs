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

/** Keep Outlook-safe: no fancy dashes/arrows that show as mojibake. */
function ascii(s) {
  return String(s ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u2190-\u21FF]/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

function escapeHtml(s) {
  return ascii(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function topEvents(byEvent, n = 10) {
  return Object.entries(byEvent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function parseActiveExperiments(md) {
  const active = [];
  const re =
    /###\s+(\d{4}-\d{2}-\d{2})\s+[-\u2013\u2014]\s+(EXP-\d+[^\n]*)([\s\S]*?)(?=\n###\s+\d{4}-\d{2}-\d{2}|\n##\s+Completed|$)/g;
  let m;
  while ((m = re.exec(md))) {
    const block = m[0];
    if (!/\|\s*Status\s*\|\s*active\s*\|/i.test(block)) continue;
    const field = (name) => {
      const fm = block.match(new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|]+)\\s*\\|`, 'i'));
      return fm ? ascii(fm[1].trim()) : '';
    };
    active.push({
      idLine: ascii(`${m[1]} - ${m[2].trim()}`),
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

function windowSummary(label, w) {
  if (!w) {
    return { label, range: '(missing)', events: [], stripe: null };
  }
  return {
    label,
    range: `${w.start} to ${w.end}`,
    events: topEvents(sumEvents(w.ga4)),
    stripe: w.stripe || null
  };
}

function keyMetrics(events) {
  const get = (name) => events.find(([n]) => n === name)?.[1] ?? 0;
  return {
    sessions: get('session_start'),
    firstVisits: get('first_visit'),
    pageViews: get('page_view'),
    auditStarted: get('audit_started'),
    auditCompleted: get('audit_completed'),
    demoOpened: get('demo_opened'),
    pricingViewed: get('pricing_viewed')
  };
}

export function composeGrowthEmailBody({ snapshot, health, experiments, notes, generatedAt }) {
  const date = (generatedAt || new Date()).toISOString().slice(0, 10);
  const generated = (generatedAt || new Date()).toISOString();
  const noteText = ascii((notes && notes.trim()) || '(none - measure-only / no-op day)');

  const w7 = windowSummary('7d', snapshot?.windows?.['7d']);
  const w30 = windowSummary('30d', snapshot?.windows?.['30d']);
  const m7 = keyMetrics(w7.events);
  const m30 = keyMetrics(w30.events);

  // ---- plain text (ASCII) ----
  const t = [];
  t.push('YouTubeBooster AI - Growth run summary');
  t.push('=====================================');
  t.push(`Date: ${date}`);
  t.push(`Generated (UTC): ${generated}`);
  t.push('Site: https://youtubeboosterai.com/');
  t.push('Admin: https://youtubeboosterai.com/admin/orders');
  t.push('');
  t.push('1) AGENT NOTES');
  t.push('--------------');
  t.push(noteText);
  t.push('');
  t.push('2) SCOREBOARD');
  t.push('-------------');
  t.push(
    `7d:  sessions=${m7.sessions}  audits_started=${m7.auditStarted}  audits_completed=${m7.auditCompleted}  live_paid=${w7.stripe?.livePaidSessions ?? '?'} ($${Number(w7.stripe?.revenueLiveUsd || 0).toFixed(2)})`
  );
  t.push(
    `30d: sessions=${m30.sessions}  audits_started=${m30.auditStarted}  audits_completed=${m30.auditCompleted}  live_paid=${w30.stripe?.livePaidSessions ?? '?'} ($${Number(w30.stripe?.revenueLiveUsd || 0).toFixed(2)})`
  );
  t.push('');
  t.push('3) ACTIVE EXPERIMENTS');
  t.push('---------------------');
  if (!experiments.length) {
    t.push('(none marked active)');
  } else {
    for (const ex of experiments) {
      t.push(`* ${ex.idLine}`);
      t.push(`  Status: ${ex.status} | Eval: ${ex.evalDate || 'n/a'} | Stage: ${ex.funnelStage || 'n/a'}`);
      t.push(`  Metric: ${ex.primaryMetric || 'n/a'}`);
      if (ex.commit || ex.amplify) {
        t.push(`  Ship: commit ${ex.commit || 'n/a'}; Amplify ${ex.amplify || 'n/a'}`);
      }
      t.push('');
    }
  }
  t.push('4) PRODUCTION HEALTH');
  t.push('--------------------');
  if (health?.checks?.length) {
    t.push(`Overall: ${health.ok ? 'OK' : 'FAILED'}`);
    for (const c of health.checks) {
      t.push(`- ${c.name}: ${c.ok ? 'ok' : 'FAIL'}`);
    }
  } else {
    t.push('(health check unavailable)');
  }
  t.push('');
  t.push('5) GA4 TOP EVENTS');
  t.push('-----------------');
  if (!snapshot || snapshot.error) {
    t.push(`Snapshot unavailable: ${ascii(snapshot?.error || 'missing file')}`);
  } else {
    t.push(`Sources: GA4=${snapshot.sources?.ga4 ?? '?'}; Stripe=${snapshot.sources?.stripe ?? '?'}`);
    t.push(`7d (${w7.range}):`);
    for (const [name, count] of w7.events) t.push(`  - ${name}: ${count}`);
    t.push(`30d (${w30.range}):`);
    for (const [name, count] of w30.events) t.push(`  - ${name}: ${count}`);
  }
  t.push('');
  t.push('6) LINKS');
  t.push('--------');
  t.push('- Experiment log: docs/growth/EXPERIMENT-LOG.md');
  t.push('- Growth skill: .cursor/skills/grow-paid-customers/SKILL.md');
  t.push('');
  t.push('Truth rule: only Stripe live payments count as paid customers.');

  const text = t.join('\n');

  // ---- HTML (Outlook-friendly) ----
  const healthRows = (health?.checks || [])
    .map(
      (c) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(c.name)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${c.ok ? 'OK' : 'FAIL'}</td></tr>`
    )
    .join('');

  const expHtml = experiments.length
    ? experiments
        .map(
          (ex) => `
      <div style="margin:0 0 14px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">
        <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(ex.idLine)}</div>
        <div style="font-size:13px;line-height:1.45;color:#374151;">
          <div><b>Status:</b> ${escapeHtml(ex.status)} &nbsp;|&nbsp; <b>Eval:</b> ${escapeHtml(ex.evalDate || 'n/a')}</div>
          <div><b>Stage:</b> ${escapeHtml(ex.funnelStage || 'n/a')}</div>
          <div><b>Metric:</b> ${escapeHtml(ex.primaryMetric || 'n/a')}</div>
          ${ex.hypothesis ? `<div style="margin-top:6px;"><b>Hypothesis:</b> ${escapeHtml(ex.hypothesis)}</div>` : ''}
          <div style="margin-top:6px;color:#6b7280;">Commit ${escapeHtml(ex.commit || 'n/a')} · Amplify ${escapeHtml(ex.amplify || 'n/a')}</div>
        </div>
      </div>`
        )
        .join('')
    : '<p style="color:#6b7280;">(none marked active)</p>';

  const eventTable = (label, range, events) => {
    const rows = events
      .map(
        ([name, count]) =>
          `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(name)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${count}</td></tr>`
      )
      .join('');
    return `
      <h3 style="margin:16px 0 6px;font-size:14px;">${escapeHtml(label)} <span style="font-weight:400;color:#6b7280;">(${escapeHtml(range)})</span></h3>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:6px 8px;">Event</th><th align="right" style="padding:6px 8px;">Count</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2" style="padding:6px 8px;">No rows</td></tr>'}</tbody>
      </table>`;
  };

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>YouTubeBooster AI Growth run</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 20px;background:#0f172a;color:#fff;">
      <div style="font-size:18px;font-weight:700;">YouTubeBooster AI - Growth run</div>
      <div style="font-size:13px;opacity:0.85;margin-top:4px;">${escapeHtml(date)} · UTC ${escapeHtml(generated)}</div>
    </div>
    <div style="padding:18px 20px;">
      <p style="margin:0 0 12px;font-size:13px;">
        <a href="https://youtubeboosterai.com/">Site</a> ·
        <a href="https://youtubeboosterai.com/admin/orders">Admin orders</a>
      </p>

      <h2 style="font-size:15px;margin:18px 0 8px;">1) Agent notes</h2>
      <pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;white-space:pre-wrap;font-size:13px;line-height:1.45;">${escapeHtml(noteText)}</pre>

      <h2 style="font-size:15px;margin:18px 0 8px;">2) Scoreboard</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th align="left" style="padding:6px 8px;">Window</th>
            <th align="right" style="padding:6px 8px;">Sessions</th>
            <th align="right" style="padding:6px 8px;">Audits start</th>
            <th align="right" style="padding:6px 8px;">Audits done</th>
            <th align="right" style="padding:6px 8px;">Live paid</th>
            <th align="right" style="padding:6px 8px;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">7d</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m7.sessions}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m7.auditStarted}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${m7.auditCompleted}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${w7.stripe?.livePaidSessions ?? '?'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">$${Number(w7.stripe?.revenueLiveUsd || 0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:6px 8px;">30d</td>
            <td style="padding:6px 8px;text-align:right;">${m30.sessions}</td>
            <td style="padding:6px 8px;text-align:right;">${m30.auditStarted}</td>
            <td style="padding:6px 8px;text-align:right;">${m30.auditCompleted}</td>
            <td style="padding:6px 8px;text-align:right;">${w30.stripe?.livePaidSessions ?? '?'}</td>
            <td style="padding:6px 8px;text-align:right;">$${Number(w30.stripe?.revenueLiveUsd || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <h2 style="font-size:15px;margin:18px 0 8px;">3) Active experiments</h2>
      ${expHtml}

      <h2 style="font-size:15px;margin:18px 0 8px;">4) Production health</h2>
      <p style="margin:0 0 8px;font-size:13px;"><b>Overall:</b> ${health?.ok ? 'OK' : 'FAILED'}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${healthRows || '<tr><td style="padding:6px 8px;">(unavailable)</td></tr>'}</tbody>
      </table>

      <h2 style="font-size:15px;margin:18px 0 8px;">5) GA4 top events</h2>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Sources: GA4=${escapeHtml(snapshot?.sources?.ga4 ?? '?')}; Stripe=${escapeHtml(snapshot?.sources?.stripe ?? '?')}</p>
      ${eventTable('7d', w7.range, w7.events)}
      ${eventTable('30d', w30.range, w30.events)}

      <p style="margin:20px 0 0;font-size:12px;color:#6b7280;">
        Truth rule: only Stripe live payments count as paid customers.
      </p>
    </div>
  </div>
</body>
</html>`;

  return { text, html };
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
  const timeEt = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const { text, html } = composeGrowthEmailBody({
    snapshot,
    health,
    experiments,
    notes,
    generatedAt: now
  });
  const subject = `[YouTubeBoosterAI] Growth run ${date} ${timeEt} ET`;

  if (args.dryRun) {
    console.log(subject);
    console.log('--- TEXT ---');
    console.log(text);
    process.exit(0);
  }

  try {
    const result = sendAdminGrowthEmail({ subject, body: text, htmlBody: html });
    console.log(
      JSON.stringify(
        {
          ok: true,
          messageId: result.messageId,
          subject: result.subjectSent ?? subject,
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
