/**
 * Executive growth email composer (HTML + plain text).
 * Uses canonical metrics — never scoreboard-from-top-events.
 */
import {
  buildCanonicalWindowMetrics,
  formatMetricValue,
  reconcileCanonicalWindows,
  sumEventsByName,
  topEventsForDisplay
} from './canonical-metrics.mjs';
import {
  EXP_OVERLAP_POLICY,
  classifyExperiment,
  nextFutureEvaluation,
  parseActiveExperiments
} from './experiment-report.mjs';
import {
  etDateParts,
  formatDateRangeEt,
  formatEtDateTime,
  formatLongDateEt,
  formatMonthDayYear,
  ga4DataThroughYmd
} from './time.mjs';

/** Normalize punctuation only. Do not strip Unicode from UTF-8 email bodies. */
function typographicNormalize(s) {
  return String(s ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2026]/g, '...');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Cohort conversion is unavailable until start and completion share an audit_attempt_id in the same window. */
export const COHORT_CONVERSION_UNAVAILABLE =
  'Unavailable until same-cohort audit tracking exists (do not divide raw audit_completed by audit_started).';

export const AUDIT_LANDING_DEFINITION =
  'Audit landing sessions: GA4 sessions on EXP-002 SEO/compare form pages plus EXP-003 /youtube-channel-analyzer (pagePath). Not qualified audits and not unique users.';

function stripeBuckets(attr) {
  if (!attr) {
    return {
      attributedLivePayments: 'Unknown',
      verifiedExternalCustomers: '0',
      verifiedExternalRevenue: '$0.00',
      ownerSelfPayments: 'Unknown',
      unverifiedPayments: 'Unknown'
    };
  }
  return {
    attributedLivePayments: String(attr.attributedCandidatesBeforeBaseline ?? 'Unknown'),
    verifiedExternalCustomers: String(
      attr.verifiedUniquePayingCustomers ??
        attr.baselines?.YouTubeBooster?.verifiedExternalPayingCustomers ??
        0
    ),
    verifiedExternalRevenue: `$${Number(
      attr.verifiedNetLiveRevenueUsd ??
        attr.baselines?.YouTubeBooster?.verifiedNetLiveRevenueUsd ??
        0
    ).toFixed(2)}`,
    ownerSelfPayments: String(attr.excludedOwnerOrSmokePayments ?? 'Unknown'),
    unverifiedPayments: String(attr.unattributedLivePayments ?? 'Unknown')
  };
}

/**
 * Display windows must not include the incomplete report day.
 * Prefer snapshot.ga4DataThrough; otherwise clip window.end when it equals reportDateEt.
 */
export function resolveGa4Through(snapshot, windows, reportYmd) {
  const explicit = snapshot?.ga4DataThrough;
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return explicit;
  }
  const end = windows['30d']?.end || windows['7d']?.end || snapshot?.reportDateEt || null;
  if (!end) return null;
  if (reportYmd && end >= reportYmd) return ga4DataThroughYmd(reportYmd);
  return end;
}

function clipRange(start, end, through) {
  if (!start || !end) return { start, end, rangeLabel: 'missing' };
  const displayEnd = through && end > through ? through : end;
  return { start, end: displayEnd, rangeLabel: formatDateRangeEt(start, displayEnd) };
}

function cell(m) {
  return formatMetricValue(m);
}

function experimentCopy(ex, snapshot) {
  if (ex.id === 'EXP-002') {
    return {
      stage: 'Acquisition / SEO (main)',
      eligible: 'SEO + compare form pages (excludes analyzer URL)',
      primary: 'Page-isolated audit_started events: Unknown until path join verified',
      sample: 'low'
    };
  }
  if (ex.id === 'EXP-003') {
    return {
      stage: 'Acquisition / SEO (nested URL)',
      eligible: '/youtube-channel-analyzer only',
      primary: 'Analyzer sessions + audit_started events: Unknown until path join verified',
      sample: 'low'
    };
  }
  if (ex.id === 'EXP-001') {
    const act = snapshot?.windows?.['7d']?.crm?.paidToEntitledWithin24h;
    const primary =
      snapshot?.sources?.crm === 'ok'
        ? `Paid-to-entitled within 24h: ${act == null ? 'Unknown (missing entitlement timestamps)' : `${act} users (Admin CRM Dynamo)`}`
        : 'Paid-to-entitled within 24h: Unavailable - Admin CRM connection required';
    return {
      stage: 'Post-purchase activation',
      eligible: 'Post-checkout guests',
      primary,
      sample: '0 verified payments'
    };
  }
  if (ex.id === 'EXP-004') {
    const collecting = ex.collecting === true;
    return {
      stage: 'Founder outreach',
      eligible: collecting
        ? '/share + /sample-report; approved named-recipient SES (utm_content P04/P05)'
        : '/share and /sample-report (distribution asset; not send approval)',
      primary: collecting
        ? 'Collecting named-recipient outreach (SES-accepted sends; COOK-001 weekday automation remains disabled)'
        : 'Outreach paused pending named-recipient approval',
      sample: collecting ? 'See experiment log for send counts; attributed conversions still 0' : 'n/a'
    };
  }
  return {
    stage: typographicNormalize(ex.funnelStage || 'see log'),
    eligible: 'see log',
    primary: 'see log',
    sample: 'low'
  };
}

function exp004OverlapNote(classified) {
  const collecting = classified.some((e) => e.id === 'EXP-004' && e.collecting);
  return collecting
    ? 'EXP-004 is ACTIVE/COLLECTING on named-recipient outreach. COOK-001 weekday automation remains disabled.'
    : 'EXP-004 is awaiting owner approval and is not collecting outreach data.';
}

function emptyShip() {
  return {
    change: 'none this run',
    experiment: 'n/a',
    url: 'n/a',
    primaryMetric: 'n/a',
    attribution: 'n/a',
    commit: 'n/a',
    amplify: 'n/a',
    verification: 'n/a'
  };
}

export const DEFAULT_BLOCKING_APPROVAL =
  'Approve one exact distribution action: named recipient + exact subject/body (or owned social post, consented list, partner channel, or approved ad budget). Draft packages and deployed pages are not distribution.';

export function emptyDistribution() {
  return {
    executed: false,
    channel: 'none',
    audience: 'none',
    attributedVisits: 'Unknown',
    activations: 'Unknown',
    checkoutStarts: 'Unknown',
    newCustomersThisRun: 0,
    existingCustomers: 0,
    customersObservedInWindow: 0,
    experimentAttributedCustomers: 'Unknown',
    verifiedRevenue: '$0.00',
    requiredOwnerApproval: DEFAULT_BLOCKING_APPROVAL,
    blockingApproval: true,
    exactActionPrepared: 'none'
  };
}

/**
 * @param {object|undefined} input
 * @param {{ stripe30?: object, m7?: object }} [ctx]
 */
export function normalizeDistribution(input, ctx = {}) {
  const d = { ...emptyDistribution(), ...(input || {}) };
  const stripe30 = ctx.stripe30 || {};
  if (input?.verifiedRevenue == null) d.verifiedRevenue = stripe30.verifiedExternalRevenue ?? d.verifiedRevenue;
  if (input?.existingCustomers == null) {
    const n = Number(stripe30.verifiedExternalCustomers);
    d.existingCustomers = Number.isFinite(n) ? n : 0;
  }
  if (input?.checkoutStarts == null && ctx.m7?.checkout_starts) {
    d.checkoutStarts = `${cell(ctx.m7.checkout_starts)} checkout_started events (7d window; not this-run attribution unless UTM)`;
  }
  if (input?.activations == null && ctx.m7?.audit_starts) {
    d.activations = `${cell(ctx.m7.audit_starts)} audit_started events (7d window; not this-run attribution unless UTM)`;
  }
  d.executed = d.executed === true;
  d.newCustomersThisRun = Number(d.newCustomersThisRun) || 0;
  d.customersObservedInWindow = Number(d.customersObservedInWindow) || 0;
  if (d.executed) d.blockingApproval = false;
  else if (input?.blockingApproval === false) d.blockingApproval = false;
  else d.blockingApproval = true;
  return d;
}

/**
 * Consolidate repeating 7d/30d quality notes into a short scan list.
 */
export function consolidateQualityWarnings({ windows, snapshot, crmUnavailable = true }) {
  const items = [];
  const seen = new Set();
  const add = (key, text) => {
    if (seen.has(key)) return;
    seen.add(key);
    items.push(text);
  };

  let completionsExceed = false;
  for (const label of ['7d', '30d']) {
    const m = windows[label]?.metrics;
    const starts = m?.audit_starts?.value;
    const dones = m?.audit_completions?.value;
    if (typeof starts === 'number' && typeof dones === 'number' && dones > starts) {
      completionsExceed = true;
    }
  }
  if (completionsExceed) {
    add(
      'cohort',
      'Audit completions exceed starts; raw events cannot form a same-cohort conversion rate.'
    );
  }

  const attr7 = snapshot?.windows?.['7d']?.stripe?.attribution;
  const attr30 = snapshot?.windows?.['30d']?.stripe?.attribution;
  if (attr7?.reconciliationComplete === false || attr30?.reconciliationComplete === false) {
    add('recon', 'Product-specific Stripe reconciliation is incomplete.');
  }

  const unattr = Number(attr30?.unattributedLivePayments || attr7?.unattributedLivePayments || 0);
  if (unattr > 0) {
    add(
      'unattr',
      `${unattr} unattributed 30-day Stripe payment${unattr === 1 ? '' : 's'} ${unattr === 1 ? 'is' : 'are'} excluded.`
    );
  }

  const other = Number(attr30?.otherAppLivePayments || 0);
  if (other > 0) {
    add('other', `${other} live payment(s) attributed to another application and excluded.`);
  }

  if (crmUnavailable) {
    add('crm', 'Admin CRM activation/entitlement data is unavailable.');
  }

  const recon = reconcileCanonicalWindows({
    '7d': windows['7d']?.metrics,
    '30d': windows['30d']?.metrics
  });
  for (const w of recon.warnings || []) add(`recon:${w}`, w);

  return items;
}

/**
 * Build decision paragraph when agent notes do not supply one.
 * Must name the ship (or none), EXP-001 result when due, and verified customers/revenue.
 */
export function defaultDecisionText({
  classified,
  health,
  shipped,
  ship,
  stripe30,
  nextFuture,
  reportYmd,
  dist
}) {
  const nCollecting = classified.filter((e) => e.collecting).length;
  const nAwaiting = classified.filter((e) => e.decision === 'Awaiting approval').length;
  const dueMissed = classified.filter((e) => e.dueUnevaluated);
  const exp001 = classified.find((e) => e.id === 'EXP-001');
  const d = dist || emptyDistribution();

  const parts = [];

  if (d.blockingApproval) {
    parts.push(`BLOCKING OWNER APPROVAL: ${d.requiredOwnerApproval}`);
    if (d.exactActionPrepared && d.exactActionPrepared !== 'none') {
      parts.push(`Exact action prepared: ${d.exactActionPrepared}`);
    }
  } else if (d.executed) {
    parts.push(
      `Distribution executed via ${d.channel} to ${d.audience}. New customers acquired by this run: ${d.newCustomersThisRun}.`
    );
  } else {
    parts.push(
      'Distribution was not executed. This run is not successful unless a proven funnel blocker was removed.'
    );
  }

  parts.push(
    `New customers this run: ${d.newCustomersThisRun}. Existing customers: ${d.existingCustomers}. Observed in window: ${d.customersObservedInWindow}. Experiment-attributed: ${d.experimentAttributedCustomers}. Verified net revenue: ${d.verifiedRevenue}.`
  );

  if (shipped && ship?.change && ship.change !== 'none this run') {
    const owner = ship.experiment && ship.experiment !== 'n/a' ? ` under ${ship.experiment}` : '';
    parts.push(`Production change (not distribution by itself): ${ship.change}${owner}.`);
  }

  if (dueMissed.length) {
    parts.push(
      `${dueMissed.map((e) => e.id).join(', ')} ${dueMissed.length === 1 ? 'was' : 'were'} due on ${formatMonthDayYear(reportYmd)} and ${dueMissed.length === 1 ? 'was' : 'were'} not evaluated - this violates the run sequence.`
    );
  } else if (exp001 && (exp001.decision === 'Inconclusive' || exp001.evaluationDecision === 'Inconclusive')) {
    const reason =
      exp001.decisionReason ||
      'Admin CRM activation data remains unavailable and verified attributed payments are 0';
    parts.push(
      `EXP-001 was evaluated and marked Inconclusive because ${reason}; its treatment remains unchanged.`
    );
  } else if (exp001 && exp001.decision && exp001.decision !== 'Keep' && exp001.decision !== 'Due - not evaluated') {
    parts.push(`EXP-001 was evaluated as ${exp001.decision}; treatment per experiment log.`);
  }

  const exp004 = classified.find((e) => e.id === 'EXP-004');
  const outreachBit = exp004?.collecting
    ? `${nCollecting} experiment${nCollecting === 1 ? '' : 's'} ${nCollecting === 1 ? 'is' : 'are'} collecting attributable traffic. EXP-004 named-recipient outreach is collecting (COOK-001 weekday automation remains disabled).`
    : nAwaiting > 0
      ? `${nCollecting} experiment${nCollecting === 1 ? '' : 's'} ${nCollecting === 1 ? 'is' : 'are'} collecting attributable traffic, while outreach remains paused pending owner approval.`
      : `${nCollecting} experiment${nCollecting === 1 ? '' : 's'} ${nCollecting === 1 ? 'is' : 'are'} collecting attributable traffic.`;
  parts.push(outreachBit);

  if (health?.ok === false) {
    parts.push('Production health reported a failure - see Production Health.');
  }

  if (nextFuture) {
    parts.push(`The next scheduled evaluation is ${nextFuture.id} on ${nextFuture.evalDateLabel}.`);
  }

  return typographicNormalize(parts.join(' '));
}

export function buildSubject({ prefix, et, dist }) {
  const d = dist || emptyDistribution();
  const newCust = d.newCustomersThisRun ?? 0;
  const lead = d.executed
    ? 'Distribution executed'
    : d.blockingApproval
      ? 'Blocking approval required'
      : 'Distribution not executed';
  return typographicNormalize(
    `${prefix || 'YouTubeBooster Growth'} - ${lead} · ${newCust} new customers this run · ${et.date}`
  );
}

/**
 * @param {object} snapshot
 */
export function buildCanonicalFromSnapshot(snapshot) {
  /** @type {Record<string, object>} */
  const windows = {};

  for (const label of ['7d', '30d']) {
    const w = snapshot?.windows?.[label];
    const explicitMap =
      w?.canonicalEvents ||
      w?.ga4ExplicitEvents ||
      (w?.ga4 ? sumEventsByName(w.ga4) : null);

    const truncated = w?.eventsTruncated === true;
    const byEvent = truncated ? w.topEventsMap || null : explicitMap;

    const metrics = buildCanonicalWindowMetrics({
      byEvent,
      explicitQueried: !truncated && byEvent != null,
      stripe: w?.stripe || null,
      landing: w?.landing || snapshot?.landing?.[label] || null
    });

    windows[label] = {
      start: w?.start,
      end: w?.end,
      metrics,
      topEvents: topEventsForDisplay(explicitMap || {}, 10)
    };
  }

  const warnings = consolidateQualityWarnings({
    windows,
    snapshot,
    crmUnavailable: snapshot?.sources?.crm !== 'ok'
  });
  const recon = reconcileCanonicalWindows({
    '7d': windows['7d']?.metrics,
    '30d': windows['30d']?.metrics
  });

  return { windows, warnings, reconOk: recon.ok };
}

function nextActions({ classified, nextFuture, reportYmd, dist }) {
  const items = [];
  const d = dist || emptyDistribution();
  const dueMissed = classified.filter((e) => e.dueUnevaluated);

  if (d.blockingApproval) {
    items.push(
      `BLOCKING: ${d.requiredOwnerApproval}${d.exactActionPrepared && d.exactActionPrepared !== 'none' ? ` Exact action prepared: ${d.exactActionPrepared}` : ''}`
    );
  } else if (!d.executed) {
    items.push('Execute one allowed external distribution action this run. Deployed pages are not distribution.');
  }

  if (dueMissed.length) {
    items.push(
      `Evaluate ${dueMissed.map((e) => e.id).join(', ')} immediately (due ${formatMonthDayYear(reportYmd)}).`
    );
  }

  items.push(
    'Until the first newly attributed external customer: at most one experiment per funnel stage; prefer qualified distribution over additional CRO.'
  );
  const exp004 = classified.find((e) => e.id === 'EXP-004');
  const exp004Action = exp004?.collecting
    ? 'Keep EXP-002 as the main Acquisition/SEO treatment. Treat EXP-003 as a nested URL. EXP-004 is ACTIVE/COLLECTING on named-recipient outreach; do not enable COOK-001 weekday automation.'
    : 'Keep EXP-002 as the main Acquisition/SEO treatment. Treat EXP-003 as a nested URL. EXP-004 outreach stays awaiting named-recipient approval.';
  items.push(exp004Action);
  items.push('Do not launch another experiment merely to have a ship.');
  items.push('Report new customers acquired by this run separately from customers observed in the date window.');

  if (nextFuture) {
    items.push(`Next scheduled evaluation: ${nextFuture.id} on ${nextFuture.evalDateLabel}.`);
  }

  return items;
}

/**
 * @param {{
 *   snapshot: object,
 *   health: object,
 *   experiments?: object[],
 *   logMd?: string,
 *   notes?: string,
 *   decision?: string,
 *   shipped?: boolean,
 *   ship?: object,
 *   evaluations?: Record<string, { decision?: string, reason?: string }>,
 *   generatedAt?: Date|string,
 *   subjectPrefix?: string
 * }} opts
 */
export function composeGrowthReport(opts) {
  const now = opts.generatedAt ? new Date(opts.generatedAt) : new Date();
  const et = formatEtDateTime(now);
  const reportYmd = et.ymd;
  const experiments =
    opts.experiments || (opts.logMd ? parseActiveExperiments(opts.logMd) : []);
  const classified = experiments.map((ex) =>
    classifyExperiment(ex, { reportYmd, evaluations: opts.evaluations || {} })
  );
  const nextFuture = nextFutureEvaluation(classified, reportYmd);
  const { windows, warnings } = buildCanonicalFromSnapshot(opts.snapshot || {});

  const ga4Through = resolveGa4Through(opts.snapshot, windows, reportYmd);
  const range7 = clipRange(windows['7d']?.start, windows['7d']?.end, ga4Through);
  const range30 = clipRange(windows['30d']?.start, windows['30d']?.end, ga4Through);
  const throughLabel = ga4Through ? formatMonthDayYear(ga4Through) : 'Unknown';

  const stripe30 = stripeBuckets(opts.snapshot?.windows?.['30d']?.stripe?.attribution);
  const ship = { ...emptyShip(), ...(opts.ship || {}) };
  const shipped = !!opts.shipped;
  const dist = normalizeDistribution(opts.distribution, {
    stripe30,
    m7: windows['7d']?.metrics
  });

  const noteText = (opts.notes && opts.notes.trim()) || '';
  const decision =
    (opts.decision && opts.decision.trim()) ||
    defaultDecisionText({
      classified,
      health: opts.health,
      shipped,
      ship,
      stripe30,
      nextFuture,
      reportYmd,
      dist
    });

  const m7 = windows['7d']?.metrics;
  const m30 = windows['30d']?.metrics;
  const subject = buildSubject({
    prefix: opts.subjectPrefix,
    et,
    dist
  });
  const actions = nextActions({ classified, nextFuture, reportYmd, dist });

  // ---- plain text ----
  const t = [];
  t.push('YouTubeBooster AI - Growth report');
  t.push('================================');
  t.push(`Generated: ${et.date} ${et.time} ${et.zone}`);
  t.push(`GA4 data through: ${throughLabel}`);
  t.push(`7d: ${range7.rangeLabel}`);
  t.push(`30d: ${range30.rangeLabel}`);
  t.push('Do not treat the report calendar day as included when GA4 processing is incomplete.');
  t.push(`Site: https://youtubeboosterai.com/`);
  t.push(`Admin: https://youtubeboosterai.com/admin/orders`);
  t.push('');
  t.push('1) DECISION');
  t.push('-----------');
  t.push(decision);
  t.push('');
  if (warnings.length) {
    t.push('2) DATA QUALITY WARNING');
    t.push('-----------------------');
    for (const w of warnings) t.push(`* ${typographicNormalize(w)}`);
    t.push('');
  }
  const scoreN = warnings.length ? 3 : 2;
  t.push(`${scoreN}) SCOREBOARD (raw events unless noted)`);
  t.push('-'.repeat(40));
  t.push(AUDIT_LANDING_DEFINITION);
  t.push(
    `7d (${range7.rangeLabel}): sessions=${cell(m7?.sessions)} | audit_landing_sessions=${cell(m7?.qualified_landing_sessions)} | audit_starts=${cell(m7?.audit_starts)} | audit_completions=${cell(m7?.audit_completions)} | pricing=${cell(m7?.pricing_viewers)} | checkout_starts=${cell(m7?.checkout_starts)} | verified_live_payments=${cell(m7?.successful_live_payments)} | verified_unique_customers=${cell(m7?.unique_paying_customers)} | entitled=${cell(m7?.entitled_paid_users)} | verified_revenue=${cell(m7?.live_revenue)}`
  );
  t.push(
    `30d (${range30.rangeLabel}): sessions=${cell(m30?.sessions)} | audit_landing_sessions=${cell(m30?.qualified_landing_sessions)} | audit_starts=${cell(m30?.audit_starts)} | audit_completions=${cell(m30?.audit_completions)} | pricing=${cell(m30?.pricing_viewers)} | checkout_starts=${cell(m30?.checkout_starts)} | verified_live_payments=${cell(m30?.successful_live_payments)} | verified_unique_customers=${cell(m30?.unique_paying_customers)} | entitled=${cell(m30?.entitled_paid_users)} | verified_revenue=${cell(m30?.live_revenue)}`
  );
  const a30 = opts.snapshot?.windows?.['30d']?.stripe?.attribution;
  if (a30) {
    t.push(
      `Stripe 30d: attributed_live_payments=${stripe30.attributedLivePayments} | verified_external_customers=${stripe30.verifiedExternalCustomers} | verified_external_revenue=${stripe30.verifiedExternalRevenue} | owner_self_or_smoke=${stripe30.ownerSelfPayments} | unverified_unattributed=${stripe30.unverifiedPayments} | other_app=${a30.otherAppLivePayments ?? '?'} | account_wide_live_paid=${a30.accountWideLivePaidSessions ?? '?'} (diagnostic only)`
    );
  }
  t.push(`Audit start-to-completion conversion: ${COHORT_CONVERSION_UNAVAILABLE}`);
  t.push('Do not divide raw audit_completed by audit_started. Other stage rates omitted for the same reason.');
  t.push('Experiment-attributed paid conversions: Unknown');
  t.push(
    'A $9.99 live charge is not verified external revenue unless product attribution AND external-customer checks pass. Current verified external revenue baseline is $0.00.'
  );
  t.push('');

  const expN = scoreN + 1;
  t.push(`${expN}) EXPERIMENT RESULTS`);
  t.push('--------------------');
  if (!classified.length) t.push('(none marked active)');
  else {
    for (const ex of classified) {
      const copy = experimentCopy(ex, opts.snapshot);
      t.push(`${ex.id || ex.idLine}`);
      t.push(`  Stage: ${copy.stage}`);
      t.push(`  Status: ${typographicNormalize(ex.status)}`);
      t.push(`  Decision: ${ex.decision}`);
      t.push(`  Eligible traffic: ${copy.eligible}`);
      t.push(`  Primary result: ${copy.primary}`);
      t.push(`  Sample: ${copy.sample}`);
      t.push(`  Evaluation date: ${ex.evalDateLabel || ex.evalDate || 'n/a'}`);
      t.push('');
    }
    t.push(`Overlap: ${EXP_OVERLAP_POLICY.summary}`);
    t.push(
      `At current volume, EXP-002 is the main Acquisition/SEO treatment; EXP-003 is a nested URL; ${exp004OverlapNote(classified)}`
    );
  }
  t.push('');

  const acqN = expN + 1;
  t.push(`${acqN}) ACQUISITION ACTION`);
  t.push('--------------------');
  t.push(`Distribution executed: ${dist.executed ? 'yes' : 'no'}`);
  t.push(`Audience/channel: ${dist.audience} / ${dist.channel}`);
  t.push(`Attributed visits: ${dist.attributedVisits}`);
  t.push(`Activations: ${dist.activations}`);
  t.push(`Checkout starts: ${dist.checkoutStarts}`);
  t.push(`Newly attributed external customers (this run): ${dist.newCustomersThisRun}`);
  t.push(`Verified revenue: ${dist.verifiedRevenue}`);
  t.push(
    `Required owner approval: ${dist.blockingApproval ? 'BLOCKING - ' : ''}${dist.requiredOwnerApproval}`
  );
  t.push(`Exact action prepared: ${dist.exactActionPrepared}`);
  t.push(`Change deployed: ${ship.change}`);
  t.push(`Experiment: ${ship.experiment}`);
  t.push(`Production URL: ${ship.url}`);
  t.push(`Primary metric: ${ship.primaryMetric}`);
  t.push(`Attribution: ${ship.attribution}`);
  t.push(`Commit: ${ship.commit}`);
  t.push(`Amplify deployment: ${ship.amplify}`);
  t.push(`Production verification: ${ship.verification}`);
  t.push('Customer buckets:');
  t.push(`  Existing customers: ${dist.existingCustomers}`);
  t.push(`  Customers observed during the window: ${dist.customersObservedInWindow}`);
  t.push(`  Customers causally attributed to a specific experiment: ${dist.experimentAttributedCustomers}`);
  t.push(`  New customers acquired by the current run: ${dist.newCustomersThisRun}`);
  t.push('');

  const nextN = acqN + 1;
  t.push(`${nextN}) NEXT ACTIONS`);
  t.push('---------------');
  actions.forEach((a, i) => t.push(`${i + 1}. ${a}`));
  if (noteText) {
    t.push('');
    t.push('Agent notes:');
    t.push(noteText);
  }
  t.push('');

  const healthN = nextN + 1;
  t.push(`${healthN}) PRODUCTION HEALTH`);
  t.push('---------------------');
  t.push(`Overall: ${opts.health?.ok ? 'OK' : 'FAILED / unavailable'}`);
  for (const c of opts.health?.checks || []) {
    t.push(`- ${c.name}: ${c.ok ? 'ok' : 'FAIL'}`);
  }
  t.push('');

  const srcN = healthN + 1;
  t.push(`${srcN}) DATA SOURCES`);
  t.push('--------------');
  const crmSrc = opts.snapshot?.sources?.crm ?? 'unavailable';
  t.push(
    `GA4=${opts.snapshot?.sources?.ga4 ?? '?'}; Stripe=${opts.snapshot?.sources?.stripe ?? '?'}; Admin CRM entitlement=${crmSrc}`
  );
  t.push(
    'Stripe truth: only YouTubeBooster-attributed verified payments count. Account-wide Stripe is never product revenue. See docs/growth/STRIPE-PRODUCT-ALLOWLIST.md.'
  );
  t.push('Truth: GA4 is directional funnel signal.');
  t.push('');

  const techN = srcN + 1;
  t.push(`${techN}) TECHNICAL DETAILS`);
  t.push('--------------------');
  t.push(`UTC generatedAt: ${now.toISOString()}`);
  t.push(`ET calendar day: ${etDateParts(now).ymd}`);
  t.push(`GA4 data through: ${ga4Through || 'Unknown'}`);
  t.push(
    'Metric units: sessions=session_start events; audit_landing_sessions=pagePath sessions on audit landings; audit_*=raw event counts; payments/customers from Stripe.'
  );
  t.push('Top-events tables are display-only and must never feed the scoreboard.');
  if (windows['7d']?.topEvents?.length) {
    t.push('7d top events (display only):');
    for (const [n, c] of windows['7d'].topEvents) t.push(`  - ${n}: ${c}`);
  }
  if (windows['30d']?.topEvents?.length) {
    t.push('30d top events (display only):');
    for (const [n, c] of windows['30d'].topEvents) t.push(`  - ${n}: ${c}`);
  }
  t.push('Experiment log: docs/growth/EXPERIMENT-LOG.md');

  const text = t.join('\n');

  const shipRows = [
    ['Change deployed', ship.change],
    ['Experiment', ship.experiment],
    ['Production URL', ship.url],
    ['Primary metric', ship.primaryMetric],
    ['Attribution', ship.attribution],
    ['Commit', ship.commit],
    ['Amplify deployment', ship.amplify],
    ['Production verification', ship.verification]
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;width:180px;font-weight:600;color:#334155;">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  const distLeadBg = dist.blockingApproval ? '#fef3c7' : dist.executed ? '#ecfdf5' : '#f1f5f9';
  const distLeadBorder = dist.blockingApproval ? '#f59e0b' : dist.executed ? '#6ee7b7' : '#cbd5e1';
  const distRows = [
    ['Distribution executed', dist.executed ? 'yes' : 'no'],
    ['Audience/channel', `${dist.audience} / ${dist.channel}`],
    ['Attributed visits', String(dist.attributedVisits)],
    ['Activations', String(dist.activations)],
    ['Checkout starts', String(dist.checkoutStarts)],
    ['Newly attributed external customers (this run)', String(dist.newCustomersThisRun)],
    ['Verified revenue', String(dist.verifiedRevenue)],
    [
      'Required owner approval',
      `${dist.blockingApproval ? 'BLOCKING - ' : ''}${dist.requiredOwnerApproval}`
    ],
    ['Existing customers', String(dist.existingCustomers)],
    ['Customers observed during the window', String(dist.customersObservedInWindow)],
    [
      'Customers causally attributed to a specific experiment',
      String(dist.experimentAttributedCustomers)
    ],
    ['New customers acquired by the current run', String(dist.newCustomersThisRun)]
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;width:220px;font-weight:600;color:#334155;">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  const warnHtml = warnings.length
    ? `<h2 style="font-size:18px;margin:28px 0 10px;color:#9a3412;">Data quality</h2>
       <ul style="margin:0;padding:12px 12px 12px 32px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;font-size:15px;line-height:1.55;color:#9a3412;">
         ${warnings.map((w) => `<li style="margin:0 0 6px;">${escapeHtml(w)}</li>`).join('')}
       </ul>`
    : '';

  const scoreRow = (label, range, m) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(label)}<div style="font-size:13px;font-weight:400;color:#64748b;">${escapeHtml(range)}</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.sessions))}<div style="font-size:12px;color:#64748b;">sessions</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.qualified_landing_sessions))}<div style="font-size:12px;color:#64748b;">sessions</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.audit_starts))}<div style="font-size:12px;color:#64748b;">events</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.audit_completions))}<div style="font-size:12px;color:#64748b;">events</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.pricing_viewers))}<div style="font-size:12px;color:#64748b;">events</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.checkout_starts))}<div style="font-size:12px;color:#64748b;">events</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.successful_live_payments))}<div style="font-size:12px;color:#64748b;">payments</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.unique_paying_customers))}<div style="font-size:12px;color:#64748b;">customers</div></td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(cell(m?.live_revenue))}<div style="font-size:12px;color:#64748b;">usd</div></td>
    </tr>`;

  const expCards = classified.length
    ? classified
        .map((ex) => {
          const copy = experimentCopy(ex, opts.snapshot);
          const decisionColor =
            ex.decision === 'Due - not evaluated'
              ? '#b91c1c'
              : ex.decision === 'Awaiting approval'
                ? '#b45309'
                : ex.decision === 'Inconclusive'
                  ? '#a16207'
                  : '#166534';
          return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;">
            <tr><td style="padding:14px 16px;">
              <div style="font-size:17px;font-weight:700;">${escapeHtml(ex.id || ex.idLine)}</div>
              <div style="margin-top:6px;font-size:15px;"><b>Decision:</b> <span style="color:${decisionColor};font-weight:700;">${escapeHtml(ex.decision)}</span></div>
              <div style="margin-top:8px;font-size:14px;line-height:1.5;color:#334155;">
                <div><b>Stage:</b> ${escapeHtml(copy.stage)}</div>
                <div><b>Status:</b> ${escapeHtml(ex.status)}</div>
                <div><b>Eligible traffic:</b> ${escapeHtml(copy.eligible)}</div>
                <div><b>Primary result:</b> ${escapeHtml(copy.primary)}</div>
                <div><b>Sample:</b> ${escapeHtml(copy.sample)}</div>
                <div><b>Evaluation date:</b> ${escapeHtml(ex.evalDateLabel || ex.evalDate || 'n/a')}</div>
              </div>
            </td></tr>
          </table>`;
        })
        .join('')
    : '<p style="font-size:15px;">(none marked active)</p>';

  const healthRows = (opts.health?.checks || [])
    .map(
      (c) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.name)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.ok ? 'OK' : 'FAIL'}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#e2e8f0;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;font-size:16px;line-height:1.5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2e8f0;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="840" cellpadding="0" cellspacing="0" style="width:840px;max-width:840px;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;">
        <tr><td style="padding:22px 28px;background:#0f172a;color:#fff;border-radius:12px 12px 0 0;">
          <div style="font-size:22px;font-weight:700;line-height:1.3;">YouTubeBooster AI - Growth report</div>
          <div style="font-size:14px;opacity:0.9;margin-top:6px;">${escapeHtml(et.date)} ${escapeHtml(et.time)} ${escapeHtml(et.zone)}</div>
          <div style="margin-top:14px;font-size:14px;">
            <a href="https://youtubeboosterai.com/" style="color:#93c5fd;text-decoration:none;margin-right:16px;">Open site</a>
            <a href="https://youtubeboosterai.com/admin/orders" style="color:#93c5fd;text-decoration:none;">Admin orders</a>
          </div>
        </td></tr>
        <tr><td style="padding:24px 28px 32px;">
          <h2 style="font-size:18px;margin:0 0 10px;">Decision</h2>
          <p style="margin:0;padding:16px 18px;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;font-size:16px;line-height:1.55;">${escapeHtml(decision)}</p>

          ${warnHtml}

          <h2 style="font-size:18px;margin:28px 0 10px;">Scoreboard</h2>
          <p style="margin:0 0 8px;font-size:15px;color:#334155;"><b>GA4 data through:</b> ${escapeHtml(throughLabel)}</p>
          <p style="margin:0 0 8px;font-size:14px;color:#475569;">${escapeHtml(AUDIT_LANDING_DEFINITION)}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#475569;">Audit metrics are raw GA4 <b>events</b>. Stripe shows <b>verified YouTubeBooster-attributed</b> payments and customers only. Account-wide Stripe is never this product's revenue.</p>
          <div style="overflow-x:auto;">
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;min-width:720px;">
            <thead>
              <tr style="background:#f1f5f9;">
                <th align="left" style="padding:10px 12px;">Window</th>
                <th align="right" style="padding:10px 12px;">Sessions</th>
                <th align="right" style="padding:10px 12px;">Audit landing sessions</th>
                <th align="right" style="padding:10px 12px;">Audit starts</th>
                <th align="right" style="padding:10px 12px;">Audit completions</th>
                <th align="right" style="padding:10px 12px;">Pricing</th>
                <th align="right" style="padding:10px 12px;">Checkout starts</th>
                <th align="right" style="padding:10px 12px;">Live payments</th>
                <th align="right" style="padding:10px 12px;">Unique customers</th>
                <th align="right" style="padding:10px 12px;">Net revenue</th>
              </tr>
            </thead>
            <tbody>
              ${scoreRow('7d', range7.rangeLabel, m7)}
              ${scoreRow('30d', range30.rangeLabel, m30)}
            </tbody>
          </table>
          </div>
          <p style="margin:12px 0 0;font-size:14px;color:#334155;">
            Audit start-to-completion conversion: <b>Unavailable</b> until same-cohort audit tracking exists.
            Experiment-attributed paid: <b>Unknown</b>.
            Paid to entitled within 24h: <b>${
              opts.snapshot?.sources?.crm === 'ok'
                ? escapeHtml(
                    opts.snapshot?.windows?.['7d']?.crm?.paidToEntitledWithin24h == null
                      ? 'Unknown (missing entitlement timestamps)'
                      : String(opts.snapshot.windows['7d'].crm.paidToEntitledWithin24h)
                  )
                : 'Unavailable - Admin CRM required'
            }</b>.
          </p>
          <p style="margin:8px 0 0;font-size:14px;color:#334155;">
            Stripe 30d - attributed live payments: <b>${escapeHtml(stripe30.attributedLivePayments)}</b>;
            verified external customers: <b>${escapeHtml(stripe30.verifiedExternalCustomers)}</b>;
            verified external revenue: <b>${escapeHtml(stripe30.verifiedExternalRevenue)}</b>;
            owner/self or smoke: <b>${escapeHtml(stripe30.ownerSelfPayments)}</b>;
            unverified/unattributed: <b>${escapeHtml(stripe30.unverifiedPayments)}</b>.
          </p>

          <h2 style="font-size:18px;margin:28px 0 10px;">Experiment results</h2>
          ${expCards}
          <p style="margin:8px 0 0;font-size:14px;color:#475569;">${escapeHtml(EXP_OVERLAP_POLICY.summary)} ${escapeHtml(exp004OverlapNote(classified))}</p>

          <h2 style="font-size:18px;margin:28px 0 10px;">Acquisition action</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${distLeadBorder};background:${distLeadBg};border-radius:8px;border-collapse:separate;font-size:15px;">
            ${distRows}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;font-size:15px;">
            ${shipRows}
          </table>

          <h2 style="font-size:18px;margin:28px 0 10px;">Next actions</h2>
          <ol style="margin:0;padding-left:22px;font-size:15px;line-height:1.55;">
            ${actions.map((a) => `<li style="margin:0 0 8px;">${escapeHtml(a)}</li>`).join('')}
          </ol>
          ${noteText ? `<p style="margin:16px 0 0;font-size:14px;color:#475569;"><b>Agent notes:</b> ${escapeHtml(noteText)}</p>` : ''}

          <h2 style="font-size:18px;margin:28px 0 10px;">Production health</h2>
          <p style="margin:0 0 8px;font-size:15px;"><b>Overall:</b> ${opts.health?.ok ? 'OK' : 'FAILED / unavailable'}</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;">
            <tbody>${healthRows || '<tr><td style="padding:8px 12px;">(unavailable)</td></tr>'}</tbody>
          </table>

          <h2 style="font-size:18px;margin:28px 0 10px;">Data sources</h2>
          <p style="margin:0;font-size:15px;line-height:1.5;">
            GA4=${escapeHtml(opts.snapshot?.sources?.ga4 ?? '?')};
            Stripe=${escapeHtml(opts.snapshot?.sources?.stripe ?? '?')};
            Admin CRM entitlement=${escapeHtml(opts.snapshot?.sources?.crm ?? 'unavailable')}.
            Verified YouTubeBooster Stripe only. Account-wide Stripe is diagnostic, not product revenue.
          </p>

          <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.45;">
            UTC: ${escapeHtml(now.toISOString())}. Scoreboard uses explicit event maps, never truncated top-event tables.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    decision,
    warnings,
    experiments: classified,
    nextEval: nextFuture,
    windows,
    et,
    ga4Through,
    ship,
    dist
  };
}

export { formatLongDateEt, parseActiveExperiments };
