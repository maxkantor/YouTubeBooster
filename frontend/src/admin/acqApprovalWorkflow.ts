import type { AcqAdminProspect } from '../types';

export type AcqWorkflowStatus =
  | 'EMAIL_REQUIRED'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'READY_FOR_APPROVAL'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'COOLDOWN'
  | 'REJECTED'
  | 'SENT'
  | 'REPLIED'
  | 'CONVERTED'
  | 'OTHER';

export type AcqPrimaryAction =
  | 'find_email'
  | 'verify_email'
  | 'review'
  | 'approve'
  | 'send'
  | 'scheduled'
  | 'view'
  | 'view_thread'
  | 'reply'
  | 'reconsider'
  | 'prepare_draft';

export type AcqWorkflowInfo = {
  status: AcqWorkflowStatus;
  label: string;
  canSelectForApproval: boolean;
  canApprove: boolean;
  canSendNow: boolean;
  canUnapprove: boolean;
  canReject: boolean;
  canOverrideCooldown: boolean;
  checkboxDisabledReason: string | null;
  whyHere: string;
  currentStatusAnswer: string;
  nextStep: string;
  whatICanDo: string;
  cooldownEndsAt: string | null;
  primaryAction: AcqPrimaryAction;
  primaryActionLabel: string;
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
  const s = (row.public.contactStatus || '').toLowerCase();
  return s === 'verified_public' || s === 'admin_attested' || row.adminAttestedContact === true;
}

/** Matches backend ApproveBatchAsync prerequisites (UI-side). */
export function isReadyForApproval(row: AcqAdminProspect): boolean {
  const p = row.public;
  if (p.previewPlaceholder) return false;
  const outreach = (p.outreachStatus || '').toLowerCase();
  if (outreach === 'approved' || (p.approvalStatus || '').toLowerCase() === 'approved') return false;
  if (
    ['rejected', 'suppressed', 'bounced', 'complained', 'unsubscribed', 'customer', 'sent', 'delivered', 'replied', 'needs_review'].includes(
      outreach
    )
  ) {
    return false;
  }
  if (!isVerifiedPublicContact(row)) return false;
  if (!(p.subject || '').trim() || !(p.observation || '').trim()) return false;
  if (!(row.body || '').trim()) return false;
  const blob = `${p.subject || ''}\n${row.body || ''}`;
  if (/\bI'm Max\b/i.test(blob) || /Founder,\s*YouTubeBooster/i.test(blob) || /\bI ran .+ through YouTubeBooster/i.test(blob)) {
    return false;
  }
  return true;
}

export function cooldownEndsAt(
  lastContactedAt: string | null | undefined,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  overrideUntil?: string | null
): Date | null {
  if (overrideUntil) {
    const o = new Date(overrideUntil).getTime();
    if (!Number.isNaN(o) && o > nowMs) return null;
  }
  if (!lastContactedAt) return null;
  const last = new Date(lastContactedAt).getTime();
  if (Number.isNaN(last)) return null;
  const ends = last + cooldownDays * 86400000;
  if (ends <= nowMs) return null;
  return new Date(ends);
}

export function resolveAcqWorkflow(
  row: AcqAdminProspect,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): AcqWorkflowInfo {
  const p = row.public;
  const outreach = (p.outreachStatus || '').toLowerCase();
  const ends = cooldownEndsAt(row.lastContactedAt, cooldownDays, nowMs, row.cooldownOverrideUntil);
  const endsIso = ends ? ends.toISOString() : null;
  const endsLabel = ends ? ends.toLocaleString() : null;

  const base = {
    canSelectForApproval: false,
    canApprove: false,
    canSendNow: false,
    canUnapprove: false,
    canReject: true,
    canOverrideCooldown: false,
    checkboxDisabledReason: null as string | null,
    cooldownEndsAt: endsIso
  };

  if (['rejected', 'suppressed', 'bounced', 'complained', 'unsubscribed'].includes(outreach)) {
    return {
      ...base,
      status: 'REJECTED',
      label: outreach === 'rejected' ? 'REJECTED' : outreach.toUpperCase(),
      canReject: false,
      checkboxDisabledReason: 'This creator is suppressed or rejected and cannot be approved.',
      whyHere: 'This creator is blocked from outreach (rejected or suppressed).',
      currentStatusAnswer: outreach.toUpperCase(),
      nextStep: 'No automatic outreach. Reconsider only if the block was a mistake.',
      whatICanDo: 'Reconsider to move back toward the pipeline, or leave blocked.',
      primaryAction: 'reconsider',
      primaryActionLabel: 'Reconsider'
    };
  }

  if (ends) {
    return {
      ...base,
      status: 'COOLDOWN',
      label: 'COOLDOWN',
      canOverrideCooldown: true,
      canReject: true,
      checkboxDisabledReason: `In cooldown until ${endsLabel}.`,
      whyHere: 'This creator was already contacted recently.',
      currentStatusAnswer: `COOLDOWN until ${endsLabel}`,
      nextStep: `Automatic re-evaluation after ${endsLabel}. Follow-ups may send if already approved and due.`,
      whatICanDo: 'View previous outreach, reject, or (rarely) override cooldown with confirmation.',
      primaryAction: 'view',
      primaryActionLabel: 'View'
    };
  }

  if (outreach === 'customer') {
    return {
      ...base,
      status: 'CONVERTED',
      label: 'CONVERTED',
      canReject: false,
      checkboxDisabledReason: 'Already converted.',
      whyHere: 'This creator converted to a paid customer.',
      currentStatusAnswer: 'CONVERTED (paid)',
      nextStep: 'No outreach action needed.',
      whatICanDo: 'View history only.',
      primaryAction: 'view',
      primaryActionLabel: 'View'
    };
  }

  if (outreach === 'replied' || outreach === 'interested') {
    return {
      ...base,
      status: 'REPLIED',
      label: 'REPLIED',
      whyHere: 'This creator replied to outreach.',
      currentStatusAnswer: 'REPLIED',
      nextStep: 'Respond from Inbox / support thread.',
      whatICanDo: 'Open the thread and reply manually.',
      primaryAction: 'reply',
      primaryActionLabel: 'Reply'
    };
  }

  if (outreach === 'sent' || outreach === 'delivered' || outreach === 'clicked' || outreach.startsWith('audit')) {
    return {
      ...base,
      status: 'SENT',
      label: outreach === 'sent' || outreach === 'delivered' ? outreach.toUpperCase() : 'SENT',
      checkboxDisabledReason: 'Already sent.',
      whyHere: 'Outreach was already sent (SES accepted).',
      currentStatusAnswer: outreach.toUpperCase(),
      nextStep: 'Wait for click / audit / reply. Follow-ups run automatically when due.',
      whatICanDo: 'View thread and history.',
      primaryAction: 'view_thread',
      primaryActionLabel: 'View Thread'
    };
  }

  if (outreach === 'approved' || (p.approvalStatus || '').toLowerCase() === 'approved') {
    const readyNow = sendingEnabled;
    return {
      ...base,
      status: 'APPROVED',
      label: 'APPROVED',
      canSendNow: readyNow,
      canUnapprove: true,
      checkboxDisabledReason: 'Already approved.',
      whyHere: 'You approved this creator for initial outreach.',
      currentStatusAnswer: readyNow ? 'APPROVED — ready to send' : 'APPROVED — sending disabled',
      nextStep: readyNow
        ? 'Send now, or wait for the weekday sender (daily limit + gates still apply).'
        : 'Enable marketing sending, then Send Now or wait for the scheduler.',
      whatICanDo: readyNow
        ? 'Send Now, edit message (requires re-approve), unapprove, or reject.'
        : 'Unapprove, edit message, or reject. Sending is currently disabled.',
      primaryAction: readyNow ? 'send' : 'scheduled',
      primaryActionLabel: readyNow ? 'Send' : 'Scheduled'
    };
  }

  if (!hasUsablePublicEmail(row)) {
    return {
      ...base,
      status: 'EMAIL_REQUIRED',
      label: 'EMAIL REQUIRED',
      checkboxDisabledReason: 'Verified public email required before approval.',
      whyHere: 'In the pipeline but no usable public contact email.',
      currentStatusAnswer: 'EMAIL REQUIRED',
      nextStep: 'Find a public business contact, or add one manually with attestation.',
      whatICanDo: 'Find Email, Add Email Manually, or Reject.',
      primaryAction: 'find_email',
      primaryActionLabel: 'Find Email'
    };
  }

  if (!isVerifiedPublicContact(row)) {
    return {
      ...base,
      status: 'EMAIL_VERIFICATION_REQUIRED',
      label: 'EMAIL VERIFICATION REQUIRED',
      checkboxDisabledReason: 'Email must be verified from a public source before approval.',
      whyHere: 'An email exists but is not verified / attested yet.',
      currentStatusAnswer: 'EMAIL VERIFICATION REQUIRED',
      nextStep: 'Verify the public source URL, or attest a manual business contact.',
      whatICanDo: 'Verify Email, Add Email Manually, or Reject.',
      primaryAction: 'verify_email',
      primaryActionLabel: 'Verify Email'
    };
  }

  if (outreach === 'needs_review') {
    return {
      ...base,
      status: 'NEEDS_REVIEW',
      label: 'NEEDS REVIEW',
      checkboxDisabledReason: 'Personalization is too weak for outreach.',
      whyHere: 'No sufficiently specific channel finding — quality gate blocked the draft.',
      currentStatusAnswer: 'NEEDS REVIEW',
      nextStep: 'Re-inspect the channel for stronger evidence, or reject.',
      whatICanDo: 'Prepare Draft (retry), Re-inspect, or Reject.',
      primaryAction: 'prepare_draft',
      primaryActionLabel: 'Retry Draft'
    };
  }

  if (!isReadyForApproval(row)) {
    const needsDraft = !(p.subject || '').trim() || !(row.body || '').trim() || !(p.observation || '').trim();
    return {
      ...base,
      status: 'OTHER',
      label: needsDraft ? 'DRAFT INCOMPLETE' : 'QUALIFIED',
      checkboxDisabledReason: p.previewPlaceholder
        ? 'Placeholder inspection — cannot approve.'
        : 'Complete the outreach draft before approval.',
      whyHere: p.previewPlaceholder
        ? 'Inspection returned placeholder data.'
        : 'Contact is verified; outreach draft still needs work.',
      currentStatusAnswer: needsDraft ? 'DRAFT INCOMPLETE' : 'QUALIFIED',
      nextStep: 'Prepare or edit the draft, then approve when READY FOR APPROVAL.',
      whatICanDo: 'Prepare Draft, Review, or Reject.',
      primaryAction: needsDraft ? 'prepare_draft' : 'review',
      primaryActionLabel: needsDraft ? 'Prepare Draft' : 'Review'
    };
  }

  return {
    ...base,
    status: 'READY_FOR_APPROVAL',
    label: 'READY FOR APPROVAL',
    canSelectForApproval: true,
    canApprove: true,
    whyHere: 'Verified contact + complete draft — waiting for your approval.',
    currentStatusAnswer: 'READY FOR APPROVAL',
    nextStep: 'Review the message, then Approve & Queue. Nothing sends until you approve.',
    whatICanDo: 'Approve & Queue, Edit Message, or Reject.',
    primaryAction: 'approve',
    primaryActionLabel: 'Approve'
  };
}

export function countWorkflowStatuses(
  rows: AcqAdminProspect[],
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): Record<AcqWorkflowStatus, number> {
  const counts: Record<AcqWorkflowStatus, number> = {
    EMAIL_REQUIRED: 0,
    EMAIL_VERIFICATION_REQUIRED: 0,
    READY_FOR_APPROVAL: 0,
    NEEDS_REVIEW: 0,
    APPROVED: 0,
    COOLDOWN: 0,
    REJECTED: 0,
    SENT: 0,
    REPLIED: 0,
    CONVERTED: 0,
    OTHER: 0
  };
  for (const row of rows) {
    counts[resolveAcqWorkflow(row, cooldownDays, nowMs, sendingEnabled).status] += 1;
  }
  return counts;
}

export function filterByWorkflowStatus(
  rows: AcqAdminProspect[],
  status: AcqWorkflowStatus | 'all',
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): AcqAdminProspect[] {
  if (status === 'all') return rows;
  return rows.filter((r) => resolveAcqWorkflow(r, cooldownDays, nowMs, sendingEnabled).status === status);
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
