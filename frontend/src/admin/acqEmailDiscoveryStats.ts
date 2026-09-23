import type { AcqAdminProspect, AcqEmailDiscoveryJob, AcqEmailDiscoveryItemResult } from '../types';
import { isVerifiedPublicContact, resolveAcqWorkflow, type AcqWorkflowStatus } from './acqApprovalWorkflow';

export type EmailDiscoveryNormOutcome =
  | 'FOUND'
  | 'NEEDS_REVIEW'
  | 'NOT_FOUND'
  | 'ALREADY_HAS_EMAIL'
  | 'SKIPPED_BACKOFF'
  | 'SKIPPED_OTHER'
  | 'ERROR';

export function normalizeEmailDiscoveryOutcome(outcome: string | null | undefined): EmailDiscoveryNormOutcome {
  const o = (outcome || '').toLowerCase();
  if (o === 'found') return 'FOUND';
  if (o === 'review') return 'NEEDS_REVIEW';
  if (o === 'not_found') return 'NOT_FOUND';
  if (o === 'skipped_existing') return 'ALREADY_HAS_EMAIL';
  if (o === 'skipped_backoff') return 'SKIPPED_BACKOFF';
  if (o.startsWith('skipped')) return 'SKIPPED_OTHER';
  if (o === 'failed' || o === 'error' || o === 'duplicate_email') return 'ERROR';
  return 'SKIPPED_OTHER';
}

/** Mirrors backend NeedsEmailDiscovery — wider than UI "missing email". */
export function isBackendNeedsEmailDiscovery(row: AcqAdminProspect): boolean {
  if (isVerifiedPublicContact(row) && looksLikeEmail(row.publicBusinessEmail)) return false;
  const contactType = (row.public.contactType || '').toLowerCase();
  if (contactType === 'form_only') return false;
  const outreach = (row.public.outreachStatus || '').toLowerCase();
  if (outreach === 'rejected') return false;
  const suppression = (row.public as { suppressionStatus?: string | null }).suppressionStatus;
  if (suppression && suppression.toLowerCase() !== 'none') return false;
  return true;
}

export function isDiscoveryBackoff(row: AcqAdminProspect, nowMs = Date.now()): boolean {
  const next = row.public.contactResearchNextAt;
  if (!next) return false;
  const t = new Date(next).getTime();
  return Number.isFinite(t) && t > nowMs;
}

export function workflowStatusOf(
  row: AcqAdminProspect,
  cooldownDays = 14,
  nowMs = Date.now(),
  sendingEnabled = true
): AcqWorkflowStatus {
  return resolveAcqWorkflow(row, cooldownDays, nowMs, sendingEnabled).status;
}

export function isUiMissingEmail(
  row: AcqAdminProspect,
  cooldownDays = 14,
  nowMs = Date.now(),
  sendingEnabled = true
): boolean {
  const s = workflowStatusOf(row, cooldownDays, nowMs, sendingEnabled);
  return s === 'EMAIL_REQUIRED' || s === 'NOT_FOUND';
}

export type DiscoveryCensus = {
  missingEmail: number;
  eligibleNow: number;
  inBackoff: number;
  alreadyAttempted: number;
  needsReview: number;
  noEmailFound: number;
  jobCandidates: number;
  extraJobOnly: number;
  eligibleIds: string[];
  missingIds: string[];
  backoffIds: string[];
  earliestBackoffAt: string | null;
  latestBackoffAt: string | null;
};

export function censusDiscovery(
  rows: AcqAdminProspect[],
  cooldownDays = 14,
  nowMs = Date.now(),
  sendingEnabled = true
): DiscoveryCensus {
  const missing: AcqAdminProspect[] = [];
  const eligible: AcqAdminProspect[] = [];
  const backoff: AcqAdminProspect[] = [];
  let alreadyAttempted = 0;
  let needsReview = 0;
  let noEmailFound = 0;
  let jobCandidates = 0;

  for (const row of rows) {
    const status = workflowStatusOf(row, cooldownDays, nowMs, sendingEnabled);
    if (status === 'REVIEW_EMAIL') needsReview++;
    if (status === 'NOT_FOUND') noEmailFound++;
    if (isBackendNeedsEmailDiscovery(row)) jobCandidates++;

    if (!isUiMissingEmail(row, cooldownDays, nowMs, sendingEnabled)) continue;
    missing.push(row);
    const attempted =
      !!row.public.contactResearchLastAt ||
      !!row.public.contactResearchNextAt ||
      !!(row.public.contactDiscoveryResult && row.public.contactDiscoveryResult !== 'none');
    if (attempted) alreadyAttempted++;
    if (isDiscoveryBackoff(row, nowMs)) backoff.push(row);
    else eligible.push(row);
  }

  const backoffTimes = backoff
    .map((r) => r.public.contactResearchNextAt)
    .filter((iso): iso is string => !!iso)
    .sort();

  return {
    missingEmail: missing.length,
    eligibleNow: eligible.length,
    inBackoff: backoff.length,
    alreadyAttempted,
    needsReview,
    noEmailFound,
    jobCandidates,
    extraJobOnly: Math.max(0, jobCandidates - missing.length),
    eligibleIds: eligible.map((r) => r.public.prospectId),
    missingIds: missing.map((r) => r.public.prospectId),
    backoffIds: backoff.map((r) => r.public.prospectId),
    earliestBackoffAt: backoffTimes[0] ?? null,
    latestBackoffAt: backoffTimes.length ? backoffTimes[backoffTimes.length - 1] : null
  };
}

export type DiscoveryJobTally = {
  candidates: number;
  evaluated: number;
  searched: number;
  found: number;
  review: number;
  notFound: number;
  failed: number;
  skippedBackoff: number;
  skippedOther: number;
  remaining: number;
};

export function tallyDiscoveryResults(results: AcqEmailDiscoveryItemResult[] | undefined): Omit<
  DiscoveryJobTally,
  'candidates' | 'evaluated' | 'remaining'
> {
  let searched = 0;
  let found = 0;
  let review = 0;
  let notFound = 0;
  let failed = 0;
  let skippedBackoff = 0;
  let skippedOther = 0;
  for (const r of results || []) {
    const norm = normalizeEmailDiscoveryOutcome(r.outcome);
    if (norm === 'SKIPPED_BACKOFF') skippedBackoff++;
    else if (norm === 'ALREADY_HAS_EMAIL' || norm === 'SKIPPED_OTHER') skippedOther++;
    else if (norm === 'FOUND' || norm === 'NEEDS_REVIEW' || norm === 'NOT_FOUND' || norm === 'ERROR') {
      searched++;
      if (norm === 'FOUND') found++;
      else if (norm === 'NEEDS_REVIEW') review++;
      else if (norm === 'NOT_FOUND') notFound++;
      else failed++;
    } else {
      skippedOther++;
    }
  }
  return { searched, found, review, notFound, failed, skippedBackoff, skippedOther };
}

export function summarizeDiscoveryJob(job: AcqEmailDiscoveryJob | null): DiscoveryJobTally | null {
  if (!job) return null;
  const candidates = job.prospectIds?.length ?? 0;
  const parts = tallyDiscoveryResults(job.results);
  const evaluated = job.results?.length ?? job.processed ?? 0;
  return {
    candidates,
    evaluated,
    remaining: Math.max(0, candidates - evaluated),
    ...parts
  };
}

export function formatDiscoveryRetryEt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
  return `${formatted} ET`;
}

export function hoursUntil(iso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || t <= nowMs) return null;
  return Math.max(1, Math.round((t - nowMs) / 3600000));
}

export function parseBackoffUntil(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const m = detail.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z|\d{4}-\d{2}-\d{2} [\d:]+Z)/);
  if (!m) return null;
  const raw = m[1].includes('T') ? m[1] : m[1].replace(' ', 'T');
  return formatDiscoveryRetryEt(raw.endsWith('Z') ? raw : `${raw}Z`);
}

export function outcomeLabel(outcome: string | null | undefined): string {
  return normalizeEmailDiscoveryOutcome(outcome);
}

export function emailDiscoveryErrorReason(detail: string | null | undefined): string {
  const d = (detail || '').trim();
  if (!d) return 'Discovery attempt failed';
  const dup = d.match(/^Duplicate of\s+(.+)/i);
  if (dup) return `Email already assigned to ${dup[1].trim()}`;
  if (/suppressed outreach/i.test(d)) return 'Outreach list blocked this address';
  if (/timeout|timed out/i.test(d)) return 'Discovery provider timeout';
  if (/unavailable|503|502|504/i.test(d)) return 'Validation provider unavailable';
  if (/persist|upsert|conditional/i.test(d)) return 'Persistence failed';
  if (d === 'not_found') return 'Creator record not found';
  return d.split('\n')[0].slice(0, 140);
}

export function emailDiscoveryJobTitle(
  status: string | undefined,
  tally: Pick<DiscoveryJobTally, 'searched' | 'found' | 'review' | 'notFound' | 'failed'> | null
): string {
  if ((status || '').toLowerCase() !== 'completed') return 'FINDING EMAILS';
  const failed = tally?.failed ?? 0;
  if (failed <= 0) return 'EMAIL SEARCH COMPLETE';
  const attempted = tally?.searched ?? 0;
  const otherOk = (tally?.found ?? 0) + (tally?.review ?? 0) + (tally?.notFound ?? 0);
  if (attempted > 0 && failed === attempted && otherOk === 0) return 'EMAIL SEARCH FAILED';
  return 'EMAIL SEARCH COMPLETED WITH ERRORS';
}

export function emailDiscoverySummaryLine(tally: DiscoveryJobTally): string {
  const bits = [`${tally.searched} attempted`];
  if (tally.found) bits.push(`${tally.found} found`);
  if (tally.review) bits.push(`${tally.review} need review`);
  if (tally.notFound) bits.push(`${tally.notFound} not found`);
  if (tally.failed) bits.push(`${tally.failed} error${tally.failed === 1 ? '' : 's'}`);
  if (tally.skippedBackoff) bits.push(`${tally.skippedBackoff} backoff`);
  return bits.join(' · ');
}

export function formatBackoffHorizon(iso: string | null | undefined, nowMs = Date.now()): string | null {
  const hours = hoursUntil(iso, nowMs);
  if (hours == null) return null;
  if (hours >= 48) {
    const days = Math.max(2, Math.round(hours / 24));
    return `approximately ${days} days`;
  }
  if (hours <= 1) return 'about an hour';
  return `approximately ${hours} hours`;
}

function looksLikeEmail(value: string | null | undefined): boolean {
  return !!value && value.includes('@');
}
