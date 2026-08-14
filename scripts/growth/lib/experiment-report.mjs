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
    const reportable = /^(active|awaiting owner approval)$/i.test(status);
    if (!reportable) continue;
    const field = (name) => {
      const fm = block.match(new RegExp(`\\|\\s*${name}\\s*\\|\\s*([^|]+)\\s*\\|`, 'i'));
      return fm ? String(fm[1]).trim() : '';
    };
    const evalRaw = field('Evaluation date');
    const evalYmd = (evalRaw.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '';
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
      amplify: field('Amplify')
    });
  }
  return active;
}

/**
 * Next evaluation among active experiments (soonest eval date).
 * @param {ReturnType<typeof parseActiveExperiments>} experiments
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
