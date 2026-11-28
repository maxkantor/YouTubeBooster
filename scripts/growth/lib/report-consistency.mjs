/**
 * Deterministic consistency checks before Admin growth-report email dispatch.
 * Agent notes / free-form decision text cannot override CRM or safety state.
 */

/**
 * @param {{
 *   dist?: object,
 *   decision?: string,
 *   notes?: string,
 *   subject?: string
 * }} input
 * @returns {{ ok: boolean, errors: string[], warnings: string[], dist: object, decision: string, notes: string }}
 */
export function validateGrowthReportConsistency(input = {}) {
  const errors = [];
  const warnings = [];
  const dist = { ...(input.dist || {}) };
  const needs = Number(dist.needsApproval ?? dist.crmBoard?.needsApproval ?? 0) || 0;
  const ready = Number(
    dist.inventory?.readyToSend ?? dist.crmBoard?.readyToSend ?? dist.pipeline?.readyToSend ?? 0
  ) || 0;
  const pause = String(dist.automaticPauseReason || '');
  const paused = Boolean(pause) || /unsubscribe_rate|bounce_rate|complaint_rate|SAFETY_PAUSED|DELIVERABILITY/i.test(
    String(dist.cohort?.rampBlockReason || dist.deliverability?.nextRampDecision || '')
  );
  const decisionIn = String(input.decision || '');
  const notesIn = String(input.notes || '');
  const subjectIn = String(input.subject || '');
  const combined = `${decisionIn}\n${notesIn}\n${subjectIn}`;

  // 1) Blocking approval requires real CRM queue depth.
  if (dist.blockingApproval === true && needs <= 0) {
    errors.push('blockingApproval=true but CRM needsApproval=0');
    dist.blockingApproval = false;
    if (!paused) dist.requiredOwnerApproval = 'none';
  }
  if (/BLOCKING\s+APPROVAL|BLOCKING OWNER APPROVAL|APR-\d{8}/i.test(combined) && needs <= 0) {
    errors.push('narrative requests owner approval without eligible CRM approval records');
  }
  if (/bowlofdelicious|thecafesucrefarine/i.test(combined) && needs <= 0) {
    errors.push('named approval package references prospects while needsApproval=0');
  }

  // 2) Safety pause ⇒ capacity 0; never recommend clearing from narrative alone.
  if (paused) {
    dist.dailyRemaining = 0;
    if (Number(dist.dailyRemaining) !== 0) errors.push('safety pause with non-zero dailyRemaining');
    if (/clear (the )?(safety |deliverability )?pause|re-enable sends|resume (sending|outreach)/i.test(combined)
      && !/owner-authorized|manual owner/i.test(combined)) {
      errors.push('narrative recommends clearing deliverability pause');
    }
    if (!/DELIVERABILITY|SAFETY|pause/i.test(String(dist.requiredOwnerApproval || ''))) {
      dist.requiredOwnerApproval =
        'Review deliverability pause before re-enabling sends (owner-authorized only; thresholds unchanged)';
    }
    dist.blockingApproval = false;
  }

  // 3) Click period consistency: lifetime must not equal "today" display when today is 0.
  const today = dist.clicks?.today;
  const life = dist.clicks?.lifetime ?? dist.outreachFunnel?.clicked;
  if (Number(today) === 0 && Number(life) > 0) {
    const attr = String(dist.attributedVisits || '');
    if (/^1 COOK-001 attributed click(?!s?\s*\()/i.test(attr) || /clicks today/i.test(attr) === false && /^1 /.test(attr)) {
      warnings.push('attributedVisits may be presenting lifetime clicks without period label');
    }
    if (Number(dist.cohort?.auditClicks) === Number(life) && Number(dist.sesAcceptedThisRun || 0) === 0) {
      errors.push('cohort.auditClicks used lifetime clicks while SES accepted this run is 0');
      dist.cohort = { ...(dist.cohort || {}), auditClicks: 0 };
    }
  }

  // 4) Site-wide GA4 audit starts must not appear as 0 in activations when scoreboard has N.
  const siteAudits = dist._siteWideAuditStarts7d;
  if (typeof siteAudits === 'number' && siteAudits > 0) {
    const act = String(dist.activations || '');
    if (/site-wide 7d GA4:\s*0\b/i.test(act)) {
      errors.push(`activations shows site-wide GA4 audit starts 0 but metrics have ${siteAudits}`);
    }
  }

  // 5) Suppressed / empty ready queue cannot be framed as sendable approval.
  if (ready <= 0 && needs <= 0 && /approve (and )?send|ready to send these/i.test(combined)) {
    errors.push('narrative implies sendable package with readyToSend=0 and needsApproval=0');
  }

  let decision = decisionIn;
  let notes = notesIn;
  if (errors.length) {
    // Strip unsafe invented packages from notes; keep a short failure summary.
    notes = notes
      .replace(/APR-\d{8}[^\s]*/gi, '[rejected-nonexistent-approval-id]')
      .replace(/clear (the )?(COOK-001 )?(safety |deliverability )?pause/gi, 'preserve safety pause');
    if (/BLOCKING/i.test(decision) && needs <= 0) {
      decision = '';
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    dist,
    decision,
    notes
  };
}

/**
 * Metric helper: prefer canonical audit_starts, fall back to raw event name shapes.
 */
export function metricNumber(m, ...keys) {
  if (!m || typeof m !== 'object') return 0;
  for (const k of keys) {
    const v = m[k];
    if (v && typeof v === 'object' && 'value' in v) {
      const n = Number(v.value);
      if (Number.isFinite(n)) return n;
    }
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
