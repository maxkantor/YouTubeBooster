#!/usr/bin/env node
/**
 * One-off: send approved P05 (and P04 only if official mailto exists).
 * Never prints recipient addresses. Does not enable COOK-001.
 */
import { spawnSync } from 'node:child_process';

const API = process.env.YB_API_BASE || 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com';
const REGION = process.env.AWS_REGION || 'us-east-1';

function ssmGet(name, secure = false) {
  const args = ['ssm', 'get-parameter', '--name', name, '--region', REGION, '--query', 'Parameter.Value', '--output', 'text'];
  if (secure) args.splice(4, 0, '--with-decryption');
  const r = spawnSync('aws', args, { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const v = (r.stdout || '').trim();
  return v && v !== 'None' ? v : null;
}

function extractMailto(html) {
  const matches = [...String(html).matchAll(/mailto:([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/gi)];
  const emails = [...new Set(matches.map((m) => m[1].trim().toLowerCase()))];
  return emails.filter((e) => !e.endsWith('.png') && !e.includes('example.com'));
}

function cookiesFromResponse(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

const postal = ssmGet('/youtubebooster/business/postal-address', false);
if (!postal || postal.length < 10) {
  console.log(JSON.stringify({ ok: false, error: 'postal_missing' }));
  process.exit(1);
}

const kelvinHtml = await (await fetch('https://kelvinskitchen.com/contact/')).text();
const kelvinEmails = extractMailto(kelvinHtml);
const p04 = kelvinEmails.length ? { status: 'CONFIRMED' } : { status: 'FORM_ONLY' };

const sohlaHtml = await (await fetch('https://hellosohla.com/')).text();
const sohlaEmails = extractMailto(sohlaHtml);
const p05Email = sohlaEmails.find((e) => e.includes('mvetalent.com') || e.includes('sohla')) || sohlaEmails[0] || null;
const p05 = p05Email ? { status: 'CONFIRMED' } : { status: 'BLOCKED' };

const email = ssmGet('/youtubebooster/admin/email', false);
const password = ssmGet('/youtubebooster/admin/password', true);
if (!email || !password) {
  console.log(JSON.stringify({ ok: false, error: 'admin_ssm_missing', p04, p05: p05.status }));
  process.exit(1);
}

const login = await fetch(`${API}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
});
if (!login.ok) {
  console.log(JSON.stringify({ ok: false, error: 'admin_login_failed', status: login.status }));
  process.exit(1);
}
const cookie = cookiesFromResponse(login);
if (!cookie) {
  console.log(JSON.stringify({ ok: false, error: 'no_session_cookie' }));
  process.exit(1);
}

const ticketsRes = await fetch(`${API}/api/admin/crm/support/tickets?limit=100`, { headers: { cookie } });
const tickets = ticketsRes.ok ? await ticketsRes.json() : { items: [] };
const items = tickets.items || [];
const alreadyP05 = items.some((t) => {
  const ref = String(t.orderReference || t.OrderReference || '');
  const sub = String(t.subject || t.Subject || '');
  const ch = String(t.channelUrl || t.ChannelUrl || '');
  return ref === 'P05' || sub.includes('SohlaAndHam') || ch.toLowerCase().includes('sohlaandham');
});

const bodyP05 =
  'Hi — I looked at @SohlaAndHam publicly. Recent posts (Strange Delight / #hamssandwiches) are active, but almost every recent description in the sample looks weak for search/shelf and several titles still hide the payoff. I’d test one tighter description + outcome line on the next sandwich/avocado upload. Mini audit: https://youtubeboosterai.com/share?channel=%40SohlaAndHam&utm_source=founder_outreach&utm_medium=dm&utm_campaign=acq_2026_08_14&utm_content=P05';

let p05Send = { status: 'NOT_ATTEMPTED' };
if (p05.status !== 'CONFIRMED') {
  p05Send = { status: 'FAILED', reason: 'recipient_not_confirmed' };
} else if (alreadyP05) {
  p05Send = { status: 'SKIPPED_DUPLICATE' };
} else {
  const send = await fetch(`${API}/api/admin/crm/support/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      email: p05Email,
      name: 'Sohla and Ham',
      channelUrl: 'https://www.youtube.com/@SohlaAndHam',
      prospectId: 'P05',
      subject: 'Public note on @SohlaAndHam descriptions',
      body: bodyP05,
      sendNow: true
    })
  });
  const text = await send.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  if (send.ok && json.sent === true && json.sesMessageId) {
    p05Send = {
      status: 'SENT',
      ticketId: json.ticketId,
      sesMessageId: json.sesMessageId
    };
  } else {
    p05Send = {
      status: 'FAILED',
      http: send.status,
      error: json.error || json.detail || json.title || json.raw || 'send_failed',
      sent: json.sent === true
    };
  }
}

console.log(
  JSON.stringify(
    {
      ok: p05Send.status === 'SENT',
      postalConfigured: true,
      p04: { recipient: p04.status, send: 'SKIPPED' },
      p05: { recipient: p05.status, send: p05Send },
      cook001Automation: 'DISABLED',
      emailsPrinted: false
    },
    null,
    2
  )
);
