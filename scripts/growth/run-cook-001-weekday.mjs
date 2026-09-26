#!/usr/bin/env node
/**
 * COOK-001 weekday path.
 * Discovers / drafts remaining inventory, then calls weekday-send in a continuation
 * loop. Automatic COOK-001 sends qualified contacts without Admin Approvals clicks.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const API = process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const REGION = process.env.AWS_REGION || 'us-east-1';
const MAX_DEFAULT = 100;

const SKIP_HANDLES = new Set(['@sohlaandham', '@kelvinskitchen']);

function parseArgs(argv) {
  const out = { max: MAX_DEFAULT, dryRun: false, autoApprove: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') out.max = Math.max(1, Math.min(500, Number(argv[++i] || MAX_DEFAULT)));
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--auto-approve') out.autoApprove = true; // escape hatch only; default OFF
  }
  return out;
}

function ssmGet(name, secure = false) {
  const args = ['ssm', 'get-parameter', '--name', name, '--region', REGION, '--query', 'Parameter.Value', '--output', 'text'];
  if (secure) args.splice(4, 0, '--with-decryption');
  const r = spawnSync('aws', args, { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const v = (r.stdout || '').trim();
  return v && v !== 'None' ? v : null;
}

function extractMailto(html) {
  const matches = [...String(html).matchAll(/mailto:([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/gi)];
  const emails = [...new Set(matches.map((m) => m[1].trim().toLowerCase()))];
  return emails.filter((e) => !e.endsWith('.png') && !e.includes('example.com') && !e.includes('sentry.io'));
}

function classifyContactType(pageUrl, html) {
  const blob = `${pageUrl} ${html}`.toLowerCase();
  if (blob.includes('partnership') || blob.includes('work with') || blob.includes('collab')) return 'partnership';
  if (blob.includes('press') || blob.includes('media')) return 'media';
  if (blob.includes('contact')) return 'business';
  return 'general';
}

function cookiesFromResponse(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

function loadCsvCandidates() {
  const csv = fs.readFileSync(path.join(ROOT, 'docs/growth/prospects/COOK-001-QUALIFIED.csv'), 'utf8');
  const rows = [];
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const parts = [];
    let cur = '';
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    parts.push(cur);
    const [id, name, handle, channelUrl, , , , , , contactUrl, contactStatus] = parts;
    rows.push({
      id,
      name,
      handle: (handle || '').toLowerCase(),
      channelUrl,
      contactUrl: contactUrl || '',
      contactStatus: contactStatus || ''
    });
  }
  return rows.filter((r) => r.contactUrl.startsWith('http') && !SKIP_HANDLES.has(r.handle));
}

async function fetchOfficial(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'YouTubeBoosterAcquisitionBot/1.0' } });
  const html = await res.text();
  return { ok: res.ok, status: res.status, finalUrl: res.url, html };
}

async function adminLogin() {
  const email = ssmGet('/youtubebooster/admin/email', false);
  const password = ssmGet('/youtubebooster/admin/password', true);
  if (!email || !password) throw new Error('admin_ssm_missing');
  const login = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) throw new Error(`admin_login_failed:${login.status}`);
  const cookie = cookiesFromResponse(login);
  if (!cookie) throw new Error('no_session_cookie');
  return cookie;
}

async function adminJson(cookie, pathName, opts = {}) {
  const res = await fetch(`${API}${pathName}`, {
    ...opts,
    headers: { cookie, 'content-type': 'application/json', ...(opts.headers || {}) }
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json };
}

const args = parseArgs(process.argv.slice(2));
const postal = ssmGet('/youtubebooster/business/postal-address', false);
if (!postal || postal.length < 10) {
  console.log(JSON.stringify({ ok: false, error: 'postal_missing' }));
  process.exit(1);
}

const cookie = await adminLogin();
const summaryBefore = await adminJson(cookie, '/api/admin/crm/acquisition/summary');

// Re-score / contact-research existing CRM prospects (preserves IDs).
let migrate = null;
if (!args.dryRun) {
  migrate = await adminJson(cookie, `/api/admin/crm/acquisition/migrate-rescore?limit=${args.max}`, {
    method: 'POST'
  });
}

const candidates = loadCsvCandidates();
const probes = [];
const drafted = [];

for (const row of candidates) {
  if (drafted.length >= args.max) break;
  let probe;
  try {
    probe = await fetchOfficial(row.contactUrl);
  } catch {
    probes.push({ id: row.id, handle: row.handle, result: 'FETCH_FAILED' });
    continue;
  }
  const emails = extractMailto(probe.html);
  if (!emails.length) {
    probes.push({ id: row.id, handle: row.handle, result: 'FORM_ONLY_OR_NO_MAILTO', http: probe.status });
    continue;
  }
  const email = emails[0];
  const contactType = classifyContactType(row.contactUrl, probe.html);
  probes.push({ id: row.id, handle: row.handle, result: 'OFFICIAL_MAILTO', emailCount: emails.length });

  if (args.dryRun) {
    drafted.push({ id: row.id, handle: row.handle });
    continue;
  }

  const inspect = await adminJson(cookie, '/api/admin/crm/acquisition/inspect', {
    method: 'POST',
    body: JSON.stringify({
      channelInput: row.handle || row.channelUrl,
      primaryNiche: 'cooking',
      campaign: 'COOK-001',
      language: 'en',
      officialWebsite: row.contactUrl,
      publicBusinessEmail: email,
      contactSourceUrl: row.contactUrl,
      contactType,
      notes: 'Official-site mailto verified COOK-001 — queued for human approval'
    })
  });
  const pub = inspect.json?.public || inspect.json?.Public || {};
  const prospectId = pub.prospectId || pub.ProspectId;
  const placeholder = pub.previewPlaceholder === true || pub.PreviewPlaceholder === true;
  const score = pub.priorityScore ?? pub.PriorityScore ?? pub.acquisitionScore ?? pub.AcquisitionScore;
  probes[probes.length - 1].score = score ?? null;
  probes[probes.length - 1].subscriberRange = pub.subscriberRange || pub.SubscriberRange || null;
  probes[probes.length - 1].recentUploadAt = pub.recentUploadAt || pub.RecentUploadAt || null;
  if (!inspect.ok || !prospectId || placeholder) {
    probes[probes.length - 1].inspect = 'FAILED_OR_PLACEHOLDER';
    continue;
  }
  if (!Number.isFinite(score) || score < 70) {
    probes[probes.length - 1].inspect = 'SCORE_BELOW_70';
    continue;
  }
  const draft = await adminJson(cookie, `/api/admin/crm/acquisition/prospects/${encodeURIComponent(prospectId)}/draft`, {
    method: 'POST'
  });
  if (!draft.ok) {
    probes[probes.length - 1].draft = 'FAILED';
    continue;
  }
  probes[probes.length - 1].score = score;
  drafted.push({ id: prospectId, handle: row.handle, score });
}

let approval = null;
let send = null;
if (!args.dryRun) {
  await adminJson(cookie, '/api/admin/crm/acquisition/campaign-flags', {
    method: 'POST',
    body: JSON.stringify({ campaign: 'COOK-001', sendingEnabled: true, complaintPause: false })
  });

  if (args.autoApprove && drafted.length) {
    const approve = await adminJson(cookie, '/api/admin/crm/acquisition/approvals', {
      method: 'POST',
      body: JSON.stringify({
        campaign: 'COOK-001',
        prospectIds: drafted.map((v) => v.id),
        maximumSends: args.max,
        audienceQueryVersion: 'v1'
      })
    });
    approval = {
      ok: approve.ok,
      status: approve.status,
      approvalId: approve.json?.approvalId || approve.json?.ApprovalId,
      error: approve.json?.error,
      note: 'auto_approve_escape_hatch'
    };
  } else {
    approval = {
      ok: true,
      skipped: true,
      awaitingHumanApproval: 0,
      note: 'COOK-001 automatic mode sends qualified contacts without Approvals clicks'
    };
  }
}

{
  const cron = ssmGet('/youtubebooster/outreach/cron-key', true);
  if (!cron) {
    send = { status: 'BLOCKED', error: 'cron_key_missing' };
  } else {
    const combined = {
      http: 0,
      marketingSendingEnabled: true,
      attempted: 0,
      sesAttempted: 0,
      evaluated: 0,
      sent: 0,
      skipped: 0,
      wouldSend: 0,
      reasons: [],
      dailyLimit: 100,
      cohortRunId: null,
      moreWork: false,
      invocations: 0,
      discovered: 0,
      emailsFound: 0,
      draftsPrepared: 0,
      contactDiscoveryAttempted: 0,
      invalidEmails: 0,
      noPublicEmail: 0,
      stopReason: null,
      finalStopReason: null
    };
    const maxInvocations = 12;
    for (let i = 0; i < maxInvocations; i++) {
      const url = args.dryRun
        ? `${API}/api/public/acq/weekday-send?dryRun=true`
        : `${API}/api/public/acq/weekday-send`;
      const weekday = await fetch(url, {
        method: 'POST',
        headers: { 'X-Outreach-Cron-Key': cron, 'content-type': 'application/json' }
      });
      const text = await weekday.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      combined.http = weekday.status;
      combined.marketingSendingEnabled = json.marketingSendingEnabled ?? json.MarketingSendingEnabled;
      combined.attempted += Number(json.sesAttempted ?? json.SesAttempted ?? json.attempted ?? json.Attempted ?? 0) || 0;
      combined.sesAttempted = combined.attempted;
      combined.evaluated += Number(json.evaluated ?? json.Evaluated ?? 0) || 0;
      combined.sent += Number(json.sent ?? json.Sent ?? 0) || 0;
      combined.skipped += Number(json.skipped ?? json.Skipped ?? 0) || 0;
      combined.wouldSend += Number(json.wouldSend ?? json.WouldSend ?? 0) || 0;
      combined.discovered = (combined.discovered || 0) + (Number(json.discovered ?? json.Discovered ?? 0) || 0);
      combined.emailsFound = (combined.emailsFound || 0) + (Number(json.emailsFound ?? json.EmailsFound ?? 0) || 0);
      combined.draftsPrepared = (combined.draftsPrepared || 0) + (Number(json.draftsPrepared ?? json.DraftsPrepared ?? 0) || 0);
      combined.contactDiscoveryAttempted =
        (combined.contactDiscoveryAttempted || 0) +
        (Number(json.contactDiscoveryAttempted ?? json.ContactDiscoveryAttempted ?? 0) || 0);
      combined.invalidEmails =
        (combined.invalidEmails || 0) + (Number(json.invalidEmails ?? json.InvalidEmails ?? 0) || 0);
      combined.noPublicEmail =
        (combined.noPublicEmail || 0) + (Number(json.noPublicEmail ?? json.NoPublicEmail ?? 0) || 0);
      combined.reasons = combined.reasons.concat(json.reasons || json.Reasons || []).slice(0, 80);
      combined.dailyLimit = json.dailyLimit ?? json.DailyLimit ?? combined.dailyLimit;
      combined.cohortRunId = json.cohortRunId ?? json.CohortRunId ?? combined.cohortRunId;
      combined.moreWork = json.moreWork === true || json.MoreWork === true;
      combined.stopReason = json.stopReason ?? json.StopReason ?? combined.stopReason;
      combined.invocations += 1;
      const sentThis = Number(json.sent ?? json.Sent ?? 0) || 0;
      if (!combined.moreWork) {
        combined.finalStopReason = combined.stopReason || (sentThis > 0 ? 'COMPLETE' : 'NO_MORE_WORK');
        break;
      }
      if (i === maxInvocations - 1) {
        combined.finalStopReason = 'CONTINUATION_INVOCATION_CAP';
      }
    }
    if (!combined.finalStopReason) {
      combined.finalStopReason = combined.moreWork ? 'CONTINUATION_INVOCATION_CAP' : combined.stopReason || 'COMPLETE';
    }
    send = combined;
  }
}

const summaryAfter = await adminJson(cookie, '/api/admin/crm/acquisition/summary');
console.log(
  JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    autoApprove: args.autoApprove,
    migrate: migrate?.json || migrate,
    draftedForApproval: drafted.length,
    drafted,
    probes: probes.slice(0, 40),
    approval,
    send,
    summaryBefore: summaryBefore.json?.northStar || summaryBefore.json?.cohortFunnel || null,
    summaryAfter: summaryAfter.json?.northStar || summaryAfter.json?.cohortFunnel || null
  })
);
