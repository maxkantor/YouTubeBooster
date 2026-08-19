import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRedirectsFile, LEGACY_301 } from '../../../frontend/scripts/hosting-redirect-rules.mjs';

test('hosting redirects send SEO paths to unique HTML, not the SPA shell', () => {
  const file = buildRedirectsFile(['/', '/audit', '/pricing', '/blog', '/blog/ai-channel-audit-explained']);
  assert.match(file, /\/audit {2}\/audit\/index\.html {2}200/);
  assert.match(file, /\/pricing {2}\/pricing\/index\.html {2}200/);
  assert.match(file, /\/blog\/ai-channel-audit-explained {2}\/blog\/ai-channel-audit-explained\/index\.html {2}200/);
  assert.doesNotMatch(file, /\/audit {2}\/index\.html {2}200/);
  assert.match(file, /\/admin\/\* {2}\/index\.html {2}200/);
  assert.doesNotMatch(file, /^\/\* {2}\/index\.html {2}200$/m);
});

test('retired GSC URLs are 301s', () => {
  const map = Object.fromEntries(LEGACY_301);
  assert.equal(map['/audit-youtube-channel'], '/audit');
  assert.equal(map['/how-did-youtubebooster-work'], '/faq');
  assert.equal(map['/low-click-through-rate-youtube'], '/low-ctr-on-youtube');
});
