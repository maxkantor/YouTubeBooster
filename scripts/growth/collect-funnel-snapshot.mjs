#!/usr/bin/env node
/**
 * Collect 7d + 30d funnel/revenue snapshot for growth experiments.
 * Never prints secret values. Missing sources are reported, not invented.
 *
 * Env (or load from SSM first via load-ssm-secrets-into-env.mjs):
 *   GA4_PROPERTY_ID
 *   GOOGLE_ANALYTICS_CREDENTIALS_JSON  (full service-account JSON string)
 *   STRIPE_RESTRICTED_READ_KEY         (rk_… read-only restricted key)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSsmSecretsIntoEnv } from './load-ssm-secrets-into-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same-process SSM → env (child spawn cannot mutate parent env)
const ssmLoad = loadSsmSecretsIntoEnv();
const outDir = path.join(__dirname, '../../docs/growth/snapshots');
const now = new Date();
const stamp = now.toISOString().slice(0, 10);

function daysAgo(n) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const windows = [
  { label: '7d', start: daysAgo(7), end: stamp },
  { label: '30d', start: daysAgo(30), end: stamp }
];

const report = {
  generatedAt: now.toISOString(),
  ssm: ssmLoad,
  sources: { ga4: 'missing', stripe: 'missing' },
  windows: {},
  notes: []
};

async function fetchGa4(propertyId, credentialsJson, startDate, endDate) {
  const creds = JSON.parse(credentialsJson);
  // Lazy import — optional dependency; use google-auth + fetch to Data API
  const { GoogleAuth } = await import('google-auth-library').catch(() => ({ GoogleAuth: null }));
  if (!GoogleAuth) {
    report.notes.push('google-auth-library not installed; run: npm i google-auth-library --prefix scripts/growth');
    return null;
  }
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }]
  };
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    report.notes.push(`GA4 error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

async function fetchStripe(key, startUnix) {
  const params = new URLSearchParams({
    'created[gte]': String(startUnix),
    limit: '100',
    status: 'complete'
  });
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?${params}`, {
    headers: { Authorization: `Bearer ${key}` }
  });
  if (!res.ok) {
    report.notes.push(`Stripe error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

function summarizeStripe(sessions) {
  const live = (sessions?.data ?? []).filter((s) => s.livemode && s.payment_status === 'paid');
  const test = (sessions?.data ?? []).filter((s) => !s.livemode && s.payment_status === 'paid');
  const revenueLive = live.reduce((sum, s) => sum + (s.amount_total || 0), 0) / 100;
  const revenueTest = test.reduce((sum, s) => sum + (s.amount_total || 0), 0) / 100;
  return {
    livePaidSessions: live.length,
    testPaidSessions: test.length,
    revenueLiveUsd: revenueLive,
    revenueTestUsd: revenueTest
  };
}

const ga4Id = process.env.GA4_PROPERTY_ID;
const ga4Creds = process.env.GOOGLE_ANALYTICS_CREDENTIALS_JSON;
const stripeKey = process.env.STRIPE_RESTRICTED_READ_KEY;

if (ga4Id && ga4Creds) {
  report.sources.ga4 = 'configured';
} else {
  report.notes.push('GA4 secrets missing (GA4_PROPERTY_ID and/or GOOGLE_ANALYTICS_CREDENTIALS_JSON).');
}

if (stripeKey) {
  report.sources.stripe = 'configured';
} else {
  report.notes.push('STRIPE_RESTRICTED_READ_KEY missing — use read-only restricted key only.');
}

for (const w of windows) {
  const entry = { start: w.start, end: w.end, ga4: null, stripe: null };
  if (report.sources.ga4 === 'configured') {
    try {
      entry.ga4 = await fetchGa4(ga4Id, ga4Creds, w.start, w.end);
    } catch (e) {
      report.notes.push(`GA4 ${w.label} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (report.sources.stripe === 'configured') {
    try {
      const startUnix = Math.floor(new Date(w.start + 'T00:00:00Z').getTime() / 1000);
      const raw = await fetchStripe(stripeKey, startUnix);
      entry.stripe = summarizeStripe(raw);
    } catch (e) {
      report.notes.push(`Stripe ${w.label} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  report.windows[w.label] = entry;
}

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `funnel-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ wrote: outPath, sources: report.sources, notes: report.notes }, null, 2));
