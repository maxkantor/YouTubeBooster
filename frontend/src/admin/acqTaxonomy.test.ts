import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACQ_CATEGORIES, ACQ_DEFAULT_CATEGORY, ACQ_LANGUAGES, deriveCreatorTier } from './acqTaxonomy';

describe('acqTaxonomy', () => {
  it('keeps cooking as default and first category', () => {
    assert.equal(ACQ_DEFAULT_CATEGORY, 'cooking');
    assert.equal(ACQ_CATEGORIES[0].id, 'cooking');
  });

  it('includes English, Russian, Hindi as active languages', () => {
    const active = ACQ_LANGUAGES.filter((l) => l.phase === 'active').map((l) => l.id);
    assert.deepEqual(active, ['en', 'ru', 'hi']);
  });

  it('derives tiers without requiring exact celebrity targeting', () => {
    assert.equal(deriveCreatorTier(2500), 'emerging');
    assert.equal(deriveCreatorTier(25000), 'growing');
    assert.equal(deriveCreatorTier(250000), 'established');
    assert.equal(deriveCreatorTier(2_000_000), 'major');
    assert.equal(deriveCreatorTier(5000, true), 'strategic');
  });
});
