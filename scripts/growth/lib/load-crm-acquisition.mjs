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
 * @returns {Promise<{ ok: boolean, outreachFunnel?: object, error?: string }>}
 */
export async function loadCrmAcquisitionSummary() {
  try {
    const cookie = await adminLogin();
    const summary = await adminJson(cookie, '/api/admin/crm/acquisition/summary');
    if (!summary.ok) {
      return { ok: false, error: `crm_summary_http_${summary.status}` };
    }
    const s = summary.json || {};
    return {
      ok: true,
      outreachFunnel: {
        drafted: s.drafts ?? 0,
        approved: s.approved ?? 0,
        sent: s.sent ?? 0,
        delivered: s.delivered ?? 'Unknown',
        clicked: 'Unknown',
        converted: s.converted ?? 0
      },
      marketingSendingEnabled: s.marketingSendingEnabled === true,
      contactVerified: s.contactVerified ?? 0,
      discovered: s.discovered ?? 0
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
