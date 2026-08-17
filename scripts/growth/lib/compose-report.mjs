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

function experimentCopy(ex) {
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
    return {
      stage: 'Post-purchase activation',
      eligible: 'Post-checkout guests',
      primary: 'Paid-to-entitled within 24h: Unavailable - Admin CRM connection required',
      sample: '0 verified payments'
    };
  }
  if (ex.id === 'EXP-004') {
    return {
      stage: 'Founder outreach',
      eligible: '/share and /sample-report (distribution asset; not send approval)',
      primary: 'Outreach paused pending named-recipient approval',
      sample: 'n/a'
    };
  }
  return {
    stage: typographicNormalize(ex.funnelStage || 'see log'),
    eligible: 'see log',
    primary: 'see log',
    sample: 'low'
  };
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
  reportYmd
}) {
  const nCollecting = classified.filter((e) => e.collecting).length;
  const nAwaiting = classified.filter((e) => e.decision === 'Awaiting approval').length;
  const dueMissed = classified.filter((e) => e.dueUnevaluated);
  const exp001 = classified.find((e) => e.id === 'EXP-001');

  const parts = [];

  if (shipped && ship?.change && ship.change !== 'none this run') {
    const owner = ship.experiment && ship.experiment !== 'n/a' ? ` under ${ship.experiment}` : '';
    parts.push(`${ship.change}${owner}.`);
  } else if (shipped) {
    parts.push(
      'A production change was marked shipped this run, but attribution details were not provided.'
    );
  } else {
    parts.push('No new production treatment shipped this run.');
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

  const outreachBit =
    nAwaiting > 0
      ? `${nCollecting} experiment${nCollecting === 1 ? '' : 's'} ${nCollecting === 1 ? 'is' : 'are'} collecting attributable traffic, while outreach remains paused pending owner approval.`
      : `${nCollecting} experiment${nCollecting === 1 ? '' : 's'} ${nCollecting === 1 ? 'is' : 'are'} collecting attributable traffic.`;
  parts.push(outreachBit);

  parts.push(
    `Verified external paying customers: ${stripe30.verifiedExternalCustomers}. Verified net revenue: ${stripe30.verifiedExternalRevenue}.`
  );

  if (health?.ok === false) {
    parts.push('Production health reported a failure - see Production Health.');
  }

  if (nextFuture) {
    parts.push(`The next scheduled evaluation is ${nextFuture.id} on ${nextFuture.evalDateLabel}.`);
  }

  return typographicNormalize(parts.join(' '));
}

export function buildSubject({ prefix, shipped, ship, classified, et }) {
  const nActive = classified.filter((e) => e.collecting).length;
  const nAwaiting = classified.filter((e) => e.decision === 'Awaiting approval').length;
  const dueMissed = classified.some((e) => e.dueUnevaluated);
  const shipLabel = shipped
    ? ship?.kind === 'acquisition' || /acquisition|share|sample-report|seo/i.test(ship?.change || '')
      ? 'Acquisition change deployed'
      : 'Change deployed'
    : 'No change deployed';
  let s = `${prefix || 'YouTubeBooster Growth'} - ${shipLabel} · ${nActive} experiments active`;
  if (nAwaiting) s += ` · ${nAwaiting} awaiting approval`;
  if (dueMissed) s += ' · due eval missed';
  s += ` · ${et.date}`;
  return typographicNormalize(s);
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

  const warnings = consolidateQualityWarnings({ windows, snapshot, crmUnavailable: true });
  const recon = reconcileCanonicalWindows({
    '7d': windows['7d']?.metrics,
    '30d': windows['30d']?.metrics
  });

  return { windows, warnings, reconOk: recon.ok };
}

function nextActions({ classified, nextFuture, reportYmd }) {
  const items = [];
  const dueMissed = classified.filter((e) => e.dueUnevaluated);
  const exp001 = classified.find((e) => e.id === 'EXP-001');

  if (dueMissed.length) {
    items.push(
      `Evaluate ${dueMissed.map((e) => e.id).join(', ')} immediately (due ${formatMonthDayYear(reportYmd)}). Do not report another ship until that decision is recorded.`
    );
  } else if (exp001?.decision === 'Inconclusive') {
    items.push(
      'Keep EXP-001 treatment unchanged. Re-evaluate when a verified attributed live payment exists and Admin CRM entitlement can be measured.'
    );
  }

  items.push(
    'Keep one main Acquisition/SEO treatment (EXP-002). Treat EXP-003 /youtube-channel-analyzer as a nested distribution URL, not a second CRO test.'
  );
  items.push(
    'Keep EXP-004 /share and /sample-report as a distribution asset. Outreach stays awaiting owner approval - not collecting.'
  );
  items.push('Do not start another experiment at current traffic (sessions and checkout starts are too low to split).');
  items.push('Keep audit-start/completion measurement trustworthy (dedupe + explicit GA4 queries). Never divide raw completions by starts.');

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
      reportYmd
    });

  const m7 = windows['7d']?.metrics;
  const m30 = windows['30d']?.metrics;
  const subject = buildSubject({
    prefix: opts.subjectPrefix,
    shipped,
    ship,
    classified,
    et
  });
  const actions = nextActions({ classified, nextFuture, reportYmd });

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
  t.push('Change deployed:');
  t.push(`  Change deployed: ${ship.change}`);
  t.push(`  Experiment: ${ship.experiment}`);
  t.push(`  Production URL: ${ship.url}`);
  t.push(`  Primary metric: ${ship.primaryMetric}`);
  t.push(`  Attribution: ${ship.attribution}`);
  t.push(`  Commit: ${ship.commit}`);
  t.push(`  Amplify deployment: ${ship.amplify}`);
  t.push(`  Production verification: ${ship.verification}`);
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
      const copy = experimentCopy(ex);
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
      'At current volume, EXP-002 is the main Acquisition/SEO treatment; EXP-003 is a nested URL; EXP-004 is awaiting approval and is not collecting outreach data.'
    );
  }
  t.push('');

  const nextN = expN + 1;
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
  t.push(
    `GA4=${opts.snapshot?.sources?.ga4 ?? '?'}; Stripe=${opts.snapshot?.sources?.stripe ?? '?'}; Admin CRM entitlement=unavailable`
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
          const copy = experimentCopy(ex);
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

          <h2 style="font-size:18px;margin:28px 0 10px;">Change deployed</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;font-size:15px;">
            ${shipRows}
          </table>

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
            Paid to entitled within 24h: <b>Unavailable - Admin CRM required</b>.
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
          <p style="margin:8px 0 0;font-size:14px;color:#475569;">${escapeHtml(EXP_OVERLAP_POLICY.summary)} EXP-004 is awaiting owner approval and is not collecting outreach data.</p>

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
            Admin CRM entitlement=unavailable.
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
    ship
  };
}

export { formatLongDateEt, parseActiveExperiments };
