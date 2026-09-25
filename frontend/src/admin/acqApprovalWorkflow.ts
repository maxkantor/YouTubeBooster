import type { AcqAdminProspect } from '../types';

export type AcqWorkflowStatus =
  | 'EMAIL_REQUIRED'
  | 'EMAIL_FOUND'
  | 'REVIEW_EMAIL'
  | 'NOT_FOUND'
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
  | 'review_email'
  | 'retry_email'
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
/**
 * Soft gate: complete personalized draft ready for human review (Needs Approval tab).
 * Does NOT enforce COOK-001 score / audience band — those block Approve & Send only.
 */
export function draftReviewBlockReason(row: AcqAdminProspect): string | null {
  const p = row.public;
  if (p.previewPlaceholder) return 'Placeholder inspection — cannot approve.';
  if ((p.outreachStatus || '').toLowerCase() === 'needs_review') {
    return 'Personalization is too weak — retry draft first.';
  }
  if (!isVerifiedPublicContact(row)) return 'Verified public email required.';
  if (!(p.subject || '').trim() || !(row.body || '').trim() || !(p.observation || '').trim()) {
    return 'Complete draft required.';
  }
  const blob = `${p.subject || ''}\n${row.body || ''}`;
  if (/\bI'm Max\b/i.test(blob) || /Founder,\s*YouTubeBooster/i.test(blob) || /\bI ran .+ through YouTubeBooster/i.test(blob)) {
    return 'Legacy personal template — regenerate the draft first.';
  }
  return null;
}

/** Hard COOK-001 gates for Approve / Approve & Send / batch selection. */
export function approvalBlockReason(row: AcqAdminProspect, nowMs = Date.now()): string | null {
  const soft = draftReviewBlockReason(row);
  if (soft) return soft;
  if (isTerminalOutreach(row) && (row.public.outreachStatus || '').toLowerCase() !== 'needs_review') {
    if (
      (row.public.outreachStatus || '').toLowerCase() === 'approved' ||
      (row.public.approvalStatus || '').toLowerCase() === 'approved'
    ) {
      return 'Already approved.';
    }
  }
  const p = row.public;
  const score = p.acquisitionScore ?? p.priorityScore ?? 0;
  if (score < 70) return `Score ${score} is below 70 — cannot approve or send.`;
  if ((p.subscriberRange || '') !== '1k_100k') {
    return `Audience ${p.subscriberRange || 'unknown'} is outside the 1k–100k COOK-001 band.`;
  }
  if (!p.recentUploadAt) return 'Missing recent upload date — re-inspect the channel.';
  const ageDays = (nowMs - new Date(p.recentUploadAt).getTime()) / (1000 * 60 * 60 * 24);
  if (Number.isFinite(ageDays) && ageDays > 60) {
    return `Last upload is ${Math.floor(ageDays)} days old (>60) — re-inspect or pick a more active creator.`;
  }
  return null;
}

export function isReadyForApproval(row: AcqAdminProspect, _nowMs = Date.now()): boolean {
  if (row.lastContactedAt) return false;
  const why = (row.whyNotSent || '').toUpperCase();
  if (why === 'ALREADY_CONTACTED' || why === 'DUPLICATE_EMAIL' || why === 'DUPLICATE_CHANNEL') return false;
  if (why === 'READY_TO_SEND') return false;
  const lane = (row.sendLane || '').toLowerCase();
  if (lane === 'ready_to_send' || lane === 'sent') return false;
  return draftReviewBlockReason(row) === null && !isTerminalOutreach(row);
}

function isTerminalOutreach(row: AcqAdminProspect): boolean {
  const outreach = (row.public.outreachStatus || '').toLowerCase();
  if (outreach === 'approved' || (row.public.approvalStatus || '').toLowerCase() === 'approved') return true;
  return [
    'rejected',
    'suppressed',
    'bounced',
    'complained',
    'unsubscribed',
    'customer',
    'sent',
    'delivered',
    'replied',
    'needs_review'
  ].includes(outreach);
}

/** Hard blocks for manual admin send (cooldown is NOT a hard block). */
export function manualSendHardBlockReason(row: AcqAdminProspect): string | null {
  const p = row.public;
  const outreach = (p.outreachStatus || '').toLowerCase();
  if (['unsubscribed', 'bounced', 'complained', 'suppressed', 'rejected'].includes(outreach)) {
    return `Blocked: ${outreach}`;
  }
  const email = (row.publicBusinessEmail || '').trim();
  if (!email || !email.includes('@')) return 'Missing or invalid email';
  if (!hasUsablePublicEmail(row)) return 'Verified public email required';
  const score = p.acquisitionScore ?? p.priorityScore ?? 0;
  if (score < 70) return `Score ${score} is below 70`;
  if ((p.subscriberRange || '') !== '1k_100k') {
    return `Audience ${p.subscriberRange || 'unknown'} outside 1k–100k band`;
  }
  return null;
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

  // Approved: manual SEND NOW is allowed even during automation cooldown (hard blocks still apply).
  if (outreach === 'approved' || (p.approvalStatus || '').toLowerCase() === 'approved') {
    const hard = manualSendHardBlockReason(row);
    const canManual = sendingEnabled && !hard;
    const inCooldown = !!ends;
    return {
      ...base,
      status: inCooldown ? 'COOLDOWN' : 'APPROVED',
      label: inCooldown ? 'COOLDOWN' : 'APPROVED',
      canSendNow: canManual,
      canApprove: false,
      canUnapprove: true,
      canOverrideCooldown: inCooldown,
      checkboxDisabledReason: 'Already approved.',
      whyHere: inCooldown
        ? 'Approved for outreach; automation cooldown is active (manual send still allowed).'
        : 'You approved this creator for initial outreach.',
      currentStatusAnswer: inCooldown
        ? `APPROVED — automation cooldown until ${endsLabel}`
        : canManual
          ? 'APPROVED — ready to send'
          : hard || 'APPROVED — sending disabled',
      nextStep: inCooldown
        ? `Automation waits until ${endsLabel}. You can Send Now anytime (manual override).`
        : canManual
          ? 'Send now, or wait for the weekday sender (automation still respects cooldown + daily limit).'
          : hard || 'Enable marketing sending, then Send Now.',
      whatICanDo: canManual
        ? 'Send Now (bypasses automation cooldown), unapprove, or reject.'
        : hard || 'Unapprove, edit message, or reject.',
      primaryAction: canManual ? 'send' : 'view',
      primaryActionLabel: canManual ? 'Send Now' : 'View'
    };
  }

  const autoReady =
    (row.sendLane || '').toLowerCase() === 'ready_to_send' ||
    (row.whyNotSent || '').toUpperCase() === 'READY_TO_SEND';
  if (autoReady) {
    const hard = manualSendHardBlockReason(row);
    const canManual = sendingEnabled && !hard;
    return {
      ...base,
      status: 'APPROVED',
      label: 'READY TO SEND',
      canSendNow: canManual,
      canApprove: false,
      canUnapprove: true,
      checkboxDisabledReason: 'Automatic campaign — already sendable.',
      whyHere: 'This automatic COOK-001 draft is sendable without Admin Approvals.',
      currentStatusAnswer: canManual ? 'READY TO SEND' : hard || 'READY TO SEND — sending disabled',
      nextStep: 'Weekday automation will send this. Send Now is optional.',
      whatICanDo: canManual ? 'Send Now, unapprove, or reject.' : hard || 'Unapprove, edit message, or reject.',
      primaryAction: canManual ? 'send' : 'view',
      primaryActionLabel: canManual ? 'Send Now' : 'View'
    };
  }

  // Already contacted once — keep out of Needs Approval even if draft was regenerated.
  const alreadyEmailed =
    !!row.lastContactedAt ||
    ['ALREADY_CONTACTED', 'DUPLICATE_EMAIL', 'DUPLICATE_CHANNEL'].includes((row.whyNotSent || '').toUpperCase());
  if (alreadyEmailed) {
    return {
      ...base,
      status: 'SENT',
      label: 'SENT',
      checkboxDisabledReason: 'Already contacted — not shown for re-approval.',
      whyHere: 'This creator was already contacted. They belong under Recently Sent, not Needs Approval.',
      currentStatusAnswer: 'ALREADY CONTACTED',
      nextStep: 'Use Inbox / View Thread for replies. Follow-ups run automatically when due.',
      whatICanDo: 'View Thread.',
      primaryAction: 'view_thread',
      primaryActionLabel: 'View Thread'
    };
  }

  // Non-approved rows still in cooldown (already contacted, not re-approved).
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

  if (!hasUsablePublicEmail(row)) {
    const research = (p.contactResearchStatus || '').toLowerCase();
    const discovery = (p.contactDiscoveryResult || '').toLowerCase();
    if (research === 'not_found' || discovery === 'not_found') {
      return {
        ...base,
        status: 'NOT_FOUND',
        label: 'EMAIL NOT FOUND',
        checkboxDisabledReason: 'No public business email found yet.',
        whyHere: 'Discovery finished without a usable public email.',
        currentStatusAnswer: 'EMAIL NOT FOUND',
        nextStep: 'Retry discovery after cooldown, or add a public email manually.',
        whatICanDo: 'Retry Find Email, Add Email Manually, or Reject.',
        primaryAction: 'retry_email',
        primaryActionLabel: 'Retry'
      };
    }
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

  if ((p.contactResearchStatus || '').toLowerCase() === 'review_email' || (p.contactStatus || '').toLowerCase() === 'review_email') {
    return {
      ...base,
      status: 'REVIEW_EMAIL',
      label: 'REVIEW EMAIL',
      checkboxDisabledReason: 'Medium-confidence email needs admin review.',
      whyHere: 'A possible public business email was found and needs Accept / Reject.',
      currentStatusAnswer: 'REVIEW EMAIL',
      nextStep: 'Review the source, then Accept or Reject the candidate email.',
      whatICanDo: 'Accept email, Reject, View source, or Add Email Manually.',
      primaryAction: 'review_email',
      primaryActionLabel: 'Review Email'
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

  if (!isReadyForApproval(row, nowMs)) {
    const needsDraft = !(p.subject || '').trim() || !(row.body || '').trim() || !(p.observation || '').trim();
    const block = draftReviewBlockReason(row) || approvalBlockReason(row, nowMs);
    return {
      ...base,
      status: 'OTHER',
      label: needsDraft ? 'DRAFT INCOMPLETE' : 'QUALIFIED',
      checkboxDisabledReason: p.previewPlaceholder
        ? 'Placeholder inspection — cannot approve.'
        : block || 'Complete the outreach draft before approval.',
      whyHere: p.previewPlaceholder
        ? 'Inspection returned placeholder data.'
        : 'Contact is verified; outreach draft still needs work.',
      currentStatusAnswer: needsDraft ? 'DRAFT INCOMPLETE' : 'QUALIFIED',
      nextStep: 'Prepare or edit the draft, then review under Needs Approval.',
      whatICanDo: 'Prepare Draft, Review, or Reject.',
      primaryAction: needsDraft ? 'prepare_draft' : 'review',
      primaryActionLabel: needsDraft ? 'Prepare Draft' : 'Review'
    };
  }

  const sendGate = approvalBlockReason(row, nowMs);
  return {
    ...base,
    status: 'READY_FOR_APPROVAL',
    label: 'NEEDS APPROVAL',
    // Approvals tab is the human gate — always allow selection / approve actions here.
    canSelectForApproval: true,
    canApprove: true,
    checkboxDisabledReason: sendGate,
    whyHere: sendGate
      ? `Draft is ready. COOK-001 automation gates warn: ${sendGate} — admin Approve & Send still allowed.`
      : 'Verified contact + complete draft — waiting for your approval.',
    currentStatusAnswer: 'NEEDS APPROVAL',
    nextStep: 'Review the draft, then Approve & Send or Approve (queue only). Nothing sends until you approve.',
    whatICanDo: 'Review Draft, Approve & Send, Approve (queue only), Edit Message, or Reject.',
    primaryAction: 'approve',
    primaryActionLabel: 'Review Draft'
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
    EMAIL_FOUND: 0,
    REVIEW_EMAIL: 0,
    NOT_FOUND: 0,
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
    const status = resolveAcqWorkflow(row, cooldownDays, nowMs, sendingEnabled).status;
    counts[status] += 1;
    if (isVerifiedPublicContact(row)) counts.EMAIL_FOUND += 1;
  }
  return counts;
}

/** Email-discovery-centric filter (Creators bulk toolbar). */
export type AcqEmailStatusFilter = 'all' | 'EMAIL_FOUND' | 'EMAIL_REQUIRED' | 'REVIEW_EMAIL' | 'NOT_FOUND';

export function filterByEmailStatus(
  rows: AcqAdminProspect[],
  filter: AcqEmailStatusFilter,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): AcqAdminProspect[] {
  if (filter === 'all') return rows;
  if (filter === 'EMAIL_FOUND') return rows.filter((r) => isVerifiedPublicContact(r));
  return rows.filter(
    (r) => resolveAcqWorkflow(r, cooldownDays, nowMs, sendingEnabled).status === filter
  );
}

export function countEmailStatuses(
  rows: AcqAdminProspect[],
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): Record<Exclude<AcqEmailStatusFilter, 'all'>, number> {
  return {
    EMAIL_FOUND: rows.filter((r) => isVerifiedPublicContact(r)).length,
    EMAIL_REQUIRED: filterByEmailStatus(rows, 'EMAIL_REQUIRED', cooldownDays, nowMs, sendingEnabled).length,
    REVIEW_EMAIL: filterByEmailStatus(rows, 'REVIEW_EMAIL', cooldownDays, nowMs, sendingEnabled).length,
    NOT_FOUND: filterByEmailStatus(rows, 'NOT_FOUND', cooldownDays, nowMs, sendingEnabled).length
  };
}

export function filterByWorkflowStatus(
  rows: AcqAdminProspect[],
  status: AcqWorkflowStatus | 'all',
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): AcqAdminProspect[] {
  if (status === 'all') return rows;
  if (status === 'EMAIL_FOUND') return rows.filter((r) => isVerifiedPublicContact(r));
  return rows.filter((r) => resolveAcqWorkflow(r, cooldownDays, nowMs, sendingEnabled).status === status);
}

export function selectEligibleIds(
  rows: AcqAdminProspect[],
  currentlySelected: string[],
  id: string,
  max = 500,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true
): string[] {
  const row = rows.find((r) => r.public.prospectId === id);
  if (!row || !resolveAcqWorkflow(row, cooldownDays, nowMs, sendingEnabled).canSelectForApproval) {
    return currentlySelected;
  }
  if (currentlySelected.includes(id)) return currentlySelected.filter((x) => x !== id);
  if (currentlySelected.length >= max) return currentlySelected;
  return [...currentlySelected, id];
}

export function selectAllEligible(
  rows: AcqAdminProspect[],
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true,
  max = 500
): string[] {
  return rows
    .filter((r) => resolveAcqWorkflow(r, cooldownDays, nowMs, sendingEnabled).canSelectForApproval)
    .slice(0, max)
    .map((r) => r.public.prospectId);
}

/** Toggle selection for Ready-to-Send (manual-sendable) rows. */
export function selectSendableIds(
  rows: AcqAdminProspect[],
  currentlySelected: string[],
  id: string,
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true,
  max = 500
): string[] {
  const row = rows.find((r) => r.public.prospectId === id);
  if (!row || !resolveAcqWorkflow(row, cooldownDays, nowMs, sendingEnabled).canSendNow) {
    return currentlySelected;
  }
  if (currentlySelected.includes(id)) return currentlySelected.filter((x) => x !== id);
  if (currentlySelected.length >= max) return currentlySelected;
  return [...currentlySelected, id];
}

export function selectAllSendable(
  rows: AcqAdminProspect[],
  cooldownDays = DEFAULT_COOLDOWN_DAYS,
  nowMs = Date.now(),
  sendingEnabled = true,
  max = 500
): string[] {
  return rows
    .filter((r) => resolveAcqWorkflow(r, cooldownDays, nowMs, sendingEnabled).canSendNow)
    .slice(0, max)
    .map((r) => r.public.prospectId);
}
