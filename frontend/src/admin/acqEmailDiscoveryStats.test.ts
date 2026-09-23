import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AcqAdminProspect, AcqEmailDiscoveryJob } from '../types';
import {
  censusDiscovery,
  emailDiscoveryErrorReason,
  emailDiscoveryJobTitle,
  emailDiscoverySummaryLine,
  formatBackoffHorizon,
  formatDiscoveryRetryEt,
  isBackendNeedsEmailDiscovery,
  isDiscoveryBackoff,
  normalizeEmailDiscoveryOutcome,
  outcomeLabel,
  parseBackoffUntil,
  summarizeDiscoveryJob
} from './acqEmailDiscoveryStats';

function row(partial: {
  prospectId?: string;
  email?: string | null;
  contactStatus?: string;
  outreachStatus?: string;
  contactType?: string;
  contactDiscoveryResult?: string | null;
  contactResearchNextAt?: string | null;
  contactResearchLastAt?: string | null;
  contactResearchStatus?: string | null;
}): AcqAdminProspect {
  return {
    publicBusinessEmail: partial.email === undefined ? null : partial.email,
    body: null,
    lastContactedAt: null,
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
      contactSourceUrl: null,
      contactType: partial.contactType ?? 'none',
      contactStatus: partial.contactStatus ?? 'none',
      priorityScore: 80,
      opportunityCategory: 'weak_descriptions',
      inspectionStatus: 'completed',
      outreachStatus: partial.outreachStatus ?? 'discovered',
      approvalStatus: 'none',
      campaign: 'COOK-001',
      trackedPath: '/api/public/acq/go/x',
      observation: null,
      suggestedImprovement: null,
      subject: null,
      evidenceAt: null,
      previewPlaceholder: false,
      contactResearchStatus: partial.contactResearchStatus ?? null,
      contactDiscoveryResult: partial.contactDiscoveryResult ?? null,
      contactResearchNextAt: partial.contactResearchNextAt ?? null,
      contactResearchLastAt: partial.contactResearchLastAt ?? null
    }
  };
}

const now = Date.parse('2026-09-23T15:00:00Z');

describe('acqEmailDiscoveryStats', () => {
  it('separates missing emails from eligible-now vs backoff', () => {
    const missingEligible = row({ prospectId: 'a' });
    const missingBackoff = row({
      prospectId: 'b',
      contactResearchNextAt: '2026-09-24T16:43:48Z',
      contactResearchLastAt: '2026-09-22T16:43:48Z'
    });
    const notFoundBackoff = row({
      prospectId: 'c',
      contactResearchStatus: 'not_found',
      contactDiscoveryResult: 'not_found',
      contactResearchNextAt: '2026-09-24T16:43:48Z'
    });
    const review = row({
      prospectId: 'd',
      email: 'maybe@example.com',
      contactStatus: 'review_email',
      contactResearchStatus: 'review_email'
    });
    const verified = row({
      prospectId: 'e',
      email: 'ok@example.com',
      contactStatus: 'verified_public',
      contactType: 'business'
    });

    const census = censusDiscovery(
      [missingEligible, missingBackoff, notFoundBackoff, review, verified],
      14,
      now,
      true
    );
    assert.equal(census.missingEmail, 3);
    assert.equal(census.eligibleNow, 1);
    assert.equal(census.inBackoff, 2);
    assert.equal(census.needsReview, 1);
    assert.equal(census.noEmailFound, 1);
    assert.equal(census.jobCandidates, 4);
    assert.equal(census.extraJobOnly, 1);
    assert.deepEqual(census.eligibleIds, ['a']);
  });

  it('does not count skipped_backoff as searched', () => {
    const job: AcqEmailDiscoveryJob = {
      jobId: 'ed-test',
      campaign: 'COOK-001',
      adminEmail: 'admin@example.com',
      dryRun: false,
      forceRetry: false,
      startedAt: '2026-09-23T15:00:00Z',
      updatedAt: '2026-09-23T15:01:00Z',
      status: 'completed',
      prospectIds: Array.from({ length: 79 }, (_, i) => `p${i}`),
      cursor: 79,
      processed: 79,
      found: 0,
      review: 0,
      notFound: 0,
      failed: 0,
      skipped: 79,
      results: Array.from({ length: 79 }, (_, i) => ({
        prospectId: `p${i}`,
        handle: `@h${i}`,
        outcome: 'skipped_backoff',
        detail: 'Backoff until 2026-09-24T16:43:48Z'
      }))
    };
    const t = summarizeDiscoveryJob(job);
    assert.ok(t);
    assert.equal(t.candidates, 79);
    assert.equal(t.evaluated, 79);
    assert.equal(t.searched, 0);
    assert.equal(t.skippedBackoff, 79);
    assert.equal(t.found, 0);
    assert.equal(t.notFound, 0);
    assert.equal(t.remaining, 0);
  });

  it('counts real searches separately from skips', () => {
    const t = summarizeDiscoveryJob({
      jobId: 'ed-mix',
      campaign: 'COOK-001',
      adminEmail: 'a',
      dryRun: false,
      forceRetry: false,
      startedAt: '',
      updatedAt: '',
      status: 'running',
      prospectIds: ['1', '2', '3', '4', '5'],
      cursor: 4,
      processed: 4,
      found: 1,
      review: 1,
      notFound: 1,
      failed: 0,
      skipped: 1,
      results: [
        { prospectId: '1', handle: '@a', outcome: 'found' },
        { prospectId: '2', handle: '@b', outcome: 'review' },
        { prospectId: '3', handle: '@c', outcome: 'not_found' },
        { prospectId: '4', handle: '@d', outcome: 'skipped_backoff' }
      ]
    });
    assert.equal(t?.evaluated, 4);
    assert.equal(t?.searched, 3);
    assert.equal(t?.skippedBackoff, 1);
    assert.equal(t?.remaining, 1);
  });

  it('formats backoff timestamps in Eastern time', () => {
    const label = formatDiscoveryRetryEt('2026-09-24T16:43:48Z');
    assert.match(label || '', /Sep 24, 2026/);
    assert.match(label || '', /ET/);
    assert.doesNotMatch(label || '', /T16:43:48Z/);
    assert.equal(outcomeLabel('skipped_backoff'), 'SKIPPED_BACKOFF');
    assert.match(parseBackoffUntil('Backoff until 2026-09-24T16:43:48Z') || '', /Sep 24/);
  });

  it('normalizes mariongrasby duplicate as ERROR with assigned-email reason', () => {
    const t = summarizeDiscoveryJob({
      jobId: 'ed-marion',
      campaign: 'COOK-001',
      adminEmail: 'a',
      dryRun: false,
      forceRetry: false,
      startedAt: '',
      updatedAt: '',
      status: 'completed',
      prospectIds: ['COOK-001-d2640d32'],
      cursor: 1,
      processed: 1,
      found: 0,
      review: 0,
      notFound: 0,
      failed: 1,
      skipped: 0,
      results: [
        {
          prospectId: 'COOK-001-d2640d32',
          handle: '@mariongrasby',
          outcome: 'failed',
          email: 'partnerships@marionskitchen.com',
          confidence: 'high',
          sourceUrl: 'https://www.marionskitchen.com/miso-corn-cheese-korokke',
          detail: 'Duplicate of @marionskitchen'
        }
      ]
    });
    assert.equal(normalizeEmailDiscoveryOutcome('failed'), 'ERROR');
    assert.equal(t?.searched, 1);
    assert.equal(t?.found, 0);
    assert.equal(t?.failed, 1);
    assert.equal(emailDiscoveryJobTitle('completed', t), 'EMAIL SEARCH FAILED');
    assert.equal(emailDiscoveryErrorReason('Duplicate of @marionskitchen'), 'Email already assigned to @marionskitchen');
  });

  it('counts found review not_found already-has and backoff distinctly', () => {
    const t = summarizeDiscoveryJob({
      jobId: 'ed-mix2',
      campaign: 'COOK-001',
      adminEmail: 'a',
      dryRun: false,
      forceRetry: false,
      startedAt: '',
      updatedAt: '',
      status: 'completed',
      prospectIds: ['1', '2', '3', '4', '5'],
      cursor: 5,
      processed: 5,
      found: 1,
      review: 1,
      notFound: 1,
      failed: 0,
      skipped: 2,
      results: [
        { prospectId: '1', handle: '@a', outcome: 'found', email: 'a@x.com', confidence: 'high' },
        { prospectId: '2', handle: '@b', outcome: 'review', email: 'b@x.com', confidence: 'medium' },
        { prospectId: '3', handle: '@c', outcome: 'not_found' },
        { prospectId: '4', handle: '@d', outcome: 'skipped_existing', email: 'd@x.com' },
        { prospectId: '5', handle: '@e', outcome: 'skipped_backoff' }
      ]
    });
    assert.equal(t?.searched, 3);
    assert.equal(t?.found, 1);
    assert.equal(t?.review, 1);
    assert.equal(t?.notFound, 1);
    assert.equal(t?.failed, 0);
    assert.equal(t?.skippedBackoff, 1);
    assert.equal(t?.skippedOther, 1);
    assert.equal(normalizeEmailDiscoveryOutcome('skipped_existing'), 'ALREADY_HAS_EMAIL');
    assert.equal(emailDiscoveryJobTitle('completed', t), 'EMAIL SEARCH COMPLETE');
    assert.match(emailDiscoverySummaryLine(t!), /3 attempted/);
  });

  it('keeps FOUND when a later warning is recorded', () => {
    const t = summarizeDiscoveryJob({
      jobId: 'ed-warn',
      campaign: 'COOK-001',
      adminEmail: 'a',
      dryRun: false,
      forceRetry: false,
      startedAt: '',
      updatedAt: '',
      status: 'completed',
      prospectIds: ['1'],
      cursor: 1,
      processed: 1,
      found: 1,
      review: 0,
      notFound: 0,
      failed: 0,
      skipped: 0,
      results: [
        {
          prospectId: '1',
          handle: '@ok',
          outcome: 'found',
          email: 'ok@x.com',
          confidence: 'high',
          warning: 'Post-discovery telemetry failed'
        }
      ]
    });
    assert.equal(t?.found, 1);
    assert.equal(t?.failed, 0);
    assert.equal(emailDiscoveryJobTitle('completed', t), 'EMAIL SEARCH COMPLETE');
    assert.equal(emailDiscoveryJobTitle('running', t), 'FINDING EMAILS');
  });

  it('formats long backoff as days instead of raw hours', () => {
    const horizon = formatBackoffHorizon('2026-10-05T16:43:48Z', Date.parse('2026-09-23T15:00:00Z'));
    assert.match(horizon || '', /days/);
    assert.doesNotMatch(horizon || '', /292 hours/);
  });

  it('treats backoff as not eligible now', () => {
    const r = row({ contactResearchNextAt: '2026-09-24T16:43:48Z' });
    assert.equal(isDiscoveryBackoff(r, now), true);
    assert.equal(isBackendNeedsEmailDiscovery(r), true);
    assert.equal(isBackendNeedsEmailDiscovery(row({ email: 'ok@x.com', contactStatus: 'verified_public' })), false);
  });
});
