import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explainWeekdaySendResult, tallySkipReasons } from './acqWeekdaySendResult';
import { deliveredDisplay } from './acqUiShared';

describe('acqWeekdaySendResult', () => {
  it('explains 0 sent when the ready queue is empty', () => {
    const view = explainWeekdaySendResult(
      { attempted: 0, sent: 0, skipped: 101, reasonCounts: { NOT_APPROVED: 101 } },
      { approvedWaiting: 0, eligibleNow: 0, needsApproval: 0 }
    );
    assert.equal(view.sent, 0);
    assert.equal(view.skipped, 101);
    assert.equal(view.openApprovals, true);
    assert.match(view.headline, /0 sent/i);
    assert.match(view.explanation, /eligible now are both 0/i);
    assert.deepEqual(view.skipLines, ['Not approved: 101']);
  });

  it('points at Approvals when drafts still need approval', () => {
    const view = explainWeekdaySendResult(
      { sent: 0, skipped: 16, reasonCounts: { NOT_APPROVED: 16 } },
      { approvedWaiting: 0, eligibleNow: 0, needsApproval: 16 }
    );
    assert.equal(view.openApprovals, true);
    assert.match(view.explanation, /16 still need approval/);
  });

  it('does not treat a real send as a dead click', () => {
    const view = explainWeekdaySendResult({ sent: 2, skipped: 8, attempted: 2, reasonCounts: { COOLDOWN: 8 } });
    assert.equal(view.openApprovals, false);
    assert.match(view.headline, /Sent 2/);
    assert.deepEqual(view.skipLines, ['In cooldown: 8']);
  });

  it('tallies skip reasons from prospect:code lines when counts are missing', () => {
    const rows = tallySkipReasons({
      reasons: ['p1:not_approved', 'p2:not_approved', 'p3:cooldown']
    });
    assert.deepEqual(rows, [
      { code: 'NOT_APPROVED', count: 2 },
      { code: 'COOLDOWN', count: 1 }
    ]);
  });
});

describe('deliveredDisplay', () => {
  it('does not present untracked SES delivery as zero deliveries', () => {
    assert.equal(deliveredDisplay(33, 0, false), 'Not tracked');
    assert.equal(deliveredDisplay(33, 4, true), '4');
    assert.equal(deliveredDisplay(0, 0, false), '0');
  });
});
