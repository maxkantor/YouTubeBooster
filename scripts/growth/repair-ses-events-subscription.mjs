/**
 * Ensure SNS HTTPS subscription for SES events uses the CURRENT SSM key.
 * Does not print secrets.
 */
import { spawnSync } from 'node:child_process';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TOPIC_ARN =
  process.env.YB_SES_EVENTS_TOPIC_ARN ||
  'arn:aws:sns:us-east-1:718522948657:yb-creator-acquisition-ses-events';
const API_BASE =
  process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const SSM_KEY = '/youtubebooster/outreach/ses-events-key';

function aws(args, json = false) {
  const r = spawnSync('aws', [...args, '--region', REGION], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status !== 0) return { ok: false, out, err, status: r.status };
  if (json && out) {
    try {
      return { ok: true, data: JSON.parse(out) };
    } catch {
      return { ok: true, out };
    }
  }
  return { ok: true, out };
}

const keyRes = aws([
  'ssm',
  'get-parameter',
  '--name',
  SSM_KEY,
  '--with-decryption',
  '--query',
  'Parameter.Value',
  '--output',
  'text'
]);
if (!keyRes.ok || !keyRes.out || keyRes.out === 'None') {
  console.log(JSON.stringify({ ok: false, step: 'ssm', error: keyRes.err || 'missing' }));
  process.exit(1);
}
const key = keyRes.out.trim();
const endpoint = `${API_BASE.replace(/\/$/, '')}/api/public/acq/ses-events?key=${encodeURIComponent(key)}`;

const list = aws(['sns', 'list-subscriptions-by-topic', '--topic-arn', TOPIC_ARN], true);
const subs = list.data?.Subscriptions || [];
const httpsSubs = subs.filter((s) => String(s.Protocol || '').toLowerCase() === 'https');

let matching = 0;
let stale = 0;
for (const s of httpsSubs) {
  const ep = String(s.Endpoint || '');
  if (ep === endpoint) matching++;
  else {
    stale++;
    if (s.SubscriptionArn && s.SubscriptionArn !== 'PendingConfirmation') {
      aws(['sns', 'unsubscribe', '--subscription-arn', s.SubscriptionArn]);
    }
  }
}

let created = false;
if (matching === 0) {
  const sub = aws(
    [
      'sns',
      'subscribe',
      '--topic-arn',
      TOPIC_ARN,
      '--protocol',
      'https',
      '--notification-endpoint',
      endpoint,
      '--return-subscription-arn'
    ],
    true
  );
  created = sub.ok;
  if (!sub.ok) {
    console.log(JSON.stringify({ ok: false, step: 'subscribe', error: sub.err }));
    process.exit(1);
  }
}

// Direct auth check without printing key
let directProbeHttp = 0;
try {
  const res = await fetch(`${API_BASE.replace(/\/$/, '')}/api/public/acq/ses-events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Outreach-Ses-Key': key
    },
    body: JSON.stringify({ prospectId: 'COOK-001-07d69360', eventType: 'delivery' })
  });
  directProbeHttp = res.status;
  await res.text();
} catch (e) {
  directProbeHttp = -1;
}

console.log(
  JSON.stringify(
    {
      ok: true,
      keyLength: key.length,
      matchingSubscriptions: matching || (created ? 1 : 0),
      staleUnsubscribed: stale,
      subscriptionRecreated: created,
      directProbeHttp,
      note: 'If directProbeHttp is 200, delivery apply works; SNS subscription uses current SSM key.'
    },
    null,
    2
  )
);
