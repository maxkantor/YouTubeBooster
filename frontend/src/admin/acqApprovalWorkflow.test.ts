import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AcqAdminProspect } from '../types';
import {
  cooldownEndsAt,
  countWorkflowStatuses,
  filterByWorkflowStatus,
  isReadyForApproval,
  resolveAcqWorkflow,
  selectAllEligible,
  selectEligibleIds
} from './acqApprovalWorkflow';

function row(partial: {
  prospectId?: string;
  email?: string | null;
  contactStatus?: string;
  outreachStatus?: string;
  approvalStatus?: string;
  subject?: string | null;
  observation?: string | null;
  body?: string | null;
  previewPlaceholder?: boolean;
  lastContactedAt?: string | null;
  priorityScore?: number;
}): AcqAdminProspect {
  return {
    publicBusinessEmail: partial.email === undefined ? 'chef@example.com' : partial.email,
    body: partial.body === undefined ? 'Hi there draft body' : partial.body,
    lastContactedAt: partial.lastContactedAt ?? null,
    public: {
      prospectId: partial.prospectId || 'COOK-001-P001',
      channelName: 'Test Kitchen',
      handle: '@testkitchen',
      channelUrl: 'https://youtube.com/@testkitchen',
      channelId: null,
      primaryNiche: 'cooking',
      language: 'en',
      country: null,
      subscriberRange: '1k_100k',
      videoCount: 20,
      recentUploadAt: '2026-09-01T00:00:00Z',
      cadenceDays: 3,
      officialWebsite: null,
      contactSourceUrl: 'https://example.com/contact',
      contactType: 'business',
      contactStatus: partial.contactStatus ?? 'verified_public',
      priorityScore: partial.priorityScore ?? 90,
      opportunityCategory: 'weak_descriptions',
      inspectionStatus: 'completed',
      outreachStatus: partial.outreachStatus ?? 'draft_ready',
      approvalStatus: partial.approvalStatus ?? 'none',
      campaign: 'COOK-001',
      trackedPath: '/api/public/acq/go/x',
      observation: partial.observation === undefined ? 'Thin descriptions' : partial.observation,
      suggestedImprovement: 'Add ingredients',
      subject: partial.subject === undefined ? 'One idea for your YouTube channel' : partial.subject,
      evidenceAt: '2026-09-01T00:00:00Z',
      previewPlaceholder: partial.previewPlaceholder ?? false
    }
  };
}

describe('acqApprovalWorkflow', () => {
  it('marks missing email as EMAIL_REQUIRED and not selectable', () => {
    const w = resolveAcqWorkflow(row({ email: null }));
    assert.equal(w.status, 'EMAIL_REQUIRED');
    assert.equal(w.canSelectForApproval, false);
    assert.equal(w.canApprove, false);
    assert.match(w.checkboxDisabledReason || '', /email/i);
    assert.equal(w.primaryAction, 'find_email');
    assert.equal(w.primaryActionLabel, 'Find Email');
  });

  it('marks unverified email as EMAIL_VERIFICATION_REQUIRED', () => {
    const w = resolveAcqWorkflow(row({ email: 'a@b.com', contactStatus: 'source_recorded_unverified' }));
    assert.equal(w.status, 'EMAIL_VERIFICATION_REQUIRED');
    assert.equal(w.canApprove, false);
    assert.equal(w.primaryAction, 'verify_email');
    assert.equal(w.primaryActionLabel, 'Verify Email');
  });

  it('marks complete verified draft as READY_FOR_APPROVAL', () => {
    const r = row({});
    assert.equal(isReadyForApproval(r), true);
    const w = resolveAcqWorkflow(r);
    assert.equal(w.status, 'READY_FOR_APPROVAL');
    assert.equal(w.canSelectForApproval, true);
    assert.equal(w.canApprove, true);
    assert.equal(w.primaryAction, 'approve');
    assert.equal(w.primaryActionLabel, 'Approve');
    assert.match(w.currentStatusAnswer, /READY FOR APPROVAL/i);
  });

  it('blocks low score and out-of-band subscribers from approval', () => {
    const low = row({ priorityScore: 60 });
    assert.equal(isReadyForApproval(low), false);
    assert.match(resolveAcqWorkflow(low).label, /NOT QUALIFIED/i);

    const celeb = row({});
    celeb.public.subscriberRange = 'over_350k';
    assert.equal(isReadyForApproval(celeb), false);
    assert.match(resolveAcqWorkflow(celeb).checkboxDisabledReason || '', /1k/);
  });

  it('does not treat incomplete draft as ready', () => {
    const r = row({ body: '' });
    assert.equal(isReadyForApproval(r), false);
  });

  it('marks approved as APPROVED without selection', () => {
    const w = resolveAcqWorkflow(row({ outreachStatus: 'approved', approvalStatus: 'approved' }));
    assert.equal(w.status, 'APPROVED');
    assert.equal(w.canSelectForApproval, false);
    assert.equal(w.primaryAction, 'send');
    assert.equal(w.primaryActionLabel, 'Send Now');
    assert.match(w.currentStatusAnswer, /APPROVED/i);
  });

  it('marks approved as blocked when sending disabled', () => {
    const w = resolveAcqWorkflow(row({ outreachStatus: 'approved', approvalStatus: 'approved' }), 14, Date.now(), false);
    assert.equal(w.status, 'APPROVED');
    assert.equal(w.canSendNow, false);
  });

  it('marks replied as REPLIED', () => {
    const w = resolveAcqWorkflow(row({ outreachStatus: 'replied' }));
    assert.equal(w.status, 'REPLIED');
    assert.equal(w.primaryAction, 'reply');
    assert.equal(w.primaryActionLabel, 'Reply');
  });

  it('approved in automation cooldown can still manual Send Now', () => {
    const now = Date.parse('2026-09-17T17:00:00Z');
    const last = '2026-09-10T12:00:00Z';
    const ends = cooldownEndsAt(last, 14, now);
    assert.ok(ends);
    const w = resolveAcqWorkflow(row({ lastContactedAt: last, outreachStatus: 'approved', approvalStatus: 'approved' }), 14, now);
    assert.equal(w.status, 'COOLDOWN');
    assert.ok(w.cooldownEndsAt);
    assert.equal(w.canSendNow, true);
    assert.equal(w.primaryAction, 'send');
  });

  it('non-approved cooldown cannot Send Now', () => {
    const now = Date.parse('2026-09-17T17:00:00Z');
    const last = '2026-09-10T12:00:00Z';
    const w = resolveAcqWorkflow(row({ lastContactedAt: last, outreachStatus: 'draft_ready' }), 14, now);
    assert.equal(w.status, 'COOLDOWN');
    assert.equal(w.canSendNow, false);
  });

  it('selectEligibleIds only toggles ready rows', () => {
    const ready = row({ prospectId: 'a' });
    const noEmail = row({ prospectId: 'b', email: null });
    const rows = [ready, noEmail];
    assert.deepEqual(selectEligibleIds(rows, [], 'b'), []);
    assert.deepEqual(selectEligibleIds(rows, [], 'a'), ['a']);
    assert.deepEqual(selectEligibleIds(rows, ['a'], 'a'), []);
  });

  it('selectAllEligible selects only ready visible rows up to max', () => {
    const rows = [
      row({ prospectId: '1' }),
      row({ prospectId: '2', email: null }),
      row({ prospectId: '3' }),
      row({ prospectId: '4', outreachStatus: 'approved', approvalStatus: 'approved' })
    ];
    assert.deepEqual(selectAllEligible(rows, 25), ['1', '3']);
    assert.deepEqual(selectAllEligible(rows, 1), ['1']);
  });

  it('counts and filters ready-for-approval accurately', () => {
    const rows = [
      row({ prospectId: '1' }),
      row({ prospectId: '2', email: null }),
      row({ prospectId: '3', contactStatus: 'none', email: 'x@y.com' }),
      row({ prospectId: '4', outreachStatus: 'approved', approvalStatus: 'approved' }),
      row({ prospectId: '5', outreachStatus: 'replied' })
    ];
    const counts = countWorkflowStatuses(rows);
    assert.equal(counts.READY_FOR_APPROVAL, 1);
    assert.equal(counts.EMAIL_REQUIRED, 1);
    assert.equal(counts.EMAIL_VERIFICATION_REQUIRED, 1);
    assert.equal(counts.APPROVED, 1);
    assert.equal(counts.REPLIED, 1);
    assert.equal(filterByWorkflowStatus(rows, 'READY_FOR_APPROVAL').length, 1);
    assert.equal(filterByWorkflowStatus(rows, 'REPLIED').length, 1);
  });
});
