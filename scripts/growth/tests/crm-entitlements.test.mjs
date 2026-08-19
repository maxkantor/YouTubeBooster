import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeCrmEntitlements } from '../lib/crm-entitlements.mjs';

test('CRM entitlements count live paid to entitled within 24h without emails', () => {
  const paid = Date.parse('2026-08-18T12:00:00.000Z');
  const summary = summarizeCrmEntitlements({
    payments: [
      {
        paymentId: 'pay_1',
        userId: 'user_1',
        status: 'completed',
        mode: 'live',
        amount: '49.99',
        paidAt: '2026-08-18T12:00:00.000Z',
        entitlementGranted: true
      },
      {
        paymentId: 'pay_test',
        userId: 'user_2',
        status: 'completed',
        mode: 'test',
        amount: '49.99',
        paidAt: '2026-08-18T12:00:00.000Z',
        entitlementGranted: true
      }
    ],
    entitlements: [
      {
        userId: 'user_1',
        status: 'active',
        source: 'live_payment',
        grantedAt: '2026-08-18T12:30:00.000Z',
        paymentId: 'pay_1'
      }
    ],
    startYmd: '2026-08-12',
    endYmd: '2026-08-18',
    nowMs: Date.parse('2026-08-19T00:00:00.000Z')
  });
  assert.equal(summary.livePaidPayments, 1);
  assert.equal(summary.entitledPaidUsers, 1);
  assert.equal(summary.paidToEntitledWithin24h, 1);
  assert.equal(JSON.stringify(summary).includes('@'), false);
  assert.ok(paid);
});

test('CRM entitlements: zero live payments is 0 not invented customers', () => {
  const summary = summarizeCrmEntitlements({
    payments: [],
    entitlements: [],
    startYmd: '2026-08-12',
    endYmd: '2026-08-18'
  });
  assert.equal(summary.livePaidPayments, 0);
  assert.equal(summary.entitledPaidUsers, 0);
  assert.equal(summary.paidToEntitledWithin24h, 0);
});
