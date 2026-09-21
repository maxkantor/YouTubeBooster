import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AcqAdminProspect } from '../types';
import {
  approvalBlockReason,
  isReadyForApproval,
  resolveAcqWorkflow
} from './acqApprovalWorkflow';
import { actionsAbovePreview, rowPrimaryButtons, visibleAcqActions } from './acqVisibleActions';

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
  recentUploadAt?: string | null;
  subscriberRange?: string;
}): AcqAdminProspect {
  return {
    publicBusinessEmail: partial.email === undefined ? 'chef@example.com' : partial.email,
    body: partial.body === undefined ? 'Hi there draft body with enough text' : partial.body,
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
      subscriberRange: partial.subscriberRange ?? '1k_100k',
      videoCount: 20,
      recentUploadAt: partial.recentUploadAt === undefined ? '2026-09-01T00:00:00Z' : partial.recentUploadAt,
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
      observation:
        partial.observation === undefined
          ? '14 of your last 20 public videos have very short descriptions for search.'
          : partial.observation,
      suggestedImprovement: 'For example, on "Pasta", we\'d test a short search-focused description.',
      subject: partial.subject === undefined ? 'A YouTube idea for Test Kitchen' : partial.subject,
      evidenceAt: '2026-09-01T00:00:00Z',
      previewPlaceholder: partial.previewPlaceholder ?? false
    }
  };
}

describe('acqVisibleActions + approve readiness', () => {
  const now = Date.parse('2026-09-21T12:00:00Z');

  it('READY_FOR_APPROVAL exposes Approve & Send and Approve', () => {
    const r = row({});
    assert.equal(isReadyForApproval(r, now), true);
    const wf = resolveAcqWorkflow(r, 14, now, true);
    assert.equal(wf.status, 'READY_FOR_APPROVAL');
    assert.equal(wf.canApprove, true);
    const ids = visibleAcqActions(wf).map((a) => a.id);
    assert.ok(ids.includes('approve_and_send'));
    assert.ok(ids.includes('approve'));
    assert.ok(ids.includes('reject'));
    assert.ok(ids.includes('open_youtube'));
    assert.deepEqual(rowPrimaryButtons('READY_FOR_APPROVAL'), ['approve_and_send', 'approve']);
    assert.equal(actionsAbovePreview('READY_FOR_APPROVAL'), true);
  });

  it('blocks READY when upload is older than 60 days (matches backend ApproveBatch)', () => {
    const r = row({ recentUploadAt: '2026-06-01T00:00:00Z' });
    assert.equal(isReadyForApproval(r, now), false);
    assert.match(approvalBlockReason(r, now) || '', /60/);
    const wf = resolveAcqWorkflow(r, 14, now, true);
    assert.notEqual(wf.status, 'READY_FOR_APPROVAL');
    assert.equal(wf.canApprove, false);
  });

  it('REVIEW_EMAIL exposes Accept / Reject / Add Email', () => {
    const r = row({ email: 'maybe@cook.test', contactStatus: 'review_email' });
    r.public.contactResearchStatus = 'review_email';
    const wf = resolveAcqWorkflow(r, 14, now, true);
    assert.equal(wf.status, 'REVIEW_EMAIL');
    const ids = visibleAcqActions(wf, { hasContactSourceUrl: true }).map((a) => a.id);
    assert.deepEqual(
      ids.filter((id) => ['review_accept', 'review_reject', 'view_source', 'add_email'].includes(id)),
      ['review_accept', 'review_reject', 'view_source', 'add_email']
    );
  });

  it('EMAIL_REQUIRED / NOT_FOUND / NEEDS_REVIEW expose expected primaries', () => {
    assert.deepEqual(rowPrimaryButtons('EMAIL_REQUIRED'), ['find_email']);
    assert.deepEqual(rowPrimaryButtons('NOT_FOUND'), ['retry_email']);
    assert.deepEqual(rowPrimaryButtons('NEEDS_REVIEW'), ['prepare_draft']);
    assert.deepEqual(rowPrimaryButtons('APPROVED'), ['send_now']);
  });

  it('APPROVED with send enabled exposes Send Now', () => {
    const r = row({ outreachStatus: 'approved', approvalStatus: 'approved' });
    const wf = resolveAcqWorkflow(r, 14, now, true);
    assert.equal(wf.status, 'APPROVED');
    assert.equal(wf.canSendNow, true);
    const ids = visibleAcqActions(wf).map((a) => a.id);
    assert.ok(ids.includes('send_now'));
    assert.ok(ids.includes('unapprove'));
  });

  it('every workflow status used in Creators has a defined row button strategy', () => {
    const statuses = [
      'EMAIL_REQUIRED',
      'EMAIL_FOUND',
      'REVIEW_EMAIL',
      'NOT_FOUND',
      'EMAIL_VERIFICATION_REQUIRED',
      'READY_FOR_APPROVAL',
      'NEEDS_REVIEW',
      'APPROVED',
      'COOLDOWN',
      'REJECTED',
      'SENT',
      'REPLIED',
      'CONVERTED',
      'OTHER'
    ] as const;
    for (const s of statuses) {
      assert.ok(Array.isArray(rowPrimaryButtons(s)));
      assert.equal(typeof actionsAbovePreview(s), 'boolean');
    }
  });
});
