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

test('formatCrmAcquisitionText surfaces Needs Approval as ACTION REQUIRED', () => {
  const lines = formatCrmAcquisitionText({
    crmSummaryOk: true,
    needsApproval: 16,
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
      usableEmails: 80,
      needsEmail: 21,
      notReviewable: {
        invalidEmail: 21,
        noUsableEmail: 10,
        qualificationFailed: 40,
        cooldown: 0,
        suppressed: 0,
        alreadyContacted: 8,
        rejected: 0,
        other: 0
      },
      notReviewableTotal: 79
    },
    pipeline: {
      drafted: 95,
      eligibleNow: 0,
      approvedEligibleNow: 0,
      blockedByEmailValidation: 0,
      dailyRemaining: 10,
      dailyLimit: 10
    },
    outreachFunnel: { drafted: 95, approved: 0, sent: 9, delivered: 0, clicked: 0, converted: 0 },
    cohort: { auditCompletions: 0, signups: 0, verifiedCustomers: 0, verifiedRevenue: 0 }
  });
  const text = lines.join('\n');
  assert.match(text, /MAX — ACTION REQUIRED/);
  assert.match(text, /16 outreach drafts waiting/);
  assert.match(text, /Needs approval: 16/);
  assert.match(text, /Ready to send: 0/);
  assert.match(text, /Recently sent \(last 7d\): 9/);
  assert.match(text, /Drafts generated \(obs\+subject\): 95/);
  assert.match(text, /ELIGIBLE NOW: 0/);
  assert.match(text, /APPROVED ELIGIBLE NOW: 0/);
  assert.match(text, /BLOCKED BY EMAIL VALIDATION \(approved only\): 0/);
  assert.match(text, /invalid email: 21/);
  assert.doesNotMatch(text, /ELIGIBLE NOW: Unknown/);
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
