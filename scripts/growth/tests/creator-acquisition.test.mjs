import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CSV_HEADER,
  csvContainsEmail,
  csvRow,
  subscriberRange
} from '../lib/creator-acquisition.mjs';

test('sanitized CSV never includes email addresses', () => {
  const row = csvRow({
    prospectId: 'COOK-001-P001',
    channelName: 'Example Cook',
    handle: '@examplecook',
    channelUrl: 'https://www.youtube.com/@examplecook',
    niche: 'cooking',
    subscriberRange: '1k_100k',
    recentUploadDate: '2026-08-10',
    fitScore: 82,
    opportunityCategory: 'weak_descriptions',
    contactSourceUrl: 'https://example-creator.test/contact',
    contactStatus: 'Contact route available — automated email unavailable',
    approvalStatus: 'none'
  });
  const csv = `${CSV_HEADER}\n${row}`;
  assert.equal(csvContainsEmail(csv), false);
  assert.doesNotMatch(csv, /hello@/);
});

test('subscriber range buckets', () => {
  assert.equal(subscriberRange(999), 'under_1k');
  assert.equal(subscriberRange(1000), '1k_100k');
  assert.equal(subscriberRange(100000), '1k_100k');
  assert.equal(subscriberRange(250000), '100k_350k');
});
