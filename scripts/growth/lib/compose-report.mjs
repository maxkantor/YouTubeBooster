/**
 * Executive growth email composer (HTML + plain text).
 * Uses canonical metrics — never scoreboard-from-top-events.
 */
import {
  buildCanonicalWindowMetrics,
  cohortRate,
  formatMetricValue,
  reconcileCanonicalWindows,
  sumEventsByName,
  topEventsForDisplay
} from './canonical-metrics.mjs';
import { EXP_OVERLAP_POLICY, nextEvaluation, parseActiveExperiments } from './experiment-report.mjs';
import { etDateParts, formatEtDateTime, formatLongDateEt } from './time.mjs';

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

function cell(m) {
  return formatMetricValue(m);
}

function rateCell(num, den) {
  const r = cohortRate(num, den);
  if (r.rate == null) return r.label;
  return r.directional ? `${r.label} (directional — insufficient sample)` : r.label;
}

/**
 * Build decision paragraph when agent notes do not supply one.
 */
export function defaultDecisionText({ experiments, health, shipped, nextEval }) {
  const n = experiments.length;
  const next = nextEval
    ? `The next evaluation is ${nextEval.id || 'the soonest experiment'} on ${nextEval.evalDateLabel}.`
    : 'No evaluation date is scheduled.';
  const healthBit =
    health?.ok === true
      ? 'Production, GA4, and Stripe collection paths look healthy for this run.'
      : health?.ok === false
        ? 'Production health reported a failure — see Production Health.'
        : 'Production health was partially unavailable.';

  if (shipped) {
    return ascii(
      `A production change was deployed this run. ${n} experiment(s) remain active. ${healthBit} ${next}`
    );
  }
  return ascii(
    `No new production experiment was deployed. ${n} active experiment(s) are still collecting data, and current traffic is too low to support another overlapping CRO test. ${healthBit} ${next}`
  );
}

/**
 * @param {object} snapshot
 */
export function buildCanonicalFromSnapshot(snapshot) {
  /** @type {Record<string, object>} */
  const windows = {};
  /** @type {string[]} */
  const warnings = [];

  for (const label of ['7d', '30d']) {
    const w = snapshot?.windows?.[label];
    const explicitMap =
      w?.canonicalEvents ||
      w?.ga4ExplicitEvents ||
      (w?.ga4 ? sumEventsByName(w.ga4) : null);

    // If snapshot marked topEventsOnly, treat as truncated
    const truncated = w?.eventsTruncated === true;
    const byEvent = truncated ? w.topEventsMap || null : explicitMap;

    const metrics = buildCanonicalWindowMetrics({
      byEvent,
      explicitQueried: !truncated && byEvent != null,
      stripe: w?.stripe || null,
      landing: w?.landing || snapshot?.landing?.[label] || null
    });

    // Completions > starts is often valid (cross-window + demo path) — warn, don't blank
    const starts = metrics.audit_starts.value;
    const dones = metrics.audit_completions.value;
    if (typeof starts === 'number' && typeof dones === 'number' && dones > starts) {
      warnings.push(
        `${label}: audit_completed events (${dones}) exceed audit_started (${starts}). Likely causes: completions for audits started before the window, showcase/demo completions historically counted as audits, or remount double-fires before dedupe fix. These are raw event totals, not a same-window cohort conversion.`
      );
    }

    const attr = w?.stripe?.attribution;
    if (attr) {
      if (!attr.reconciliationComplete) {
        warnings.push(
          `${label}: Stripe reconciliation incomplete — verified YouTubeBooster payments/customers/revenue use documented baseline (0). Do not treat account-wide Stripe (${attr.accountWideLivePaidSessions ?? '?'}) as this product's revenue.`
        );
      }
      if ((attr.unattributedLivePayments || 0) > 0) {
        warnings.push(
          `${label}: ${attr.unattributedLivePayments} Unattributed Stripe payment(s) excluded from YouTubeBooster revenue/customers.`
        );
      }
      if ((attr.otherAppLivePayments || 0) > 0) {
        warnings.push(
          `${label}: ${attr.otherAppLivePayments} live payment(s) attributed to another application and excluded.`
        );
      }
    }

    windows[label] = {
      start: w?.start,
      end: w?.end,
      metrics,
      topEvents: topEventsForDisplay(explicitMap || {}, 10)
    };
  }

  const recon = reconcileCanonicalWindows({
    '7d': windows['7d']?.metrics,
    '30d': windows['30d']?.metrics
  });
  warnings.push(...recon.warnings);

  return { windows, warnings, reconOk: recon.ok };
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
 *   generatedAt?: Date|string,
 *   subjectPrefix?: string
 * }} opts
 */
export function composeGrowthReport(opts) {
  const now = opts.generatedAt ? new Date(opts.generatedAt) : new Date();
  const et = formatEtDateTime(now);
  const experiments =
    opts.experiments || (opts.logMd ? parseActiveExperiments(opts.logMd) : []);
  const nextEval = nextEvaluation(experiments);
  const { windows, warnings } = buildCanonicalFromSnapshot(opts.snapshot || {});

  const noteText = ascii((opts.notes && opts.notes.trim()) || '');
  const decision =
    ascii(opts.decision?.trim() || '') ||
    defaultDecisionText({
      experiments,
      health: opts.health,
      shipped: !!opts.shipped,
      nextEval
    });

  const m7 = windows['7d']?.metrics;
  const m30 = windows['30d']?.metrics;
  const range7 = windows['7d'] ? `${windows['7d'].start} to ${windows['7d'].end}` : 'missing';
  const range30 = windows['30d'] ? `${windows['30d'].start} to ${windows['30d'].end}` : 'missing';

  const shipLabel = opts.shipped ? 'Change deployed' : 'No change deployed';
  const subject = ascii(
    `${opts.subjectPrefix || 'YouTubeBooster Growth'} - ${shipLabel} - ${experiments.length} experiments collecting data - ${et.date}`
  );

  // ---- plain text ----
  const t = [];
  t.push('YouTubeBooster AI - Growth report');
  t.push('================================');
  t.push(`Generated: ${et.date} ${et.time} ${et.zone}`);
  t.push(`Site: https://youtubeboosterai.com/`);
  t.push(`Admin: https://youtubeboosterai.com/admin/orders`);
  t.push(`Analyzer: https://youtubeboosterai.com/youtube-channel-analyzer`);
  t.push('');
  t.push('1) DECISION');
  t.push('-----------');
  t.push(decision);
  t.push('');
  if (warnings.length) {
    t.push('2) DATA QUALITY WARNING');
    t.push('-----------------------');
    for (const w of warnings) t.push(`* ${ascii(w)}`);
    t.push('');
  }
  const scoreN = warnings.length ? 3 : 2;
  t.push(`${scoreN}) SCOREBOARD (raw events unless noted)`);
  t.push('-'.repeat(40));
  t.push(
    `7d (${range7}): sessions=${cell(m7?.sessions)} | qualified_landing=${cell(m7?.qualified_landing_sessions)} | audit_starts=${cell(m7?.audit_starts)} | audit_completions=${cell(m7?.audit_completions)} | pricing=${cell(m7?.pricing_viewers)} | checkout_starts=${cell(m7?.checkout_starts)} | verified_live_payments=${cell(m7?.successful_live_payments)} | verified_unique_customers=${cell(m7?.unique_paying_customers)} | entitled=${cell(m7?.entitled_paid_users)} | verified_revenue=${cell(m7?.live_revenue)}`
  );
  t.push(
    `30d (${range30}): sessions=${cell(m30?.sessions)} | qualified_landing=${cell(m30?.qualified_landing_sessions)} | audit_starts=${cell(m30?.audit_starts)} | audit_completions=${cell(m30?.audit_completions)} | pricing=${cell(m30?.pricing_viewers)} | checkout_starts=${cell(m30?.checkout_starts)} | verified_live_payments=${cell(m30?.successful_live_payments)} | verified_unique_customers=${cell(m30?.unique_paying_customers)} | entitled=${cell(m30?.entitled_paid_users)} | verified_revenue=${cell(m30?.live_revenue)}`
  );
  const a30 = opts.snapshot?.windows?.['30d']?.stripe?.attribution;
  if (a30) {
    t.push(
      `Stripe attribution (30d diagnostic): account_wide_live_paid=${a30.accountWideLivePaidSessions ?? '?'} | unattributed=${a30.unattributedLivePayments ?? '?'} | other_app=${a30.otherAppLivePayments ?? '?'} | excluded_owner_smoke=${a30.excludedOwnerOrSmokePayments ?? '?'} | attributed_candidates=${a30.attributedCandidatesBeforeBaseline ?? '?'} | reconciliationComplete=${a30.reconciliationComplete}`
    );
  }
  t.push(
    `Rates (30d, directional if sample < 30): start/session=${rateCell(m30?.audit_starts?.value, m30?.sessions?.value)}; complete/start=${rateCell(m30?.audit_completions?.value, m30?.audit_starts?.value)} (not a cohort rate if completions can lag starts); checkout/pricing=${rateCell(m30?.checkout_starts?.value, m30?.pricing_viewers?.value)}; paid/checkout=${rateCell(m30?.successful_live_payments?.value, m30?.checkout_starts?.value)}`
  );
  t.push(`Experiment-attributed paid conversions: Unknown`);
  t.push('');

  const expN = scoreN + 1;
  t.push(`${expN}) EXPERIMENT RESULTS`);
  t.push('--------------------');
  if (!experiments.length) t.push('(none marked active)');
  else {
    t.push('Experiment | Stage | Status | Eligible traffic | Primary result | Sample | Eval | Decision');
    for (const ex of experiments) {
      let eligible = 'see log';
      let primary = 'collecting';
      if (ex.id === 'EXP-002') {
        eligible = 'SEO form pages (excl analyzer URL)';
        primary = 'page-isolated audit_starts: Unknown until path join verified';
      } else if (ex.id === 'EXP-003') {
        eligible = '/youtube-channel-analyzer';
        primary = 'analyzer sessions/starts: Unknown until path join verified';
      } else if (ex.id === 'EXP-001') {
        eligible = 'post-checkout guests';
        primary = 'Post-purchase activation: Unavailable - Admin CRM connection required';
      }
      t.push(
        `${ex.id || ex.idLine} | ${ascii(ex.funnelStage)} | ${ascii(ex.status)} | ${eligible} | ${primary} | low | ${ex.evalDateLabel || ex.evalDate} | continue collecting`
      );
    }
    t.push('');
    t.push(`Overlap: ${EXP_OVERLAP_POLICY.summary}`);
  }
  t.push('');

  const nextN = expN + 1;
  t.push(`${nextN}) NEXT ACTIONS`);
  t.push('---------------');
  if (nextEval) {
    t.push(`1. Next evaluation: ${nextEval.id} on ${nextEval.evalDateLabel}.`);
  } else {
    t.push('1. Next evaluation: none scheduled.');
  }
  t.push('2. Keep audit-start/completion measurement trustworthy (dedupe + explicit GA4 queries).');
  t.push('3. Verify EXP-001 payment-to-entitlement tracking via Admin CRM when available.');
  t.push('4. Continue collecting for EXP-002 and EXP-003; do not start another SEO/acquisition/checkout/post-purchase experiment while those stages are locked.');
  t.push('5. Prioritize qualified acquisition after measurement is trustworthy.');
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
  t.push('Metric units: sessions=session_start events; audit_*=raw event counts; payments/customers from Stripe.');
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

  // ---- HTML ----
  const warnHtml = warnings.length
    ? `<h2 style="font-size:15px;margin:18px 0 8px;color:#b45309;">Data Quality Warning</h2>
       <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.45;color:#92400e;">
         ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
       </ul>`
    : '';

  const scoreRow = (label, range, m) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(label)}<div style="font-size:11px;color:#6b7280;">${escapeHtml(range)}</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.sessions))}<div style="font-size:10px;color:#9ca3af;">sessions</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.qualified_landing_sessions))}<div style="font-size:10px;color:#9ca3af;">sessions</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.audit_starts))}<div style="font-size:10px;color:#9ca3af;">events</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.audit_completions))}<div style="font-size:10px;color:#9ca3af;">events</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.pricing_viewers))}<div style="font-size:10px;color:#9ca3af;">events</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.checkout_starts))}<div style="font-size:10px;color:#9ca3af;">events</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.successful_live_payments))}<div style="font-size:10px;color:#9ca3af;">payments</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.unique_paying_customers))}<div style="font-size:10px;color:#9ca3af;">customers</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.entitled_paid_users))}<div style="font-size:10px;color:#9ca3af;">users</div></td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(cell(m?.live_revenue))}<div style="font-size:10px;color:#9ca3af;">usd</div></td>
    </tr>`;

  const expRows = experiments.length
    ? experiments
        .map((ex) => {
          let eligible = 'see log';
          let primary = 'collecting';
          if (ex.id === 'EXP-001') {
            eligible = 'post-checkout guests';
            primary = 'Activation: Unavailable — Admin CRM required';
          } else if (ex.id === 'EXP-002') {
            eligible = 'SEO form pages';
            primary = 'Isolated result: Unknown';
          } else if (ex.id === 'EXP-003') {
            eligible = '/youtube-channel-analyzer';
            primary = 'Isolated result: Unknown';
          }
          return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(ex.id || ex.idLine)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(ex.funnelStage)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(ex.status)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(eligible)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(primary)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">low</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(ex.evalDateLabel || ex.evalDate)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">continue</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="8" style="padding:6px 8px;">(none marked active)</td></tr>`;

  const healthRows = (opts.health?.checks || [])
    .map(
      (c) =>
        `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(c.name)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;">${c.ok ? 'OK' : 'FAIL'}</td></tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
  <div style="max-width:720px;margin:24px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
    <div style="padding:18px 20px;background:#0f172a;color:#fff;">
      <div style="font-size:18px;font-weight:700;">YouTubeBooster AI - Growth report</div>
      <div style="font-size:13px;opacity:0.85;margin-top:4px;">${escapeHtml(et.date)} ${escapeHtml(et.time)} ${escapeHtml(et.zone)}</div>
    </div>
    <div style="padding:18px 20px;">
      <p style="margin:0 0 12px;font-size:13px;">
        <a href="https://youtubeboosterai.com/">Homepage</a> ·
        <a href="https://youtubeboosterai.com/admin/orders">Admin orders</a> ·
        <a href="https://youtubeboosterai.com/youtube-channel-analyzer">Channel analyzer</a>
      </p>

      <h2 style="font-size:15px;margin:18px 0 8px;">Decision</h2>
      <p style="margin:0;padding:12px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:14px;line-height:1.5;">${escapeHtml(decision)}</p>

      ${warnHtml}

      <h2 style="font-size:15px;margin:18px 0 8px;">Scoreboard</h2>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Audit metrics are raw GA4 <b>events</b>. Stripe scoreboard shows <b>verified YouTubeBooster-attributed</b> payments/customers only (baseline 0 until reconciliation). Account-wide Stripe is never this product's revenue.</p>
      <div style="overflow-x:auto;">
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th align="left" style="padding:6px 8px;">Window</th>
            <th align="right" style="padding:6px 8px;">Sessions</th>
            <th align="right" style="padding:6px 8px;">Qualified landings</th>
            <th align="right" style="padding:6px 8px;">Audit starts</th>
            <th align="right" style="padding:6px 8px;">Audit completions</th>
            <th align="right" style="padding:6px 8px;">Pricing</th>
            <th align="right" style="padding:6px 8px;">Checkout starts</th>
            <th align="right" style="padding:6px 8px;">Live payments</th>
            <th align="right" style="padding:6px 8px;">Unique customers</th>
            <th align="right" style="padding:6px 8px;">Entitled</th>
            <th align="right" style="padding:6px 8px;">Net revenue</th>
          </tr>
        </thead>
        <tbody>
          ${scoreRow('7d', range7, m7)}
          ${scoreRow('30d', range30, m30)}
        </tbody>
      </table>
      </div>
      <p style="margin:8px 0 0;font-size:12px;color:#374151;">
        30d rates: landing→start ${escapeHtml(rateCell(m30?.audit_starts?.value, m30?.sessions?.value))};
        start→complete ${escapeHtml(rateCell(m30?.audit_completions?.value, m30?.audit_starts?.value))} (not same-window cohort);
        pricing→checkout ${escapeHtml(rateCell(m30?.checkout_starts?.value, m30?.pricing_viewers?.value))};
        checkout→paid ${escapeHtml(rateCell(m30?.successful_live_payments?.value, m30?.checkout_starts?.value))}.
        Experiment-attributed paid: <b>Unknown</b>.
        Paid→entitled within 24h: <b>Unavailable — Admin CRM connection required</b>.
      </p>

      <h2 style="font-size:15px;margin:18px 0 8px;">Experiment Results</h2>
      <div style="overflow-x:auto;">
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th align="left" style="padding:6px 8px;">Experiment</th>
            <th align="left" style="padding:6px 8px;">Stage</th>
            <th align="left" style="padding:6px 8px;">Status</th>
            <th align="left" style="padding:6px 8px;">Eligible traffic</th>
            <th align="left" style="padding:6px 8px;">Primary result</th>
            <th align="left" style="padding:6px 8px;">Sample</th>
            <th align="left" style="padding:6px 8px;">Evaluation</th>
            <th align="left" style="padding:6px 8px;">Decision</th>
          </tr>
        </thead>
        <tbody>${expRows}</tbody>
      </table>
      </div>
      <p style="margin:8px 0 0;font-size:12px;color:#6b7280;">${escapeHtml(EXP_OVERLAP_POLICY.summary)} Details: docs/growth/EXPERIMENT-LOG.md</p>

      <h2 style="font-size:15px;margin:18px 0 8px;">Next Actions</h2>
      <ol style="margin:0;padding-left:18px;font-size:13px;line-height:1.5;">
        <li>${nextEval ? escapeHtml(`Next evaluation: ${nextEval.id} on ${nextEval.evalDateLabel}.`) : 'Next evaluation: none scheduled.'}</li>
        <li>Keep audit-start/completion measurement trustworthy (dedupe + explicit GA4 queries).</li>
        <li>Verify EXP-001 payment-to-entitlement tracking via Admin CRM when available.</li>
        <li>Continue EXP-002 and EXP-003; do not open another overlapping SEO/acquisition/checkout/post-purchase experiment.</li>
        <li>Prioritize qualified acquisition after measurement is trustworthy.</li>
      </ol>
      ${noteText ? `<p style="margin:12px 0 0;font-size:12px;color:#6b7280;"><b>Agent notes:</b> ${escapeHtml(noteText)}</p>` : ''}

      <h2 style="font-size:15px;margin:18px 0 8px;">Production Health</h2>
      <p style="margin:0 0 8px;font-size:13px;"><b>Overall:</b> ${opts.health?.ok ? 'OK' : 'FAILED / unavailable'}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${healthRows || '<tr><td style="padding:6px 8px;">(unavailable)</td></tr>'}</tbody>
      </table>

      <h2 style="font-size:15px;margin:18px 0 8px;">Data Sources</h2>
      <p style="margin:0;font-size:13px;line-height:1.45;">
        GA4=${escapeHtml(opts.snapshot?.sources?.ga4 ?? '?')};
        Stripe=${escapeHtml(opts.snapshot?.sources?.stripe ?? '?')};
        Admin CRM entitlement metrics=unavailable.
        Verified YouTubeBooster Stripe attribution only — see docs/growth/STRIPE-PRODUCT-ALLOWLIST.md.
        Account-wide Stripe totals are diagnostic and must not be reported as product revenue.
      </p>

      <h2 style="font-size:15px;margin:18px 0 8px;">Technical Details</h2>
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.45;">
        UTC: ${escapeHtml(now.toISOString())}. Scoreboard uses explicitly aggregated event maps, never truncated top-event tables.
        Audit start/completion are raw event counts until audit_attempt_id is queryable in GA4.
      </p>
    </div>
  </div>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    decision,
    warnings,
    experiments,
    nextEval,
    windows,
    et
  };
}

export { formatLongDateEt, parseActiveExperiments };
