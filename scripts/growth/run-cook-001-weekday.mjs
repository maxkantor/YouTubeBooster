#!/usr/bin/env node
/**
 * Conservative COOK-001 weekday send.
 * Uses only official-site mailto addresses. Never prints emails.
 * Approves at most --max (default 10) verified contacts, then calls weekday-send.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const API = process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const REGION = process.env.AWS_REGION || 'us-east-1';
const MAX_DEFAULT = 10;

const SKIP_HANDLES = new Set(['@sohlaandham', '@kelvinskitchen']);

function parseArgs(argv) {
  const out = { max: MAX_DEFAULT, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') out.max = Math.max(1, Math.min(30, Number(argv[++i] || MAX_DEFAULT)));
    else if (a === '--dry-run') out.dryRun = true;
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
const candidates = loadCsvCandidates();
const probes = [];
const verified = [];

for (const row of candidates) {
  if (verified.length >= args.max) break;
  let probe;
  try {
    probe = await fetchOfficial(row.contactUrl);
  } catch (e) {
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
    verified.push({ id: row.id, handle: row.handle });
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
      notes: 'Official-site mailto verified 2026-08-19 COOK-001 conservative batch'
    })
  });
  const pub = inspect.json?.public || inspect.json?.Public || {};
  const prospectId = pub.prospectId || pub.ProspectId;
  const placeholder = pub.previewPlaceholder === true || pub.PreviewPlaceholder === true;
  const score = pub.priorityScore ?? pub.PriorityScore;
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
  verified.push({ id: prospectId, handle: row.handle, score });
}

let approval = null;
let send = null;
if (!args.dryRun && verified.length) {
  const flags = await adminJson(cookie, '/api/admin/crm/acquisition/campaign-flags', {
    method: 'POST',
    body: JSON.stringify({ campaign: 'COOK-001', sendingEnabled: true, complaintPause: false })
  });
  const approve = await adminJson(cookie, '/api/admin/crm/acquisition/approvals', {
    method: 'POST',
    body: JSON.stringify({
      campaign: 'COOK-001',
      prospectIds: verified.map((v) => v.id),
      maximumSends: args.max,
      audienceQueryVersion: 'v1'
    })
  });
  approval = {
    ok: approve.ok,
    status: approve.status,
    approvalId: approve.json?.approvalId || approve.json?.ApprovalId,
    error: approve.json?.error
  };
  const cron = ssmGet('/youtubebooster/outreach/cron-key', true);
  if (!cron) {
    send = { status: 'BLOCKED', error: 'cron_key_missing' };
  } else if (!approval.ok) {
    send = { status: 'BLOCKED', error: 'approval_failed' };
  } else {
    const weekday = await fetch(`${API}/api/public/acq/weekday-send`, {
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
    send = {
      http: weekday.status,
      marketingSendingEnabled: json.marketingSendingEnabled ?? json.MarketingSendingEnabled,
      attempted: json.sesAttempted ?? json.SesAttempted ?? json.attempted ?? json.Attempted,
      sesAttempted: json.sesAttempted ?? json.SesAttempted ?? json.attempted ?? json.Attempted,
      evaluated: json.evaluated ?? json.Evaluated ?? 0,
      sent: json.sent ?? json.Sent,
      skipped: json.skipped ?? json.Skipped,
      reasons: (json.reasons || json.Reasons || []).slice(0, 40),
      reasonCounts: json.reasonCounts || json.ReasonCounts || null,
      dailyLimit: json.dailyLimit ?? json.DailyLimit,
      rampBlockReason: json.rampBlockReason ?? json.RampBlockReason
    };
  }
  send.flagsHttp = flags.status;
}

const summaryAfter = await adminJson(cookie, '/api/admin/crm/acquisition/summary');
const s = summaryAfter.json || {};
console.log(
  JSON.stringify(
    {
      ok: (send?.sent || 0) > 0,
      dryRun: args.dryRun,
      postalConfigured: true,
      emailsPrinted: false,
      probes,
      verifiedProspectIds: verified.map((v) => v.id),
      approval,
      send,
      funnel: {
        drafted: s.drafts ?? 0,
        approved: s.approved ?? 0,
        sent: s.sent ?? 0,
        delivered: s.delivered ?? 'Unknown',
        clicked: 'Unknown',
        converted: s.converted ?? 0,
        marketingSendingEnabled: s.marketingSendingEnabled === true
      },
      summaryBefore: summaryBefore.json
        ? {
            marketingSendingEnabled: summaryBefore.json.marketingSendingEnabled,
            contactVerified: summaryBefore.json.contactVerified,
            drafts: summaryBefore.json.drafts,
            approved: summaryBefore.json.approved,
            sent: summaryBefore.json.sent
          }
        : null
    },
    null,
    2
  )
);
