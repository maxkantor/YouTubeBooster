import type { AcqAdminProspect, AcqEmailDiscoveryJob, AcqEmailDiscoveryItemResult } from '../types';
import { isVerifiedPublicContact, resolveAcqWorkflow, type AcqWorkflowStatus } from './acqApprovalWorkflow';

const SEARCHED_OUTCOMES = new Set(['found', 'review', 'not_found', 'failed']);

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
    const o = (r.outcome || '').toLowerCase();
    if (o === 'skipped_backoff') skippedBackoff++;
    else if (o.startsWith('skipped')) skippedOther++;
    else if (SEARCHED_OUTCOMES.has(o)) {
      searched++;
      if (o === 'found') found++;
      else if (o === 'review') review++;
      else if (o === 'not_found') notFound++;
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
  const o = (outcome || '').toLowerCase();
  if (o === 'skipped_backoff') return 'BACKOFF';
  if (o === 'skipped_existing') return 'SKIPPED — HAS EMAIL';
  if (o === 'skipped_suppressed') return 'SKIPPED — SUPPRESSED';
  if (o.startsWith('skipped')) return 'SKIPPED';
  if (o === 'found') return 'FOUND';
  if (o === 'review') return 'NEEDS REVIEW';
  if (o === 'not_found') return 'NOT FOUND';
  if (o === 'failed') return 'ERROR';
  return (outcome || '—').toUpperCase();
}

function looksLikeEmail(value: string | null | undefined): boolean {
  return !!value && value.includes('@');
}
