/**
 * Canonical YouTubeBooster growth metrics + GA4 event aliases.
 *
 * Rule: never infer a required funnel metric as 0 from absence in a truncated
 * "top events" list. Query / aggregate explicitly, or label Unknown.
 */

/** @typedef {'events'|'sessions'|'audits'|'payments'|'customers'|'users'|'usd'|'rate'|'unknown'} MetricUnit */

export const FUNNEL_EVENT_ALIASES = Object.freeze({
  sessions: Object.freeze(['session_start']),
  audit_starts: Object.freeze(['audit_started']),
  audit_completions: Object.freeze(['audit_completed']),
  pricing_viewers: Object.freeze(['pricing_viewed']),
  checkout_starts: Object.freeze(['checkout_started']),
  // Frontend-only purchase signal — never treat as Stripe truth
  frontend_purchase_proxy: Object.freeze(['purchase_completed']),
  demo_opened: Object.freeze(['demo_opened']),
  page_views: Object.freeze(['page_view']),
  first_visits: Object.freeze(['first_visit'])
});

/** Events that must be queried explicitly for scoreboards. */
export const REQUIRED_FUNNEL_EVENTS = Object.freeze([
  'session_start',
  'audit_started',
  'audit_completed',
  'pricing_viewed',
  'checkout_started',
  'demo_opened',
  'page_view',
  'first_visit'
]);

export const EXP_LANDING_PATHS = Object.freeze({
  'EXP-002': Object.freeze({
    // EXP-002 treatment: SEO/growth/compare pages with on-page form (excludes EXP-003 URL)
    description: 'SEO growth + compare pages with SeoAuditEntryForm',
    // Paths are matched as prefix of pagePath; homepage excluded (not EXP-002 treatment)
    pathIncludes: Object.freeze([
      '/why-your-channel',
      '/free-youtube-channel-audit',
      '/best-youtube-audit',
      '/youtube-seo',
      '/low-ctr',
      '/vidiq-alternative',
      '/tubebuddy',
      '/compare/'
    ]),
    excludeExact: Object.freeze(['/youtube-channel-analyzer'])
  }),
  'EXP-003': Object.freeze({
    description: 'Dedicated /youtube-channel-analyzer landing',
    pathIncludes: Object.freeze(['/youtube-channel-analyzer']),
    excludeExact: Object.freeze([])
  })
});

/**
 * Sum eventCount by eventName from a GA4 runReport response.
 * Safe when dimensions include extras (e.g. channel group) — aggregates them.
 * @param {object|null|undefined} ga4
 * @returns {Record<string, number>}
 */
export function sumEventsByName(ga4) {
  /** @type {Record<string, number>} */
  const byEvent = {};
  for (const row of ga4?.rows ?? []) {
    const ev = row.dimensionValues?.[0]?.value ?? 'unknown';
    const count = Number(row.metricValues?.[0]?.value ?? 0);
    if (!Number.isFinite(count)) continue;
    byEvent[ev] = (byEvent[ev] || 0) + count;
  }
  return byEvent;
}

/**
 * Top-N helper for display only — NEVER use as source for required funnel metrics.
 * @param {Record<string, number>} byEvent
 * @param {number} [n]
 */
export function topEventsForDisplay(byEvent, n = 10) {
  return Object.entries(byEvent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/**
 * Read a metric from an explicit event map.
 * @param {Record<string, number>|null|undefined} byEvent full map (not truncated)
 * @param {string[]} aliases
 * @param {{ truncated?: boolean, knownKeys?: string[] }} [opts]
 * @returns {{ value: number|null, unit: MetricUnit, label: string, source: string }}
 */
export function metricFromAliases(byEvent, aliases, opts = {}) {
  const primary = aliases[0] ?? 'unknown';
  if (!byEvent) {
    return { value: null, unit: 'unknown', label: primary, source: 'missing_ga4' };
  }
  if (opts.truncated) {
    // Truncated maps must not invent zero for missing keys
    const present = aliases.some((a) => Object.prototype.hasOwnProperty.call(byEvent, a));
    if (!present) {
      return { value: null, unit: 'unknown', label: primary, source: 'absent_from_truncated_top_events' };
    }
  }
  // Do not sum overlapping aliases for the same action — use first present alias only
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(byEvent, alias)) {
      return {
        value: byEvent[alias],
        unit: 'events',
        label: primary,
        source: `ga4:${alias}`
      };
    }
  }
  // Full map queried: absence means zero events in window
  if (opts.truncated === false || opts.knownKeys?.includes(primary)) {
    return { value: 0, unit: 'events', label: primary, source: `ga4:${primary}:explicit_zero` };
  }
  // Ambiguous map — unknown
  return { value: null, unit: 'unknown', label: primary, source: 'not_in_event_map' };
}

/**
 * Build canonical window metrics from explicit GA4 event map + Stripe summary.
 * @param {{
 *   byEvent: Record<string, number>|null,
 *   explicitQueried?: boolean,
 *   stripe?: object|null,
 *   landing?: { exp002Sessions?: number|null, exp003Sessions?: number|null }
 * }} input
 */
export function buildCanonicalWindowMetrics(input) {
  const byEvent = input.byEvent;
  const explicit = input.explicitQueried !== false && byEvent != null;
  const opts = { truncated: !explicit, knownKeys: REQUIRED_FUNNEL_EVENTS };

  const sessions = metricFromAliases(byEvent, FUNNEL_EVENT_ALIASES.sessions, opts);
  const auditStarts = metricFromAliases(byEvent, FUNNEL_EVENT_ALIASES.audit_starts, opts);
  const auditCompletions = metricFromAliases(byEvent, FUNNEL_EVENT_ALIASES.audit_completions, opts);
  const pricing = metricFromAliases(byEvent, FUNNEL_EVENT_ALIASES.pricing_viewers, opts);
  const checkout = metricFromAliases(byEvent, FUNNEL_EVENT_ALIASES.checkout_starts, opts);

  const stripe = input.stripe || null;
  const payments =
    stripe && typeof stripe.successfulLivePayments === 'number'
      ? stripe.successfulLivePayments
      : stripe && typeof stripe.livePaidSessions === 'number'
        ? stripe.livePaidSessions
        : null;
  const uniqueCustomers =
    stripe && typeof stripe.uniquePayingCustomers === 'number' ? stripe.uniquePayingCustomers : null;
  const netRevenue =
    stripe && typeof stripe.netLiveRevenueUsd === 'number'
      ? stripe.netLiveRevenueUsd
      : stripe && typeof stripe.revenueLiveUsd === 'number'
        ? stripe.revenueLiveUsd
        : null;
  const entitled =
    stripe && typeof stripe.entitledPaidUsers === 'number' ? stripe.entitledPaidUsers : null;

  const qualifiedLanding =
    input.landing?.exp002Sessions != null || input.landing?.exp003Sessions != null
      ? (Number(input.landing.exp002Sessions) || 0) + (Number(input.landing.exp003Sessions) || 0)
      : null;

  return {
    sessions: { ...sessions, unit: 'sessions' },
    qualified_landing_sessions: {
      value: qualifiedLanding,
      unit: 'sessions',
      label: 'qualified_landing_sessions',
      source: qualifiedLanding == null ? 'unavailable' : 'ga4:pagePath'
    },
    audit_starts: {
      ...auditStarts,
      unit: 'events',
      note: 'Raw GA4 event counts (not unique audits) until audit_attempt_id is queryable.'
    },
    audit_completions: {
      ...auditCompletions,
      unit: 'events',
      note: 'Raw GA4 event counts (not unique audits) until audit_attempt_id is queryable.'
    },
    pricing_viewers: { ...pricing, unit: 'events' },
    checkout_starts: { ...checkout, unit: 'events' },
    successful_live_payments: {
      value: payments,
      unit: 'payments',
      label: 'successful_live_payments',
      source: payments == null ? 'missing_stripe' : 'stripe:checkout.session'
    },
    unique_paying_customers: {
      value: uniqueCustomers,
      unit: 'customers',
      label: 'unique_paying_customers',
      source: uniqueCustomers == null ? 'missing_stripe' : 'stripe:customer_dedupe'
    },
    entitled_paid_users: {
      value: entitled,
      unit: 'users',
      label: 'entitled_paid_users',
      source: entitled == null ? 'admin_crm_unavailable' : 'admin_crm'
    },
    live_revenue: {
      value: netRevenue,
      unit: 'usd',
      label: 'live_revenue',
      source:
        stripe?.refundsApplied === false
          ? 'stripe:gross_paid_sessions_refunds_unknown'
          : netRevenue == null
            ? 'missing_stripe'
            : 'stripe:net'
    },
    experiment_attributed_paid: {
      value: null,
      unit: 'payments',
      label: 'experiment_attributed_paid',
      source: 'unknown_attribution'
    }
  };
}

/**
 * Format a metric cell for scoreboard (never silently coerce Unknown to 0).
 * @param {{ value: number|null|undefined }} m
 */
export function formatMetricValue(m) {
  if (m == null || m.value == null || Number.isNaN(m.value)) return 'Unknown';
  if (m.unit === 'usd') return `$${Number(m.value).toFixed(2)}`;
  return String(m.value);
}

/**
 * Cohort rate only when both sides are known numbers and denominator > 0.
 * @returns {{ rate: number|null, label: string, directional: boolean }}
 */
export function cohortRate(numerator, denominator, { minSample = 30 } = {}) {
  if (numerator == null || denominator == null) {
    return { rate: null, label: 'Unknown', directional: true };
  }
  if (denominator <= 0) {
    return { rate: null, label: 'n/a', directional: true };
  }
  const rate = numerator / denominator;
  return {
    rate,
    label: `${(rate * 100).toFixed(1)}%`,
    directional: denominator < minSample
  };
}

/**
 * Reconciliation checks before emailing.
 * @param {{ '7d': object, '30d': object }} windows canonical metrics per window
 * @returns {{ ok: boolean, warnings: string[] }}
 */
export function reconcileCanonicalWindows(windows) {
  const warnings = [];
  const w7 = windows['7d'];
  const w30 = windows['30d'];
  if (!w7 || !w30) {
    warnings.push('Missing 7d or 30d canonical window.');
    return { ok: false, warnings };
  }

  const pairs = [
    ['sessions', 'sessions'],
    ['audit_starts', 'audit_starts'],
    ['audit_completions', 'audit_completions'],
    ['successful_live_payments', 'successful_live_payments'],
    ['unique_paying_customers', 'unique_paying_customers']
  ];

  for (const [key] of pairs) {
    const a = w7[key]?.value;
    const b = w30[key]?.value;
    if (typeof a === 'number' && a < 0) warnings.push(`7d ${key} is negative.`);
    if (typeof b === 'number' && b < 0) warnings.push(`30d ${key} is negative.`);
    if (typeof a === 'number' && typeof b === 'number' && a > b) {
      warnings.push(`7d ${key} (${a}) exceeds 30d (${b}).`);
    }
  }

  for (const label of ['7d', '30d']) {
    const w = windows[label];
    const pay = w.successful_live_payments?.value;
    const cust = w.unique_paying_customers?.value;
    const entitled = w.entitled_paid_users?.value;
    const attributed = w.experiment_attributed_paid?.value;
    if (typeof pay === 'number' && typeof cust === 'number' && cust > pay) {
      warnings.push(`${label}: unique paying customers (${cust}) exceed payments (${pay}).`);
    }
    if (typeof cust === 'number' && typeof entitled === 'number' && entitled > cust) {
      warnings.push(`${label}: entitled paid users (${entitled}) exceed unique customers (${cust}).`);
    }
    if (typeof pay === 'number' && typeof attributed === 'number' && attributed > pay) {
      warnings.push(`${label}: attributed payments exceed total payments.`);
    }
  }

  return { ok: warnings.length === 0, warnings };
}

/**
 * Apply Unknown to metrics implicated by warnings (conservative).
 * @param {object} metrics
 * @param {string[]} warnings
 */
export function blankMetricsOnWarning(metrics, warnings) {
  if (!warnings.length) return metrics;
  const out = { ...metrics };
  for (const w of warnings) {
    const m = w.match(/\b(sessions|audit_starts|audit_completions|successful_live_payments|unique_paying_customers|entitled_paid_users)\b/);
    if (m && out[m[1]]) {
      out[m[1]] = { ...out[m[1]], value: null, source: 'data_quality_warning' };
    }
  }
  return out;
}
