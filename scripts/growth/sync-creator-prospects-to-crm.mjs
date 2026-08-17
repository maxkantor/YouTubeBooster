#!/usr/bin/env node
/**
 * Discover COOK-001 cooking channels via public demo API and upsert into production CRM.
 * Uses Admin session (SSM admin/email + admin/password). Never sends email.
 *
 * Usage:
 *   node scripts/growth/sync-creator-prospects-to-crm.mjs
 *   node scripts/growth/sync-creator-prospects-to-crm.mjs --dry-run
 *   node scripts/growth/sync-creator-prospects-to-crm.mjs --limit 120
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeDemo } from './lib/creator-acquisition.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const API = process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const REGION = process.env.AWS_REGION || 'us-east-1';
const SSM_PREFIX = process.env.SSM__BASEPATH || '/youtubebooster';

function parseArgs(argv) {
  const out = { dryRun: false, limit: 120, draft: true, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = Number(argv[++i] || 120);
    else if (a === '--no-draft') out.draft = false;
    else if (a === '--concurrency') out.concurrency = Number(argv[++i] || 3);
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

function loadCookingSeeds() {
  const mainPath = path.join(ROOT, 'scripts/growth/discover-creator-prospects.mjs');
  const src = fs.readFileSync(mainPath, 'utf8');
  const block = src.match(/const cooking = \[([\s\S]*?)\];/);
  if (!block) throw new Error('Could not parse cooking seeds from discover-creator-prospects.mjs');
  const inputs = [];
  for (const m of block[1].matchAll(/input:\s*'([^']+)'|input:\s*"([^"]+)"/g)) {
    inputs.push(m[1] || m[2]);
  }
  const extraPath = path.join(ROOT, 'scripts/growth/discover-creator-prospects-extra.mjs');
  if (fs.existsSync(extraPath)) {
    const extraSrc = fs.readFileSync(extraPath, 'utf8');
    for (const m of extraSrc.matchAll(/'(@[^']+)'|"(@[^"]+)"/g)) {
      const h = (m[1] || m[2] || '').trim();
      if (h.startsWith('@')) inputs.push(h);
    }
  }
  const seen = new Set();
  const out = [];
  for (const raw of inputs) {
    const key = raw.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

function cookiesFromResponse(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

async function adminLogin() {
  const email = ssmGet(`${SSM_PREFIX}/admin/email`, false);
  const password = ssmGet(`${SSM_PREFIX}/admin/password`, true);
  if (!email || !password) {
    throw new Error(`Missing SSM ${SSM_PREFIX}/admin/email or admin/password — cannot sync to CRM.`);
  }
  const res = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`Admin login failed (${res.status}): ${detail}`);
  }
  const cookie = cookiesFromResponse(res);
  if (!cookie) throw new Error('Admin login succeeded but no session cookie returned.');
  return cookie;
}

async function apiPost(cookie, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function apiGet(cookie, urlPath) {
  const res = await fetch(`${API}${urlPath}`, { headers: { cookie } });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

async function runPool(items, concurrency, fn) {
  const results = [];
  const q = [...items];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (q.length) {
        const item = q.shift();
        results.push(await fn(item));
      }
    })
  );
  return results;
}

const args = parseArgs(process.argv.slice(2));
const seeds = loadCookingSeeds().slice(0, args.limit);
console.log(JSON.stringify({ phase: 'discover', campaign: 'COOK-001', seedCount: seeds.length, dryRun: args.dryRun }));

const probed = [];
for (const input of seeds) {
  try {
    const r = await probeDemo(input);
    probed.push({ input, r });
    const tag = !r.ok ? 'ERR' : r.preview ? 'placeholder' : r.subs;
    console.log('probe', input, '->', tag, r.title || '');
  } catch (e) {
    probed.push({ input, r: { ok: false, error: String(e) } });
    console.log('probe', input, 'THROW', e.message || e);
  }
}

const discovered = probed.filter(({ r }) => r.ok && !r.preview);
const placeholders = probed.filter(({ r }) => r.preview);
const errors = probed.filter(({ r }) => !r.ok && !r.preview);

const inBand = discovered.filter(({ r }) => r.subs >= 1000 && r.subs <= 100000);

if (args.dryRun) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        candidates: probed.length,
        discovered: discovered.length,
        placeholders: placeholders.length,
        errors: errors.length,
        inBand: inBand.length,
        sending: 'disabled'
      },
      null,
      2
    )
  );
  process.exit(0);
}

const cookie = await adminLogin();
const synced = [];
const draftErrors = [];

for (const { input, r } of discovered) {
  const contactMeta = {};
  const inspectBody = {
    channelInput: r.handle || input,
    primaryNiche: 'cooking',
    campaign: 'COOK-001',
    language: /[а-яА-ЯіїєґІЇЄҐ]/.test(r.title || '') ? 'ru' : 'en',
    officialWebsite: null,
    publicBusinessEmail: null,
    contactSourceUrl: contactMeta.contact || null,
    contactType: contactMeta.contact ? 'website' : 'none',
    notes: `auto-discovery ${new Date().toISOString().slice(0, 10)}`
  };
  const ins = await apiPost(cookie, '/api/admin/crm/acquisition/inspect', inspectBody);
  if (!ins.ok) {
    console.log('inspect FAIL', input, ins.status, ins.json?.error || ins.json?.raw);
    continue;
  }
  const prospectId = ins.json?.public?.prospectId || ins.json?.prospectId;
  synced.push({
    input,
    prospectId,
    subs: r.subs,
    score: ins.json?.public?.priorityScore ?? ins.json?.priorityScore
  });
  console.log('inspect OK', prospectId, r.title, r.subs);

  if (args.draft && prospectId) {
    const dr = await apiPost(cookie, `/api/admin/crm/acquisition/prospects/${encodeURIComponent(prospectId)}/draft`, {});
    if (!dr.ok) draftErrors.push({ prospectId, status: dr.status });
    else console.log('draft OK', prospectId);
  }
}

const summary = await apiGet(cookie, '/api/admin/crm/acquisition/summary');
console.log(
  JSON.stringify(
    {
      synced: synced.length,
      discoveredProbed: discovered.length,
      inBand: inBand.length,
      placeholders: placeholders.length,
      probeErrors: errors.length,
      draftErrors: draftErrors.length,
      crm: summary.ok ? summary.json : { error: summary.status },
      sending: 'disabled'
    },
    null,
    2
  )
);
