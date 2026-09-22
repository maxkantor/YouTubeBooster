/**
 * Admin-authenticated CRM acquisition summary for growth reporting.
 * Never prints emails or secrets.
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

function cookiesFromResponse(res) {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(';')[0] : '';
}

async function adminLogin() {
  const email = ssmGet('/youtubebooster/admin/email', false);
  const password = ssmGet('/youtubebooster/admin/password', true);
  if (!email || !password) throw new Error('admin_ssm_missing');
  const login = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) throw new Error(`admin_login_failed:${login.status}`);
  const cookie = cookiesFromResponse(login);
  if (!cookie) throw new Error('no_session_cookie');
  return cookie;
}

async function adminJson(cookie, pathName, opts = {}) {
  const res = await fetch(`${API}${pathName}`, {
    ...opts,
    headers: { cookie, 'content-type': 'application/json', ...(opts.headers || {}) }
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Authoritative CRM board for reports — same /summary the Admin Approvals page uses.
 * @returns {Promise<{ ok: boolean, outreachFunnel?: object, pipeline?: object, crmBoard?: object, error?: string }>}
 */
export async function loadCrmAcquisitionSummary() {
  try {
    const cookie = await adminLogin();
    const summary = await adminJson(cookie, '/api/admin/crm/acquisition/summary');
    if (!summary.ok) {
      return { ok: false, error: `crm_summary_http_${summary.status}` };
    }
    const s = summary.json || {};
    const draftsGenerated = s.draftsGenerated ?? s.pipeline?.drafted ?? s.drafts ?? 0;
    return {
      ok: true,
      outreachFunnel: {
        drafted: draftsGenerated,
        approved: s.approved ?? 0,
        sent: s.sent ?? 0,
        delivered: s.delivered ?? 0,
        clicked: s.clicked ?? 0,
        converted: s.converted ?? 0
      },
      cohortFunnel: s.cohortFunnel || null,
      pipeline: s.pipeline || null,
      crmBoard: s.crmBoard || {
        totalProspects: s.prospectsEvaluated ?? s.discovered ?? 0,
        draftsGenerated,
        needsApproval: s.needsApproval ?? 0,
        readyToSend: s.approved ?? 0,
        recentlySent: s.sentLast7Days ?? 0,
        recentlySentWindowDays: s.recentlySentWindowDays ?? 7,
        sentToday: s.sentToday ?? 0,
        sentLifetime: s.sent ?? 0,
        usableEmails: s.contactVerified ?? 0,
        needsEmail: Math.max(0, (s.prospectsEvaluated ?? 0) - (s.contactVerified ?? 0)),
        notReviewable: s.pipeline?.notReviewable || null,
        notReviewableTotal: s.pipeline?.notReviewableTotal ?? 0,
        approvalsUrl: 'https://youtubeboosterai.com/admin/acquisition/approvals'
      },
      needsApproval: s.needsApproval ?? 0,
      sentToday: s.sentToday ?? 0,
      sentLast7Days: s.sentLast7Days ?? 0,
      dailyLimit: s.dailyLimit ?? 10,
      dailyRemaining: s.dailyRemaining ?? 0,
      sendEligible: s.sendEligible ?? 0,
      marketingSendingEnabled: s.marketingSendingEnabled === true,
      contactVerified: s.contactVerified ?? 0,
      discovered: s.discovered ?? 0,
      skipReasonCounts: s.skipReasonCounts || null,
      primaryBlocker: s.primaryBlocker || null
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
