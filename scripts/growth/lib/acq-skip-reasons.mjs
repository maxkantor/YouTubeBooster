/**
 * Shared COOK-001 skip-reason normalization for daily growth reports.
 * Keep in sync with OutreachPolicy.NormalizeSkipReason / AggregateSkipReasons.
 */

export function normalizeSkipReason(raw) {
  const r = String(raw || '').trim().toLowerCase();
  if (r.startsWith('ses:')) return r.includes('reject') ? 'SES_REJECTED' : 'SES_ERROR';
  if (r.includes('health_stop')) {
    if (r.includes('bounce')) return 'SAFETY_PAUSED_BOUNCE';
    if (r.includes('complaint')) return 'SAFETY_PAUSED_COMPLAINT';
    if (r.includes('unsubscribe')) return 'SAFETY_PAUSED_UNSUBSCRIBE';
    return 'SAFETY_PAUSED';
  }
  if (r.includes('health_advisory')) {
    if (r.includes('unsubscribe')) return 'SAFETY_ADVISORY_UNSUBSCRIBE';
    if (r.includes('bounce')) return 'SAFETY_ADVISORY_BOUNCE';
    if (r.includes('complaint')) return 'SAFETY_ADVISORY_COMPLAINT';
    return 'SAFETY_ADVISORY';
  }
  const map = {
    cooldown: 'COOLDOWN',
    already_contacted: 'ALREADY_CONTACTED',
    idempotency: 'ALREADY_CONTACTED',
    public_email_unverified: 'INVALID_EMAIL',
    invalid_or_spamtrap: 'INVALID_EMAIL',
    suppressed: 'SUPPRESSED',
    unsubscribed: 'SUPPRESSED',
    hard_bounce: 'SUPPRESSED',
    existing_customer: 'SUPPRESSED',
    not_approved: 'NOT_APPROVED',
    approval_expired: 'NOT_APPROVED',
    approval_cap: 'NOT_APPROVED',
    approval_invalidated: 'NOT_APPROVED',
    daily_limit_reached: 'DAILY_LIMIT_REACHED',
    marketing_sending_disabled: 'MISSING_CONFIG',
    postal_address_missing: 'MISSING_CONFIG',
    from_email_unconfigured: 'MISSING_CONFIG',
    unsubscribe_signing_missing: 'MISSING_CONFIG',
    weekend_eastern: 'MISSING_CONFIG',
    score_below_70: 'NOT_QUALIFIED',
    stale_upload: 'NOT_QUALIFIED',
    subscriber_out_of_band: 'NOT_QUALIFIED',
    inspection_incomplete: 'NOT_QUALIFIED',
    preview_placeholder: 'NOT_QUALIFIED',
    draft_incomplete: 'NOT_QUALIFIED',
    content_hash_changed: 'NOT_QUALIFIED',
    pii_in_tags: 'NOT_QUALIFIED',
    complaint_pause: 'SUPPRESSED',
    // Bare rate tokens (from health_stop:* after slice) — hard pause codes only.
    bounce_rate: 'SAFETY_PAUSED_BOUNCE',
    complaint_rate: 'SAFETY_PAUSED_COMPLAINT',
    unsubscribe_rate: 'SAFETY_PAUSED_UNSUBSCRIBE'
  };
  return map[r] || 'NOT_QUALIFIED';
}

export function aggregateSkipReasons(reasons) {
  const counts = {};
  for (const line of reasons || []) {
    const raw = String(line);
    // Prefer full-line classification so health_stop / health_advisory are not
    // sliced to a bare rate and conflated with each other.
    if (/health_stop/i.test(raw) || /health_advisory/i.test(raw)) {
      const code = normalizeSkipReason(raw);
      counts[code] = (counts[code] || 0) + 1;
      continue;
    }
    let codePart = raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
    if (raw.toLowerCase().includes(':ses:')) {
      codePart = raw.slice(raw.toLowerCase().indexOf(':ses:') + 1);
    }
    const code = normalizeSkipReason(codePart);
    counts[code] = (counts[code] || 0) + 1;
  }
  return counts;
}

export function dominantSkipReason(counts) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return 'NONE';
  entries.sort((a, b) => b[1] - a[1]);
  return `${entries[0][0]} (${entries[0][1]})`;
}

/**
 * Scheduler/config "on" is not the same as distribution permitted.
 * Hard health stops and deliverability pause reasons block RUNNING.
 */
export function resolveAcquisitionSendingStatus({
  crmAutomaticSending = false,
  crmAutomaticPauseReason = null,
  reasons = [],
  healthReason = null,
  rampBlockReason = null
} = {}) {
  const reasonList = Array.isArray(reasons) ? reasons : [];
  const healthStop = reasonList.find((r) => /health_stop/i.test(String(r)));
  const resolvedHealthReason = healthReason
    || (healthStop ? String(healthStop).replace(/^.*health_stop:/i, '').trim() : null);
  const ramp = String(rampBlockReason || crmAutomaticPauseReason || resolvedHealthReason || '');
  const deliverabilityPaused =
    Boolean(resolvedHealthReason) ||
    /DELIVERABILITY|SAFETY_PAUSED|bounce_rate|complaint_rate|unsubscribe_rate/i.test(ramp) ||
    (crmAutomaticSending === false &&
      /DELIVERABILITY|SAFETY/i.test(String(crmAutomaticPauseReason || '')));

  const automaticSending = crmAutomaticSending === true && !deliverabilityPaused;
  const automaticPauseReason = deliverabilityPaused
    ? crmAutomaticPauseReason ||
      `DELIVERABILITY SAFETY PAUSE (${ramp || resolvedHealthReason || 'unknown'})`
    : crmAutomaticPauseReason || null;

  return {
    deliverabilityPaused,
    healthReason: resolvedHealthReason,
    automaticSending,
    automaticPauseReason,
    distributionPermitted: automaticSending && !deliverabilityPaused
  };
}
