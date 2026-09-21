import type { AcqAdminProspect } from '../types';
import type { AcqWorkflowInfo, AcqWorkflowStatus } from './acqApprovalWorkflow';

export type AcqVisibleActionId =
  | 'approve_and_send'
  | 'approve'
  | 'send_now'
  | 'find_email'
  | 'retry_email'
  | 'review_accept'
  | 'review_reject'
  | 'view_source'
  | 'verify_email'
  | 'add_email'
  | 'prepare_draft'
  | 'reject'
  | 'reconsider'
  | 'unapprove'
  | 'override_cooldown'
  | 'open_youtube';

export type AcqVisibleAction = {
  id: AcqVisibleActionId;
  label: string;
  kind: 'primary' | 'secondary' | 'danger' | 'link';
};

/** Deterministic button set for Creators drawer / row actions — unit-tested. */
export function visibleAcqActions(
  wf: Pick<
    AcqWorkflowInfo,
    'status' | 'primaryAction' | 'primaryActionLabel' | 'canApprove' | 'canSendNow' | 'canReject' | 'canUnapprove' | 'canOverrideCooldown'
  >,
  opts: { hasContactSourceUrl?: boolean; includeApproveAndSend?: boolean } = {}
): AcqVisibleAction[] {
  const includeApproveAndSend = opts.includeApproveAndSend !== false;
  const actions: AcqVisibleAction[] = [];

  if (wf.canSendNow) {
    actions.push({ id: 'send_now', label: 'Send Now', kind: 'primary' });
  }
  if (wf.canApprove && includeApproveAndSend) {
    actions.push({ id: 'approve_and_send', label: 'Approve & Send', kind: 'primary' });
  }
  if (wf.canApprove) {
    actions.push({ id: 'approve', label: 'Approve', kind: 'secondary' });
  }
  if (wf.primaryAction === 'find_email') {
    actions.push({ id: 'find_email', label: 'Find Email', kind: 'primary' });
  }
  if (wf.primaryAction === 'retry_email') {
    actions.push({ id: 'retry_email', label: 'Retry', kind: 'primary' });
  }
  if (wf.primaryAction === 'review_email') {
    actions.push({ id: 'review_accept', label: 'Accept', kind: 'primary' });
    actions.push({ id: 'review_reject', label: 'Reject', kind: 'secondary' });
    if (opts.hasContactSourceUrl) {
      actions.push({ id: 'view_source', label: 'View source', kind: 'link' });
    }
  }
  if (wf.primaryAction === 'verify_email') {
    actions.push({ id: 'verify_email', label: 'Verify Email', kind: 'primary' });
  }
  if (
    wf.primaryAction === 'find_email' ||
    wf.primaryAction === 'verify_email' ||
    wf.primaryAction === 'retry_email' ||
    wf.primaryAction === 'review_email'
  ) {
    actions.push({ id: 'add_email', label: 'Add Email Manually', kind: 'secondary' });
  }
  if (wf.primaryAction === 'prepare_draft') {
    actions.push({
      id: 'prepare_draft',
      label: wf.primaryActionLabel || 'Prepare Draft',
      kind: 'primary'
    });
  }
  if (wf.canReject) {
    actions.push({ id: 'reject', label: 'Reject', kind: 'secondary' });
  }
  if (wf.primaryAction === 'reconsider') {
    actions.push({ id: 'reconsider', label: 'Reconsider', kind: 'primary' });
  }
  if (wf.canUnapprove) {
    actions.push({ id: 'unapprove', label: 'Unapprove', kind: 'secondary' });
  }
  if (wf.canOverrideCooldown) {
    actions.push({ id: 'override_cooldown', label: 'Override Cooldown', kind: 'secondary' });
  }
  actions.push({ id: 'open_youtube', label: 'Open YouTube', kind: 'link' });
  return actions;
}

export function rowPrimaryButtons(status: AcqWorkflowStatus): AcqVisibleActionId[] {
  switch (status) {
    case 'READY_FOR_APPROVAL':
      return ['approve_and_send', 'approve'];
    case 'APPROVED':
      return ['send_now'];
    case 'REVIEW_EMAIL':
      return ['review_accept', 'review_reject'];
    case 'EMAIL_REQUIRED':
      return ['find_email'];
    case 'NOT_FOUND':
      return ['retry_email'];
    case 'NEEDS_REVIEW':
    case 'OTHER':
      return ['prepare_draft'];
    default:
      return [];
  }
}

export function actionsAbovePreview(status: AcqWorkflowStatus): boolean {
  return (
    status === 'READY_FOR_APPROVAL' ||
    status === 'APPROVED' ||
    status === 'REVIEW_EMAIL' ||
    status === 'NEEDS_REVIEW' ||
    status === 'EMAIL_REQUIRED' ||
    status === 'NOT_FOUND' ||
    status === 'EMAIL_VERIFICATION_REQUIRED'
  );
}

export function draftPrepareErrorMessage(reason: string | null | undefined): string {
  const r = (reason || '').trim();
  if (!r) return 'Could not prepare draft. Unknown error.';
  if (r === 'already_complete') return 'Draft already complete.';
  if (r === 'placeholder_inspection')
    return 'Could not prepare draft. Reason: YouTube channel data still missing after re-inspect.';
  if (r === 'missing_observation') return 'Could not prepare draft. Reason: Missing creator analysis.';
  if (r === 'weak_personalization')
    return 'Could not prepare draft. Reason: Channel evidence is too weak for a personalized draft.';
  if (r === 'missing_email') return 'Could not prepare draft. Reason: Missing usable email.';
  if (r.startsWith('suppressed:')) return `Could not prepare draft. Reason: Recipient is suppressed (${r.slice(11)}).`;
  if (r.startsWith('inspect_failed:')) return `Could not prepare draft. Reason: Re-inspect failed (${r.slice(15)}).`;
  if (r === 'not_found') return 'Could not prepare draft. Reason: Prospect not found.';
  return `Could not prepare draft. Reason: ${r}`;
}

/** Support CRM path for View Thread / Reply — requires ticketId from send. */
export function supportThreadPath(row: Pick<AcqAdminProspect, 'public'>): string | null {
  const ticketId = (row.public.ticketId || '').trim();
  if (!ticketId) return null;
  return `/admin/contacts/${encodeURIComponent(ticketId)}`;
}
