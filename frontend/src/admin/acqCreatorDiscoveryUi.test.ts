import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  creatorDiscoveryBadge,
  creatorDiscoveryPhase,
  creatorDiscoveryProgress,
  creatorDiscoveryTitle,
  discoveryHttpHint,
  discoveryInterruptMessage,
  isTransientDiscoveryError
} from './acqCreatorDiscoveryUi';

describe('acqCreatorDiscoveryUi', () => {
  it('calculates added/target percentage', () => {
    assert.deepEqual(creatorDiscoveryProgress(8, 25), { pct: 32, remaining: 17 });
    assert.deepEqual(creatorDiscoveryProgress(25, 25), { pct: 100, remaining: 0 });
    assert.equal(creatorDiscoveryProgress(3, 0).pct, null);
  });

  it('maps job status to running complete partial failed', () => {
    assert.equal(creatorDiscoveryPhase('running', 8, 25), 'running');
    assert.equal(creatorDiscoveryPhase('completed', 25, 25), 'complete');
    assert.equal(creatorDiscoveryPhase('completed', 8, 25), 'partial');
    assert.equal(creatorDiscoveryPhase('interrupted', 8, 25), 'partial');
    assert.equal(creatorDiscoveryPhase('failed', 0, 25), 'failed');
    assert.equal(creatorDiscoveryPhase('running', 8, 25, true), 'partial');
  });

  it('treats HTTP 503 as a transient interrupt', () => {
    assert.equal(isTransientDiscoveryError(new Error('Request failed with status 503')), true);
    assert.equal(discoveryHttpHint(new Error('Request failed with status 503')), 'HTTP 503');
    assert.match(discoveryInterruptMessage(8, 25, 'HTTP 503'), /8 of 25/);
    assert.doesNotMatch(discoveryInterruptMessage(8, 25, 'HTTP 503'), /503/);
  });

  it('labels running complete partial failed', () => {
    assert.equal(creatorDiscoveryTitle('partial'), '⚠ Discovery partially completed');
    assert.equal(creatorDiscoveryBadge('running'), 'RUNNING');
    assert.equal(creatorDiscoveryTitle('complete'), '✓ Creator discovery complete');
    assert.equal(creatorDiscoveryTitle('running'), 'DISCOVERING CREATORS');
  });
});
