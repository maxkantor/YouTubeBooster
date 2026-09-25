import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeGrowthReport,
  formatCrmAcquisitionText,
  normalizeDistribution,
  pipelineMetric
} from '../lib/compose-report.mjs';

test('pipelineMetric returns 0 when CRM ok and value missing', () => {
  assert.equal(pipelineMetric(null, true), '0');
  assert.equal(pipelineMetric(undefined, true), '0');
  assert.equal(pipelineMetric(0, true), '0');
  assert.equal(pipelineMetric(12, true), '12');
  assert.equal(pipelineMetric(null, false), 'Unavailable');
  assert.equal(pipelineMetric(null, null), 'Unavailable');
});

test('formatCrmAcquisitionText does not ask to approve when automatic sending is healthy', () => {
  const lines = formatCrmAcquisitionText({
    crmSummaryOk: true,
    automaticSending: true,
    sendingMode: 'automatic',
    dailyLimit: 100,
    sentToday: 18,
    sesAcceptedThisRun: 18,
    dailyRemaining: 82,
    sesRemaining: 48800,
    prospectsEvaluated: 350,
    contactVerified: 119,
    needsApproval: 1,
    crmActionRequired: false,
    crmActionMessage: 'Automation is operating normally.',
    crmBoard: {
      totalProspects: 350,
      usableEmails: 119,
      needsEmail: 179,
      needsApproval: 1,
      readyToSend: 17,
      notReviewable: {
        invalidEmail: 8,
        noUsableEmail: 179,
        qualificationFailed: 31,
        alreadyContacted: 20,
        suppressed: 2
      }
    },
    pipeline: { eligibleNow: 17, dailyLimit: 100, dailyRemaining: 82 },
    outreachFunnel: { drafted: 84, approved: 17, sent: 18, delivered: 0, clicked: 3, converted: 0 },
    skipReasonCounts: { ALREADY_CONTACTED: 20, INVALID_EMAIL: 8, NO_PUBLIC_EMAIL_FOUND: 179, NOT_QUALIFIED: 31, SUPPRESSED: 2 },
    cohort: { auditStarts: 2, signups: 1, verifiedCustomers: 0 }
  });
  const text = lines.join('\n');
  assert.match(text, /YOUTUBEBOOSTER OUTREACH/);
  assert.match(text, /Daily limit: 100/);
  assert.match(text, /Sent today: 18/);
  assert.match(text, /Remaining campaign capacity: 82/);
  assert.match(text, /AUTOMATIC ACQUISITION: RUNNING/);
  assert.match(text, /Owner action required: NONE/);
  assert.doesNotMatch(text, /waiting for approval/);
  assert.doesNotMatch(text, /MAX — ACTION REQUIRED/);
  assert.match(text, /Delivered: NOT TRACKED/);
});

test('composeGrowthReport merges CRM board into subject and body', () => {
  const report = composeGrowthReport({
    snapshot: { sources: { ga4: 'ok', stripe: 'ok', crm: 'ok' }, windows: {} },
    health: { ok: true, checks: [{ name: 'api', ok: true }] },
    experiments: [],
    generatedAt: '2026-09-22T16:00:00.000Z',
    distribution: {
      executed: false,
      distributionAttempted: true,
      blockingApproval: false,
      requiredOwnerApproval: 'none',
      channel: 'approved SES outreach',
      audience: 'cooking',
      attributedVisits: '0',
      activations: '0',
      checkoutStarts: '0',
      newCustomersThisRun: 0,
      existingCustomers: 0,
      customersObservedInWindow: 0,
      experimentAttributedCustomers: '0',
      verifiedRevenue: '$0.00',
      exactActionPrepared: 'weekday send',
      sesAcceptedThisRun: 0,
      sesAttemptedThisRun: 0,
      prospectsEvaluated: 101,
      crmSummaryOk: true,
      needsApproval: 16,
      sendingMode: 'manual',
      automaticSending: false,
      crmActionRequired: true,
      crmActionMessage: '16 outreach drafts waiting for approval.',
      approvalsUrl: 'https://youtubeboosterai.com/admin/acquisition/approvals',
      crmBoard: {
        totalProspects: 101,
        draftsGenerated: 95,
        needsApproval: 16,
        readyToSend: 0,
        recentlySent: 9,
        recentlySentWindowDays: 7,
        notReviewableTotal: 79
      },
      pipeline: {
        drafted: 95,
        eligibleNow: 0,
        approvedEligibleNow: 0,
        blockedByEmailValidation: 0,
        dailyRemaining: 10,
        dailyLimit: 10,
        expectedToAttempt: 0
      },
      outreachFunnel: { drafted: 95, approved: 0, sent: 9, delivered: 0, clicked: 0, converted: 0 },
      skipReasonCounts: { INVALID_EMAIL: 21, NOT_APPROVED: 74 }
    }
  });
  assert.match(report.subject, /ACTION REQUIRED/);
  assert.match(report.text, /Needs approval: 16/);
  assert.match(report.text, /NEEDS APPROVAL \(Admin queue\): 16/);
  assert.match(report.text, /ELIGIBLE NOW \(send gates\): 0/);
  assert.match(report.text, /BLOCKED BY EMAIL VALIDATION \(approved\): 0/);
  assert.match(report.text, /SKIPPED REASONS \(all COOK-001 candidates/);
  assert.match(report.text, /INVALID_EMAIL: 21/);
  assert.match(report.html, /OPEN APPROVALS/);
  assert.doesNotMatch(report.text, /ELIGIBLE NOW \(send gates\): Unknown/);
});

test('normalizeDistribution preserves pipeline when CRM summary ok', () => {
  const d = normalizeDistribution({
    crmSummaryOk: true,
    needsApproval: 16,
    pipeline: { eligibleNow: 0, approvedEligibleNow: 0, blockedByEmailValidation: 0 },
    outreachFunnel: { drafted: 95, approved: 0, sent: 9, delivered: 0, clicked: 0, converted: 0 }
  });
  assert.equal(d.needsApproval, 16);
  assert.equal(d.crmActionRequired, true);
  assert.equal(d.pipeline.eligibleNow, 0);
  assert.equal(pipelineMetric(d.pipeline.eligibleNow, d.crmSummaryOk), '0');
});

test('automatic COOK-001 report does not ask Max to open Approvals', () => {
  const report = composeGrowthReport({
    snapshot: { sources: { ga4: 'ok', stripe: 'ok', crm: 'ok' }, windows: {} },
    health: { ok: true, checks: [{ name: 'api', ok: true }] },
    experiments: [],
    generatedAt: '2026-09-25T16:00:00.000Z',
    distribution: {
      executed: true,
      distributionAttempted: true,
      blockingApproval: false,
      requiredOwnerApproval: 'none',
      channel: 'COOK-001 weekday SES',
      audience: 'cooking',
      attributedVisits: '0',
      activations: '0',
      checkoutStarts: '0',
      newCustomersThisRun: 0,
      existingCustomers: 0,
      customersObservedInWindow: 0,
      experimentAttributedCustomers: '0',
      verifiedRevenue: '$0.00',
      sesAcceptedThisRun: 1,
      sesAttemptedThisRun: 1,
      prospectsEvaluated: 160,
      crmSummaryOk: true,
      needsApproval: 5,
      sendingMode: 'automatic',
      automaticSending: true,
      crmActionRequired: false,
      crmActionMessage: 'AUTOMATIC ACQUISITION: RUNNING',
      crmBoard: { needsApproval: 5, readyToSend: 5, recentlySent: 1, recentlySentWindowDays: 7 },
      pipeline: { eligibleNow: 5, approvedEligibleNow: 5, readyToSend: 5, dailyLimit: 100, dailyRemaining: 99 },
      outreachFunnel: { drafted: 10, approved: 0, sent: 12, delivered: 0, clicked: 0, converted: 0 }
    }
  });
  assert.doesNotMatch(report.subject, /ACTION REQUIRED/);
  assert.match(report.text, /AUTOMATIC ACQUISITION: RUNNING/);
  assert.match(report.text, /Owner action required: NONE/);
  assert.match(report.text, /READY TO SEND: 5/);
  assert.doesNotMatch(report.text, /MAX — ACTION REQUIRED/);
  assert.doesNotMatch(report.html, /OPEN APPROVALS/);
});
