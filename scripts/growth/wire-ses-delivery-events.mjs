#!/usr/bin/env node
/**
 * Wire SES configuration-set events → SNS → API /api/public/acq/ses-events
 * so CRM can distinguish SES_ACCEPTED vs DELIVERED / BOUNCED / COMPLAINED.
 *
 * Idempotent. Does not print secrets.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const CONFIG_SET = process.env.YB_SES_CONFIG_SET || 'yb-creator-acquisition';
const TOPIC_NAME = process.env.YB_SES_EVENTS_TOPIC || 'yb-creator-acquisition-ses-events';
const DEST_NAME = process.env.YB_SES_EVENT_DEST || 'yb-crm-ses-events';
const API_BASE =
  process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const SSM_KEY = '/youtubebooster/outreach/ses-events-key';

function aws(args, { json = false } = {}) {
  const r = spawnSync('aws', [...args, '--region', REGION], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status !== 0) {
    return { ok: false, status: r.status, out, err };
  }
  if (json && out) {
    try {
      return { ok: true, data: JSON.parse(out), out };
    } catch {
      return { ok: true, out };
    }
  }
  return { ok: true, out };
}

function ensureConfigSet() {
  const d = aws(['ses', 'describe-configuration-set', '--configuration-set-name', CONFIG_SET]);
  if (d.ok) return { ok: true, created: false };
  const c = aws(['ses', 'create-configuration-set', '--configuration-set', `Name=${CONFIG_SET}`]);
  return { ok: c.ok, created: c.ok, error: c.ok ? null : c.err };
}

function ensureSesEventsKey() {
  const get = aws(
    ['ssm', 'get-parameter', '--name', SSM_KEY, '--with-decryption', '--query', 'Parameter.Value', '--output', 'text']
  );
  const existing = (get.out || '').trim();
  if (get.ok && existing && existing !== 'None' && existing.length >= 24) {
    return { ok: true, rotated: false, length: existing.length, value: existing };
  }
  const value = randomBytes(32).toString('hex');
  const put = aws([
    'ssm',
    'put-parameter',
    '--name',
    SSM_KEY,
    '--type',
    'SecureString',
    '--value',
    value,
    '--overwrite'
  ]);
  return { ok: put.ok, rotated: true, length: value.length, value, error: put.ok ? null : put.err };
}

function ensureTopic() {
  const create = aws(['sns', 'create-topic', '--name', TOPIC_NAME], { json: true });
  if (!create.ok) return { ok: false, error: create.err };
  const arn = create.data?.TopicArn || null;
  return { ok: Boolean(arn), arn };
}

function ensureSubscription(topicArn, endpointUrl) {
  const list = aws(['sns', 'list-subscriptions-by-topic', '--topic-arn', topicArn], { json: true });
  const subs = list.data?.Subscriptions || [];
  const existing = subs.find(
    (s) =>
      String(s.Protocol || '').toLowerCase() === 'https' &&
      String(s.Endpoint || '') === endpointUrl
  );
  if (existing) {
    return { ok: true, created: false, subscriptionArn: existing.SubscriptionArn };
  }
  const sub = aws(
    [
      'sns',
      'subscribe',
      '--topic-arn',
      topicArn,
      '--protocol',
      'https',
      '--notification-endpoint',
      endpointUrl,
      '--return-subscription-arn'
    ],
    { json: true }
  );
  return {
    ok: sub.ok,
    created: sub.ok,
    subscriptionArn: sub.data?.SubscriptionArn || sub.out || null,
    error: sub.ok ? null : sub.err
  };
}

function ensureEventDestination(topicArn) {
  const list = aws(
    ['ses', 'describe-configuration-set-event-destinations', '--configuration-set-name', CONFIG_SET],
    { json: true }
  );
  const dests = list.data?.EventDestinations || list.data?.ConfigurationSetEventDestinations || [];
  const existing = dests.find((d) => d.Name === DEST_NAME || d.Name === DEST_NAME);
  if (existing) {
    return { ok: true, created: false, name: DEST_NAME };
  }

  const matching = dests.find(
    (d) => d.SNSDestination?.TopicARN === topicArn || d.SnsDestination?.TopicArn === topicArn
  );
  if (matching) {
    return { ok: true, created: false, name: matching.Name };
  }

  const payload = {
    Name: DEST_NAME,
    Enabled: true,
    MatchingEventTypes: ['send', 'reject', 'bounce', 'complaint', 'delivery'],
    SNSDestination: { TopicARN: topicArn }
  };
  const create = aws([
    'ses',
    'create-configuration-set-event-destination',
    '--configuration-set-name',
    CONFIG_SET,
    '--event-destination',
    JSON.stringify(payload)
  ]);
  return { ok: create.ok, created: create.ok, name: DEST_NAME, error: create.ok ? null : create.err };
}

function main() {
  const key = ensureSesEventsKey();
  if (!key.ok) {
    console.log(JSON.stringify({ ok: false, step: 'ssm_key', error: key.error }, null, 2));
    process.exit(1);
  }

  const cfg = ensureConfigSet();
  if (!cfg.ok) {
    console.log(JSON.stringify({ ok: false, step: 'config_set', error: cfg.error }, null, 2));
    process.exit(1);
  }

  const topic = ensureTopic();
  if (!topic.ok) {
    console.log(JSON.stringify({ ok: false, step: 'sns_topic', error: topic.error }, null, 2));
    process.exit(1);
  }

  const endpoint = `${API_BASE.replace(/\/$/, '')}/api/public/acq/ses-events?key=${encodeURIComponent(key.value)}`;
  const sub = ensureSubscription(topic.arn, endpoint);
  if (!sub.ok) {
    console.log(JSON.stringify({ ok: false, step: 'sns_subscribe', error: sub.error }, null, 2));
    process.exit(1);
  }

  const dest = ensureEventDestination(topic.arn);
  if (!dest.ok) {
    console.log(JSON.stringify({ ok: false, step: 'event_destination', error: dest.error }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        configSet: CONFIG_SET,
        configSetCreated: cfg.created,
        topicArn: topic.arn,
        subscriptionCreated: sub.created,
        eventDestination: dest.name,
        eventDestinationCreated: dest.created,
        sesEventsKeyRotated: key.rotated,
        sesEventsKeyLength: key.length,
        endpointHost: new URL(API_BASE).host,
        note: 'SNS will POST Delivery/Bounce/Complaint to /api/public/acq/ses-events; CRM persists status (never fabricate DELIVERED from SendEmail alone).'
      },
      null,
      2
    )
  );
}

main();
