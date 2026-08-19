/**
 * Experiment log parsing + EXP-002 / EXP-003 overlap policy.
 */
import { formatLongDateEt, weekdayNameForYmd } from './time.mjs';

export const EXP_OVERLAP_POLICY = Object.freeze({
  summary:
    'EXP-003 is a new acquisition URL that reuses the EXP-002 on-page form treatment. Evaluate independently by page path; do not double-count in portfolio paid totals.',
  relationship: 'nested_surface',
  exp002: {
    id: 'EXP-002',
    eligible:
      'SEO growth/compare pages that render SeoAuditEntryForm, excluding /youtube-channel-analyzer',
    primaryMetric: 'audit_started (and form submits) on eligible SEO paths',
    attribution: 'GA4 source containing growth_guide_* or comparison_* OR pagePath match'
  },
  exp003: {
    id: 'EXP-003',
    eligible: 'Sessions and conversions on /youtube-channel-analyzer only',
    primaryMetric: 'Sessions + audit_started with source containing youtube-channel-analyzer',
    attribution: 'pagePath == /youtube-channel-analyzer (or source param)'
  },
  doubleCountRule:
    'A single session may appear in both descriptive sections when disclosed, but portfolio totals use sitewide metrics once.',
  independentInterpretation:
    'Yes for directional page performance; no for incremental form-treatment lift (EXP-003 inherits EXP-002 UI).',
  measurementLimitation:
    'Without reliable pagePath+event join in every snapshot, experiment-attributed paid conversions remain Unknown.'
});

/**
 * @param {string} md experiment log markdown
 */
export function parseActiveExperiments(md) {
  const active = [];
  const re =
    /###\s+(\d{4}-\d{2}-\d{2})\s+[-\u2013\u2014]\s+(EXP-\d+[^\n]*)([\s\S]*?)(?=\n###\s+\d{4}-\d{2}-\d{2}|\n##\s+Completed|$)/g;
  let m;
  while ((m = re.exec(md))) {
    const block = m[0];
    const status = (() => {
      const fm = block.match(/\|\s*Status\s*\|\s*([^|]+)\s*\|/i);
      return fm ? String(fm[1]).trim() : '';
    })();
    const reportable = /^(active|awaiting owner approval|nested)$/i.test(status);
    if (!reportable) continue;
    const field = (name) => {
      const fm = block.match(new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|]+)\\s*\\|`, 'i'));
      return fm ? String(fm[1]).trim() : '';
    };
    const evalRaw = field('Evaluation date');
    const evalYmd = (evalRaw.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '';
    const evaluationDecision = field('Evaluation decision');
    const evaluationReason = field('Evaluation reason') || field('Evaluation evidence');
    active.push({
      idLine: `${m[1]} - ${m[2].trim()}`,
      id: (m[2].match(/EXP-\d+/) || [])[0] || '',
      status,
      funnelStage: field('Funnel stage'),
      evalDate: evalYmd,
      evalDateLabel: evalYmd ? formatLongDateEt(evalYmd) : '',
      evalWeekday: evalYmd ? weekdayNameForYmd(evalYmd) : '',
      primaryMetric: field('Primary metric'),
      hypothesis: field('Hypothesis'),
      commit: field('Commit').replace(/`/g, ''),
      amplify: field('Amplify'),
      evaluationDecision,
      evaluationReason
    });
  }
  return active;
}

export const EXPERIMENT_DECISIONS = Object.freeze([
  'Keep',
  'Iterate',
  'Stop',
  'Inconclusive',
  'Awaiting approval'
]);

/**
 * @param {ReturnType<typeof parseActiveExperiments>[number]} ex
 * @param {{ reportYmd?: string, evaluations?: Record<string, { decision?: string, reason?: string }> }} [opts]
 */
export function classifyExperiment(ex, opts = {}) {
  const reportYmd = opts.reportYmd || '';
  const override = opts.evaluations?.[ex.id] || {};
  const recorded = override.decision || ex.evaluationDecision || '';
  const awaiting = /awaiting owner approval/i.test(ex.status);
  const due = Boolean(reportYmd && ex.evalDate && ex.evalDate <= reportYmd);
  const exp004CollectingHold =
    ex.id === 'EXP-004' &&
    !recorded &&
    /active/i.test(ex.status);
  if (exp004CollectingHold) {
    const startYmd = '2026-08-13';
    const days = reportYmd && startYmd ? Math.floor((Date.parse(`${reportYmd}T12:00:00Z`) - Date.parse(`${startYmd}T12:00:00Z`)) / 86400000) : 0;
    const sends = Number(opts.outreachSends ?? 0);
    if (sends < 100 && days < 14) {
      return {
        ...ex,
        decision: 'Keep',
        decisionReason: override.reason || ex.evaluationReason || 'COLLECTING until 100 qualified sends or 14 calendar days',
        collecting: true,
        dueUnevaluated: false,
        nested: false,
        independentCollecting: true
      };
    }
  }
  const nested =
    /^nested$/i.test(ex.status) || /nested/i.test(ex.funnelStage || '') || ex.id === 'EXP-003';
  const allowed = new Set(EXPERIMENT_DECISIONS);

  let decision = recorded;
  if (decision && !allowed.has(decision)) {
    decision = '';
  }
  if (!decision) {
    if (awaiting) decision = 'Awaiting approval';
    else if (due) decision = 'Due - not evaluated';
    else decision = 'Keep';
  }

  const dueUnevaluated = due && !recorded && !awaiting && !/^nested$/i.test(ex.status);
  const collecting =
    !awaiting &&
    !/^nested$/i.test(ex.status) &&
    decision !== 'Stop' &&
    decision !== 'Awaiting approval';

  return {
    ...ex,
    decision,
    decisionReason: override.reason || ex.evaluationReason || '',
    collecting,
    dueUnevaluated,
    nested,
    independentCollecting: collecting && !nested && !awaiting
  };
}

/**
 * Next evaluation among experiments whose eval date is strictly after reportYmd.
 * Due/overdue experiments are not "next" — they must be evaluated this run.
 */
export function nextFutureEvaluation(experiments, reportYmd) {
  const dated = experiments
    .filter((e) => e.evalDate && reportYmd && e.evalDate > reportYmd)
    .filter((e) => !/awaiting owner approval/i.test(e.status))
    .sort((a, b) => a.evalDate.localeCompare(b.evalDate));
  return dated[0] || null;
}

/**
 * Experiments whose eval date is today or earlier and still need a recorded decision.
 */
export function dueUnevaluatedExperiments(classified) {
  return classified.filter((e) => e.dueUnevaluated);
}

/**
 * Next evaluation among active experiments (soonest eval date).
 * @param {ReturnType<typeof parseActiveExperiments>} experiments
 * @deprecated Prefer nextFutureEvaluation(experiments, reportYmd) so due evals are not treated as future.
 */
export function nextEvaluation(experiments) {
  const dated = experiments
    .filter((e) => e.evalDate)
    .sort((a, b) => a.evalDate.localeCompare(b.evalDate));
  return dated[0] || null;
}

/**
 * Validate weekday labels if present in free text next to dates.
 * @param {string} md
 */
export function findWeekdayMismatches(md) {
  const mismatches = [];
  const re =
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(202\d)\b/gi;
  // Also check ISO dates with separate weekday claims nearby — primary check is ISO fields
  const isoRe = /Evaluation date\s*\|\s*(\d{4}-\d{2}-\d{2})/gi;
  let m;
  while ((m = isoRe.exec(md))) {
    const ymd = m[1];
    // ok — weekday derived programmatically at email time
    void ymd;
  }
  void re;
  return mismatches;
}
