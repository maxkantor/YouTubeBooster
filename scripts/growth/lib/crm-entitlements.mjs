/**
 * Admin CRM entitlement/activation from DynamoDB (ybai-purchases + ybai-users).
 * Never includes emails or other PII in returned objects.
 */
import { spawnSync } from 'node:child_process';

const REGION = process.env.AWS_REGION || 'us-east-1';
const PAYMENTS_TABLE = process.env.YB_PAYMENTS_TABLE || 'ybai-purchases';
const USERS_TABLE = process.env.YB_USERS_TABLE || 'ybai-users';

function awsJson(args) {
  const r = spawnSync('aws', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || 'aws failed').slice(0, 400) };
  }
  try {
    return { ok: true, data: JSON.parse(r.stdout || '{}') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function s(item, key) {
  return item?.[key]?.S || '';
}

function bool(item, key) {
  if (typeof item?.[key]?.BOOL === 'boolean') return item[key].BOOL;
  return false;
}

function parseIso(v) {
  if (!v) return null;
  const d = Date.parse(v);
  return Number.isFinite(d) ? d : null;
}

function inWindow(ms, startYmd, endYmd) {
  if (ms == null) return false;
  const start = Date.parse(`${startYmd}T00:00:00.000Z`);
  const end = Date.parse(`${endYmd}T23:59:59.999Z`);
  return ms >= start && ms <= end;
}

function scanAll(table, extraArgs) {
  const items = [];
  let startKey = null;
  for (let i = 0; i < 20; i++) {
    const args = [
      'dynamodb',
      'scan',
      '--table-name',
      table,
      '--region',
      REGION,
      '--output',
      'json',
      ...extraArgs
    ];
    if (startKey) {
      args.push('--exclusive-start-key', JSON.stringify(startKey));
    }
    const res = awsJson(args);
    if (!res.ok) return res;
    items.push(...(res.data.Items || []));
    startKey = res.data.LastEvaluatedKey || null;
    if (!startKey) break;
  }
  return { ok: true, items };
}

export function summarizeCrmEntitlements({ payments, entitlements, startYmd, endYmd, nowMs = Date.now() }) {
  const livePaid = [];
  for (const p of payments || []) {
    const status = (p.status || '').toLowerCase();
    const mode = (p.mode || '').toLowerCase();
    const amount = Number(p.amount || 0);
    if (status !== 'completed' || mode !== 'live' || !(amount > 0)) continue;
    const paidMs = parseIso(p.paidAt) || parseIso(p.createdAt);
    if (!inWindow(paidMs, startYmd, endYmd)) continue;
    livePaid.push({
      paymentId: p.paymentId || '',
      userId: p.userId || '',
      paidMs,
      entitlementGranted: p.entitlementGranted === true
    });
  }

  const activeEnts = [];
  for (const e of entitlements || []) {
    const status = (e.status || '').toLowerCase();
    const source = (e.source || '').toLowerCase();
    if (status !== 'active') continue;
    if (source === 'test_payment' || source === 'test') continue;
    const grantedMs = parseIso(e.grantedAt);
    if (e.expiresAt) {
      const exp = parseIso(e.expiresAt);
      if (exp != null && exp < nowMs) continue;
    }
    activeEnts.push({
      userId: e.userId || '',
      paymentId: e.paymentId || '',
      grantedMs,
      source: e.source || ''
    });
  }

  const entitledUserIds = new Set(activeEnts.map((e) => e.userId).filter(Boolean));

  let matched = 0;
  let within24h = 0;
  let missingEntitlementTs = 0;
  for (const p of livePaid) {
    const ent =
      activeEnts.find((e) => p.paymentId && e.paymentId && e.paymentId === p.paymentId) ||
      activeEnts.find((e) => p.userId && e.userId && e.userId === p.userId);
    if (!ent) continue;
    matched += 1;
    if (p.paidMs == null || ent.grantedMs == null) {
      missingEntitlementTs += 1;
      continue;
    }
    const delta = ent.grantedMs - p.paidMs;
    if (delta >= 0 && delta <= 24 * 60 * 60 * 1000) within24h += 1;
  }

  const activationWithin24h = livePaid.length === 0 ? 0 : missingEntitlementTs === livePaid.length ? null : within24h;

  return {
    livePaidPayments: livePaid.length,
    entitledPaidUsers: entitledUserIds.size,
    paymentEntitlementMatches: matched,
    paidToEntitledWithin24h: activationWithin24h,
    paymentsMissingEntitlementTimestamp: missingEntitlementTs
  };
}

export function loadCrmEntitlementTables() {
  const pay = scanAll(PAYMENTS_TABLE, [
    '--filter-expression',
    'begins_with(pk, :p) AND sk = :sk',
    '--expression-attribute-values',
    JSON.stringify({ ':p': { S: 'PAYMENT#' }, ':sk': { S: 'DETAILS' } }),
    '--projection-expression',
    'pk, paymentId, userId, #st, #md, amount, paidAt, createdAt, entitlementGranted',
    '--expression-attribute-names',
    JSON.stringify({ '#st': 'status', '#md': 'mode' })
  ]);
  if (!pay.ok) return { ok: false, error: pay.error, source: 'dynamodb_scan_failed' };

  const ents = scanAll(USERS_TABLE, [
    '--filter-expression',
    'begins_with(sk, :e)',
    '--expression-attribute-values',
    JSON.stringify({ ':e': { S: 'ENTITLEMENT#' } }),
    '--projection-expression',
    'pk, sk, #st, #src, grantedAt, expiresAt, paymentId',
    '--expression-attribute-names',
    JSON.stringify({ '#st': 'status', '#src': 'source' })
  ]);
  if (!ents.ok) return { ok: false, error: ents.error, source: 'dynamodb_scan_failed' };

  const payments = (pay.items || []).map((item) => ({
    paymentId: s(item, 'paymentId') || s(item, 'pk').replace(/^PAYMENT#/, ''),
    userId: s(item, 'userId'),
    status: s(item, 'status'),
    mode: s(item, 'mode'),
    amount: s(item, 'amount'),
    paidAt: s(item, 'paidAt'),
    createdAt: s(item, 'createdAt'),
    entitlementGranted: bool(item, 'entitlementGranted')
  }));

  const entitlements = (ents.items || []).map((item) => ({
    userId: s(item, 'pk').replace(/^USER#/, ''),
    status: s(item, 'status'),
    source: s(item, 'source'),
    grantedAt: s(item, 'grantedAt'),
    expiresAt: s(item, 'expiresAt'),
    paymentId: s(item, 'paymentId')
  }));

  return {
    ok: true,
    source: 'dynamodb:ybai-purchases+ybai-users',
    payments,
    entitlements
  };
}
