import type { AcqAdminProspect } from '../types';

export type AcqWorkflowStatus =
  | 'EMAIL_REQUIRED'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED'
  | 'COOLDOWN'
  | 'REJECTED'
  | 'SENT'
  | 'CONVERTED'
  | 'OTHER';

export type AcqWorkflowInfo = {
  status: AcqWorkflowStatus;
  label: string;
  canSelectForApproval: boolean;
  canApprove: boolean;
  checkboxDisabledReason: string | null;
  whyHere: string;
  canApproveAnswer: string;
  nextStep: string;
  cooldownEndsAt: string | null;
  primaryAction: 'find_email' | 'verify_email' | 'approve' | 'view' | 'none';
};

const DEFAULT_COOLDOWN_DAYS = 14;

function looksLikeEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  const e = value.trim();
  return e.includes('@') && e.includes('.') && !e.includes(' ');
}

export function hasUsablePublicEmail(row: AcqAdminProspect): boolean {
  return looksLikeEmail(row.publicBusinessEmail);
}

export function isVerifiedPublicContact(row: AcqAdminProspect): boolean {
  return (row.public.contactStatus || '').toLowerCase() === 'verified_public';
}

/** Matches backend ApproveBatchAsync prerequisites (UI-side). */
export function isReadyForApproval(row: AcqAdminProspect): boolean {
  const p = row.public;
  if (p.previewPlaceholder) return false;
  const outreach = (p.outreachStatus || '').toLowerCase();
  if (outreach === 'approved' || (p.approvalStatus || '').toLowerCase() === 'approved') return false;
  if (['rejected', 'suppressed', 'bounced', 'complained', 'unsubscribed', 'customer', 'sent', 'delivered'].includes(outreach)) {
    return false;
  }
  if (!isVerifiedPublicContact(row)) return false;
  if (!(p.subject || '').trim() || !(p.observation || '').trim()) return false;
  // Backend requires Body; list/detail payloads expose it on the admin DTO.
  if (!(row.body || '').trim()) return false;
  return true;
}

export function cooldownEndsAt(
  lastContactedAt: string | null | undefined,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now()
): Date | null {
  if (!lastContactedAt) return null;
  const last = new Date(lastContactedAt).getTime();
  if (Number.isNaN(last)) return null;
  const ends = last + cooldownDays * 86400000;
  if (ends <= nowMs) return null;
  return new Date(ends);
}

export function isInCooldown(
  lastContactedAt: string | null | undefined,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now()
): boolean {
  return cooldownEndsAt(lastContactedAt, cooldownDays, nowMs) != null;
}

export function resolveAcqWorkflow(
  row: AcqAdminProspect,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now()
): AcqWorkflowInfo {
  const p = row.public;
  const outreach = (p.outreachStatus || '').toLowerCase();
  const ends = cooldownEndsAt(row.lastContactedAt, cooldownDays, nowMs);
  const endsIso = ends ? ends.toISOString() : null;
  const endsLabel = ends ? ends.toLocaleString() : null;

  if (['rejected', 'suppressed', 'bounced', 'complained', 'unsubscribed'].includes(outreach)) {
    return {
      status: 'REJECTED',
      label: 'REJECTED',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: 'This creator is suppressed or rejected and cannot be approved.',
      whyHere: 'This creator is blocked from outreach (rejected or suppressed).',
      canApproveAnswer: 'No — outreach is blocked for this creator.',
      nextStep: 'No approval action. Review suppression or rejection details if needed.',
      cooldownEndsAt: endsIso,
      primaryAction: 'view'
    };
  }

  if (ends) {
    return {
      status: 'COOLDOWN',
      label: 'COOLDOWN',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: `In cooldown until ${endsLabel}.`,
      whyHere: 'This creator was already contacted recently.',
      canApproveAnswer: 'No — wait for cooldown to end before the next send attempt.',
      nextStep: `Eligible again after ${endsLabel}. Scheduled sending will re-evaluate automatically.`,
      cooldownEndsAt: endsIso,
      primaryAction: 'view'
    };
  }

  if (outreach === 'customer') {
    return {
      status: 'CONVERTED',
      label: 'CONVERTED',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: 'Already converted.',
      whyHere: 'This creator converted to a customer.',
      canApproveAnswer: 'No — already converted.',
      nextStep: 'No outreach action needed.',
      cooldownEndsAt: null,
      primaryAction: 'view'
    };
  }

  if (outreach === 'sent' || outreach === 'delivered') {
    return {
      status: 'SENT',
      label: outreach.toUpperCase(),
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: 'Already sent.',
      whyHere: 'An outreach email was already accepted by SES for this creator.',
      canApproveAnswer: 'No — already sent.',
      nextStep: 'Wait for delivery/reply events. Re-send only after cooldown via the scheduled sender.',
      cooldownEndsAt: null,
      primaryAction: 'view'
    };
  }

  if (outreach === 'approved' || (p.approvalStatus || '').toLowerCase() === 'approved') {
    return {
      status: 'APPROVED',
      label: 'APPROVED',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: 'Already approved.',
      whyHere: 'This creator is approved and queued for the scheduled COOK-001 sender.',
      canApproveAnswer: 'Already approved — no further approval needed.',
      nextStep: 'Scheduled sending will attempt SES subject to existing send gates (limits, cooldown, qualification).',
      cooldownEndsAt: null,
      primaryAction: 'view'
    };
  }

  if (!hasUsablePublicEmail(row)) {
    return {
      status: 'EMAIL_REQUIRED',
      label: 'EMAIL REQUIRED',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: 'Verified public email required before approval.',
      whyHere: 'This creator is in the COOK-001 pipeline but has no usable public contact email.',
      canApproveAnswer: 'No — cannot approve yet because no verified public contact email is available.',
      nextStep: 'Find a public business mailto on their site, then verify it here.',
      cooldownEndsAt: null,
      primaryAction: 'find_email'
    };
  }

  if (!isVerifiedPublicContact(row)) {
    return {
      status: 'EMAIL_VERIFICATION_REQUIRED',
      label: 'EMAIL VERIFICATION REQUIRED',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: 'Email must be verified from a public source before approval.',
      whyHere: 'An email address exists, but it is not yet recorded as a verified public business contact.',
      canApproveAnswer: 'No — verify the public email source first.',
      nextStep: 'Confirm the mailto on an official page, then run Verify Email with source URL and contact type.',
      cooldownEndsAt: null,
      primaryAction: 'verify_email'
    };
  }

  // Verified email but draft incomplete — not approvable yet
  if (!isReadyForApproval(row)) {
    return {
      status: 'OTHER',
      label: 'DRAFT INCOMPLETE',
      canSelectForApproval: false,
      canApprove: false,
      checkboxDisabledReason: p.previewPlaceholder
        ? 'Placeholder inspection — cannot approve.'
        : 'Complete the outreach draft before approval.',
      whyHere: p.previewPlaceholder
        ? 'Inspection returned placeholder data.'
        : 'Email is verified, but the outreach draft is not complete enough to approve.',
      canApproveAnswer: 'No — finish draft preparation first.',
      nextStep: 'Prepare draft (subject + body + observation), then approve when READY FOR APPROVAL.',
      cooldownEndsAt: null,
      primaryAction: 'verify_email'
    };
  }

  return {
    status: 'READY_FOR_APPROVAL',
    label: 'READY FOR APPROVAL',
    canSelectForApproval: true,
    canApprove: true,
    checkboxDisabledReason: null,
    whyHere: 'This creator has a verified public email and a complete outreach draft.',
    canApproveAnswer: 'Yes — this creator meets the requirements for approval.',
    nextStep: 'Approve & Queue. Scheduled sending still applies all existing SES send gates.',
    cooldownEndsAt: null,
    primaryAction: 'approve'
  };
}

export function countWorkflowStatuses(
  rows: AcqAdminProspect[],
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now()
): Record<AcqWorkflowStatus, number> {
  const counts: Record<AcqWorkflowStatus, number> = {
    EMAIL_REQUIRED: 0,
    EMAIL_VERIFICATION_REQUIRED: 0,
    READY_FOR_APPROVAL: 0,
    APPROVED: 0,
    COOLDOWN: 0,
    REJECTED: 0,
    SENT: 0,
    CONVERTED: 0,
    OTHER: 0
  };
  for (const row of rows) {
    counts[resolveAcqWorkflow(row, cooldownDays, nowMs).status] += 1;
  }
  return counts;
}

export function filterByWorkflowStatus(
  rows: AcqAdminProspect[],
  status: AcqWorkflowStatus | 'all',
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now()
): AcqAdminProspect[] {
  if (status === 'all') return rows;
  return rows.filter((r) => resolveAcqWorkflow(r, cooldownDays, nowMs).status === status);
}

export function selectEligibleIds(
  rows: AcqAdminProspect[],
  currentlySelected: string[],
  id: string,
  max = 25
): string[] {
  const row = rows.find((r) => r.public.prospectId === id);
  if (!row || !resolveAcqWorkflow(row).canSelectForApproval) return currentlySelected;
  if (currentlySelected.includes(id)) return currentlySelected.filter((x) => x !== id);
  if (currentlySelected.length >= max) return currentlySelected;
  return [...currentlySelected, id];
}

export function selectAllEligible(rows: AcqAdminProspect[], max = 25): string[] {
  return rows
    .filter((r) => resolveAcqWorkflow(r).canSelectForApproval)
    .slice(0, max)
    .map((r) => r.public.prospectId);
}
