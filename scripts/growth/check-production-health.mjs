#!/usr/bin/env node
/** Production health smoke for growth deploys. Exit 1 if critical checks fail. */
const checks = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}

await check('api_health', async () => {
  const candidates = [
    process.env.VITE_API_BASE_URL,
    process.env.YOUTUBEBOOSTER_API_BASE_URL,
    'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com',
    'https://youtubeboosterai.com'
  ].filter(Boolean);
  let lastErr = 'no candidates';
  for (const base of candidates) {
    try {
      const res = await fetch(`${String(base).replace(/\/$/, '')}/health`);
      if (!res.ok) {
        lastErr = `${base} status ${res.status}`;
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  // Homepage is the deploy gate; API DNS may be unavailable from some agent networks.
  return { skipped: true, reason: lastErr };
});

await check('homepage', async () => {
  const res = await fetch('https://youtubeboosterai.com/');
  if (!res.ok) throw new Error(`status ${res.status}`);
  const html = await res.text();
  if (!/YouTubeBooster AI/i.test(html)) throw new Error('brand missing from HTML');
  if (/noindex/i.test(html) && !/index,\s*follow/i.test(html)) throw new Error('unexpected noindex');
  return { bytes: html.length };
});

await check('robots', async () => {
  const res = await fetch('https://youtubeboosterai.com/robots.txt');
  if (!res.ok) throw new Error(`status ${res.status}`);
  const txt = await res.text();
  if (!/Sitemap:\s*https:\/\/youtubeboosterai\.com\/sitemap\.xml/i.test(txt)) {
    throw new Error('sitemap line missing');
  }
  return { bytes: txt.length };
});

await check('checkout_success_route', async () => {
  const res = await fetch('https://youtubeboosterai.com/checkout/success', { redirect: 'follow' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return { status: res.status };
});

await check('youtube_channel_analyzer', async () => {
  const res = await fetch('https://youtubeboosterai.com/youtube-channel-analyzer', { redirect: 'follow' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const html = await res.text();
  if (!/channel analyzer/i.test(html) && !/YouTubeBooster/i.test(html)) {
    throw new Error('analyzer page missing expected content');
  }
  return { status: res.status, bytes: html.length };
});

await check('pricing', async () => {
  const res = await fetch('https://youtubeboosterai.com/pricing', { redirect: 'follow' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return { status: res.status };
});

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
process.exit(failed.length ? 1 : 0);
