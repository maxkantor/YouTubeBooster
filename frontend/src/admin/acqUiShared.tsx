import type { AcqWorkflowStatus } from './acqApprovalWorkflow';

export const WORKFLOW_FILTERS: { value: AcqWorkflowStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'EMAIL_REQUIRED', label: 'Email required' },
  { value: 'EMAIL_VERIFICATION_REQUIRED', label: 'Email verification required' },
  { value: 'READY_FOR_APPROVAL', label: 'Ready for approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'COOLDOWN', label: 'Cooldown' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SENT', label: 'Sent' },
  { value: 'REPLIED', label: 'Replies' },
  { value: 'OTHER', label: 'Other / draft incomplete' }
];

export const SKIP_LABELS: Record<string, string> = {
  NOT_QUALIFIED: 'Not qualified',
  INVALID_EMAIL: 'No verified email',
  ALREADY_CONTACTED: 'Already contacted',
  NOT_APPROVED: 'Awaiting approval',
  DAILY_LIMIT_REACHED: 'Daily limit',
  COOLDOWN: 'Cooldown',
  SUPPRESSED: 'Suppressed',
  MISSING_CONFIG: 'Config / sending gate',
  SES_REJECTED: 'SES rejected',
  SES_ERROR: 'SES error'
};

export function skipLabel(code: string) {
  return SKIP_LABELS[code] || code.replace(/_/g, ' ');
}

export function formatDt(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function workflowBadgeKind(status: AcqWorkflowStatus): 'ok' | 'warn' | 'bad' | 'info' | 'neutral' {
  switch (status) {
    case 'READY_FOR_APPROVAL':
      return 'ok';
    case 'APPROVED':
    case 'SENT':
    case 'REPLIED':
    case 'CONVERTED':
      return 'info';
    case 'EMAIL_REQUIRED':
    case 'EMAIL_VERIFICATION_REQUIRED':
    case 'COOLDOWN':
      return 'warn';
    case 'REJECTED':
      return 'bad';
    default:
      return 'neutral';
  }
}

export function rateOrNa(numerator: number, denominator: number): string {
  if (denominator < 20) return 'Not enough sends to calculate a reliable rate.';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** Production snapshot defaults for Overview copy when summary is still loading. */
export const ACQ_OVERVIEW_DEFAULTS = {
  currentlyApprovedWaitingToSend: 8,
  approvedEligibleNow: 2,
  sendEligible: 2,
  blockedByCooldown: 4,
  blockedByQualification: 2,
  sentToday: 0,
  dailyLimit: 10,
  dailyRemaining: 10
} as const;

export function whySelected(p: {
  recentUploadAt?: string | null;
  subscriberRange?: string | null;
  observation?: string | null;
  contactStatus?: string | null;
  contactSourceUrl?: string | null;
}): string {
  const bits: string[] = [];
  if (p.recentUploadAt) bits.push('Active creator');
  if (p.subscriberRange && p.subscriberRange !== 'unknown') bits.push(`Audience ${p.subscriberRange}`);
  if (p.observation) bits.push(p.observation);
  if (p.contactStatus === 'verified_public') bits.push('Public business contact found');
  else if (!p.contactSourceUrl) bits.push('CONTACT NEEDED');
  return bits.join(' · ') || '—';
}
