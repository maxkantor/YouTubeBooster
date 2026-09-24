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
  selectEligibleIds,
  selectAllSendable
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

  it('marks discovery not_found as NOT_FOUND with retry', () => {
    const r = row({ email: null, contactStatus: 'not_found' });
    r.public.contactResearchStatus = 'not_found';
    r.public.contactDiscoveryResult = 'not_found';
    const w = resolveAcqWorkflow(r);
    assert.equal(w.status, 'NOT_FOUND');
    assert.equal(w.primaryAction, 'retry_email');
    assert.equal(w.primaryActionLabel, 'Retry');
  });

  it('marks medium-confidence candidate as REVIEW_EMAIL', () => {
    const r = row({ email: 'maybe@cook.test', contactStatus: 'review_email' });
    r.public.contactResearchStatus = 'review_email';
    r.public.contactConfidence = 'medium';
    const w = resolveAcqWorkflow(r);
    assert.equal(w.status, 'REVIEW_EMAIL');
    assert.equal(w.primaryAction, 'review_email');
    assert.equal(w.primaryActionLabel, 'Review Email');
  });

  it('marks unverified email as EMAIL_VERIFICATION_REQUIRED', () => {
    const w = resolveAcqWorkflow(row({ email: 'a@b.com', contactStatus: 'source_recorded_unverified' }));
    assert.equal(w.status, 'EMAIL_VERIFICATION_REQUIRED');
    assert.equal(w.canApprove, false);
    assert.equal(w.primaryAction, 'verify_email');
    assert.equal(w.primaryActionLabel, 'Verify Email');
  });

  it('marks complete verified draft as READY_FOR_APPROVAL / NEEDS APPROVAL', () => {
    const r = row({});
    assert.equal(isReadyForApproval(r), true);
    const w = resolveAcqWorkflow(r);
    assert.equal(w.status, 'READY_FOR_APPROVAL');
    assert.equal(w.label, 'NEEDS APPROVAL');
    assert.equal(w.canSelectForApproval, true);
    assert.equal(w.canApprove, true);
    assert.equal(w.primaryAction, 'approve');
    assert.equal(w.primaryActionLabel, 'Review Draft');
    assert.match(w.currentStatusAnswer, /NEEDS APPROVAL/i);
  });

  it('keeps complete drafts selectable in Needs Approval when COOK-001 gates warn', () => {
    const low = row({ priorityScore: 60 });
    assert.equal(isReadyForApproval(low), true);
    const wLow = resolveAcqWorkflow(low);
    assert.equal(wLow.status, 'READY_FOR_APPROVAL');
    assert.equal(wLow.label, 'NEEDS APPROVAL');
    assert.equal(wLow.canApprove, true);
    assert.equal(wLow.canSelectForApproval, true);
    assert.match(wLow.checkboxDisabledReason || '', /below 70/i);

    const celeb = row({});
    celeb.public.subscriberRange = 'over_350k';
    assert.equal(isReadyForApproval(celeb), true);
    const wCeleb = resolveAcqWorkflow(celeb);
    assert.equal(wCeleb.status, 'READY_FOR_APPROVAL');
    assert.equal(wCeleb.canApprove, true);
    assert.equal(wCeleb.canSelectForApproval, true);
    assert.match(wCeleb.checkboxDisabledReason || '', /1k/);
  });

  it('already-contacted drafts do not reappear as Needs Approval', () => {
    const w = resolveAcqWorkflow(
      row({ outreachStatus: 'draft_ready', lastContactedAt: '2026-09-01T12:00:00Z' })
    );
    assert.equal(w.status, 'SENT');
    assert.equal(w.canSelectForApproval, false);
    assert.equal(w.canApprove, false);
  });

  it('rediscovered sibling of an already-emailed creator is not selectable', () => {
    const rediscovered = row({ outreachStatus: 'draft_ready', lastContactedAt: null });
    rediscovered.whyNotSent = 'DUPLICATE_EMAIL';
    rediscovered.sendLane = 'sent';
    assert.equal(isReadyForApproval(rediscovered), false);
    const w = resolveAcqWorkflow(rediscovered);
    assert.equal(w.status, 'SENT');
    assert.equal(w.canSelectForApproval, false);
    assert.equal(w.canApprove, false);
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

  it('already-contacted draft_ready stays out of Needs Approval (no repeat)', () => {
    const now = Date.parse('2026-09-17T17:00:00Z');
    const last = '2026-09-10T12:00:00Z';
    const w = resolveAcqWorkflow(row({ lastContactedAt: last, outreachStatus: 'draft_ready' }), 14, now);
    assert.equal(w.status, 'SENT');
    assert.equal(w.canSendNow, false);
    assert.equal(w.canSelectForApproval, false);
  });

  it('sent status is SENT even when approvalStatus was approved', () => {
    const w = resolveAcqWorkflow(
      row({
        outreachStatus: 'sent',
        approvalStatus: 'approved',
        lastContactedAt: '2026-09-21T15:00:00Z'
      })
    );
    assert.equal(w.status, 'SENT');
    assert.equal(w.canSendNow, false);
  });

  it('selectAllSendable picks canSendNow rows including cooldown approved', () => {
    const now = Date.parse('2026-09-17T17:00:00Z');
    const rows = [
      row({
        prospectId: 'a',
        outreachStatus: 'approved',
        approvalStatus: 'approved',
        lastContactedAt: '2026-09-10T12:00:00Z'
      }),
      row({ prospectId: 'b', outreachStatus: 'sent', lastContactedAt: '2026-09-16T12:00:00Z' }),
      row({ prospectId: 'c', outreachStatus: 'approved', approvalStatus: 'approved' })
    ];
    const ids = selectAllSendable(rows, 14, now, true, 50);
    assert.deepEqual(ids.sort(), ['a', 'c']);
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
    assert.deepEqual(selectAllEligible(rows, 14, Date.now(), true, 25), ['1', '3']);
    assert.deepEqual(selectAllEligible(rows, 14, Date.now(), true, 1), ['1']);
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
