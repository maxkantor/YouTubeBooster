#!/usr/bin/env node
/**
 * Collect 7d + 30d funnel/revenue snapshot for growth experiments.
 * Queries required funnel events explicitly (never infer zero from top-N absence).
 * Never prints secret values. Missing sources are reported, not invented.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_FUNNEL_EVENTS, sumEventsByName } from './lib/canonical-metrics.mjs';
import { summarizeStripeSessions } from './lib/stripe-metrics.mjs';
import { loadStripeAllowlist } from './lib/stripe-allowlist.mjs';
import { daysBeforeYmd, etDateParts, ga4DataThroughYmd, inclusiveWindowStart } from './lib/time.mjs';
import { loadSsmSecretsIntoEnv } from './load-ssm-secrets-into-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ssmLoad = loadSsmSecretsIntoEnv();
const outDir = path.join(__dirname, '../../docs/growth/snapshots');
const now = new Date();
const stamp = etDateParts(now).ymd;
const dataThrough = ga4DataThroughYmd(stamp);

const windows = [
  { label: '7d', start: inclusiveWindowStart(dataThrough, 7), end: dataThrough },
  { label: '30d', start: inclusiveWindowStart(dataThrough, 30), end: dataThrough }
];

const report = {
  generatedAt: now.toISOString(),
  timezone: 'America/New_York',
  reportDateEt: stamp,
  ga4DataThrough: dataThrough,
  ssm: ssmLoad,
  sources: { ga4: 'missing', stripe: 'missing' },
  windows: {},
  notes: [],
  metricDefinitions: {
    audit_starts: 'GA4 event audit_started (raw event count)',
    audit_completions: 'GA4 event audit_completed (raw event count)',
    sessions: 'GA4 event session_start',
    successful_live_payments:
      'YouTubeBooster-attributed verified live Checkout Sessions only (never account-wide Stripe). Baseline 0 until reconciliationComplete.',
    unique_paying_customers:
      'Unique external customers among verified YouTubeBooster-attributed payments (baseline 0 until reconciliation).',
    unattributed_stripe_payments: 'Live paid sessions without conclusive YouTubeBooster attribution',
    experiment_attributed_paid: 'Unknown unless checkout metadata/UTM attribution exists'
  },
  stripeAllowlist: null
};

async function getGa4Token(credentialsJson) {
  const creds = JSON.parse(credentialsJson);
  const { GoogleAuth } = await import('google-auth-library').catch(() => ({ GoogleAuth: null }));
  if (!GoogleAuth) {
    report.notes.push(
      'google-auth-library not installed; run: npm i google-auth-library --prefix scripts/growth'
    );
    return null;
  }
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly']
  });
  const client = await auth.getClient();
  return client.getAccessToken();
}

async function runGa4Report(propertyId, token, body) {
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

/** All events with channel group (diagnostic / top-events display). */
async function fetchGa4AllEvents(propertyId, token, startDate, endDate) {
  return runGa4Report(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }, { name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    limit: 10000
  });
}

/**
 * Explicit funnel event counts — dimensionFilter so required events are always present or zero.
 */
async function fetchGa4ExplicitFunnel(propertyId, token, startDate, endDate) {
  return runGa4Report(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: [...REQUIRED_FUNNEL_EVENTS] }
      }
    },
    limit: 100
  });
}

/** Landing page sessions for EXP isolation (pagePath + session_start via sessions metric). */
async function fetchGa4LandingSessions(propertyId, token, startDate, endDate) {
  return runGa4Report(propertyId, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/youtube-channel-analyzer', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/compare/', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/free-youtube-channel-audit', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/vidiq-alternative', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/why-your-channel', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/best-youtube-audit', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/youtube-seo', caseSensitive: false }
            }
          },
          {
            filter: {
              fieldName: 'pagePath',
              stringFilter: { matchType: 'CONTAINS', value: '/low-ctr', caseSensitive: false }
            }
          }
        ]
      }
    },
    limit: 1000
  });
}

function summarizeLanding(ga4Landing) {
  let exp003 = 0;
  let exp002 = 0;
  for (const row of ga4Landing?.rows ?? []) {
    const p = row.dimensionValues?.[0]?.value ?? '';
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    if (!Number.isFinite(sessions)) continue;
    if (p.includes('/youtube-channel-analyzer')) exp003 += sessions;
    else exp002 += sessions;
  }
  return {
    exp002Sessions: exp002,
    exp003Sessions: exp003,
    note: 'EXP-002 excludes analyzer URL; portfolio totals must not sum these with sitewide sessions for double-count.'
  };
}

/**
 * Merge explicit funnel rows into a full map with zeros for missing required events.
 * @param {object|null} explicitReport
 */
export function explicitEventMap(explicitReport) {
  /** @type {Record<string, number>} */
  const map = {};
  for (const name of REQUIRED_FUNNEL_EVENTS) map[name] = 0;
  for (const row of explicitReport?.rows ?? []) {
    const ev = row.dimensionValues?.[0]?.value;
    const count = Number(row.metricValues?.[0]?.value ?? 0);
    if (ev && Number.isFinite(count)) map[ev] = count;
  }
  return map;
}

async function fetchStripe(key, startUnix) {
  const params = new URLSearchParams({
    'created[gte]': String(startUnix),
    limit: '100',
    status: 'complete',
    'expand[]': 'data.line_items'
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

const stripeAllowlist = loadStripeAllowlist();
report.stripeAllowlist = {
  appKey: stripeAllowlist.appKey,
  reconciliationComplete: stripeAllowlist.reconciliationComplete,
  productIdCount: stripeAllowlist.productIds.length,
  priceIdCount: stripeAllowlist.priceIds.length,
  paymentLinkIdCount: stripeAllowlist.paymentLinkIds.length,
  baselines: stripeAllowlist.verifiedBaselines
};
if (!stripeAllowlist.reconciliationComplete) {
  report.notes.push(
    'Stripe reconciliation incomplete: verified YouTubeBooster payments/customers/revenue forced to documented baseline (0). Account-wide Stripe totals are diagnostic only.'
  );
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

let token = null;
if (report.sources.ga4 === 'configured') {
  try {
    token = await getGa4Token(ga4Creds);
  } catch (e) {
    report.notes.push(`GA4 auth failed: ${e instanceof Error ? e.message : e}`);
  }
}

for (const w of windows) {
  const entry = {
    start: w.start,
    end: w.end,
    ga4: null,
    ga4Explicit: null,
    ga4ExplicitEvents: null,
    ga4Landing: null,
    landing: null,
    stripe: null,
    eventsTruncated: false
  };

  if (token?.token) {
    try {
      entry.ga4 = await fetchGa4AllEvents(ga4Id, token, w.start, w.end);
      entry.ga4Explicit = await fetchGa4ExplicitFunnel(ga4Id, token, w.start, w.end);
      entry.ga4ExplicitEvents = explicitEventMap(entry.ga4Explicit);
      // Prefer explicit map; also keep full sum for diagnostics
      entry.ga4AllEventsSum = sumEventsByName(entry.ga4);
      entry.ga4Landing = await fetchGa4LandingSessions(ga4Id, token, w.start, w.end);
      entry.landing = summarizeLanding(entry.ga4Landing);
    } catch (e) {
      report.notes.push(`GA4 ${w.label} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (report.sources.stripe === 'configured') {
    try {
      const startUnix = Math.floor(new Date(w.start + 'T00:00:00Z').getTime() / 1000);
      const endUnix = Math.floor(new Date(w.end + 'T23:59:59Z').getTime() / 1000);
      const raw = await fetchStripe(stripeKey, startUnix);
      entry.stripe = summarizeStripeSessions(raw, { endUnix, allowlist: stripeAllowlist });
    } catch (e) {
      report.notes.push(`Stripe ${w.label} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  report.windows[w.label] = entry;
}

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `funnel-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      wrote: outPath,
      sources: report.sources,
      notes: report.notes,
      explicit7d: report.windows['7d']?.ga4ExplicitEvents ?? null,
      explicit30d: report.windows['30d']?.ga4ExplicitEvents ?? null
    },
    null,
    2
  )
);
