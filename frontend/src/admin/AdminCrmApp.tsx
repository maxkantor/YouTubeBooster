import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type {
  AdminDemoAuditRow,
  AdminEntitlementRecord,
  AdminOperationalDashboard,
  AdminOrderRow,
  AdminPaymentRecord,
  AdminSupportTicketRow,
  AdminUserRow,
  AdminActivityEventRow
} from '../types';
import { useAdminCrm } from './useAdminCrm';
import {
  AuditFilterBar,
  Badge,
  filterAudits,
  filterOrders,
  filterSupport,
  OrderFilterBar,
  SectionCard,
  UserRowActions,
  userStatusBadge
} from './AdminCrmComponents';

const NAV: { to: string; end?: boolean; label: string }[] = [
  { to: '', end: true, label: 'Dashboard' },
  { to: 'users', label: 'Users' },
  { to: 'orders', label: 'Orders' },
  { to: 'audits', label: 'Audits' },
  { to: 'contacts', label: 'Contacts' },
  { to: 'activity', label: 'Activity logs' }
];

const ENTITLEMENT_PRESETS = [
  { value: 'premium', label: 'Premium (legacy)' },
  { value: 'dashboard_access', label: 'Dashboard access' },
  { value: 'paid_audit_access', label: 'Paid audit access' },
  { value: 'premium_feature_access', label: 'Premium features' },
  { value: 'support_priority', label: 'Support priority' }
];

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function orderClassificationMeta(c: string) {
  const x = (c || '').toLowerCase();
  if (x.includes('free') || x.includes('test') || x.includes('zero')) return { kind: 'info' as const, label: c };
  if (x.includes('unmatched') || x.includes('malformed')) return { kind: 'warn' as const, label: c };
  if (x.includes('paid') || x === 'live_paid') return { kind: 'ok' as const, label: c };
  return { kind: 'neutral' as const, label: c };
}

function contactsStatusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'open') return <Badge kind="ok">open</Badge>;
  if (s === 'pending') return <Badge kind="warn">pending</Badge>;
  if (s === 'resolved') return <Badge kind="info">resolved</Badge>;
  if (s === 'closed') return <Badge kind="bad">closed</Badge>;
  if (!s) return <Badge kind="neutral">unknown</Badge>;
  return <Badge kind="neutral">{status}</Badge>;
}

function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { adminSession, onSignOut } = useAdminCrm();
  return (
    <div className="admin-crm-root">
      <aside className="admin-crm-sidebar">
        <div className="admin-crm-brand">YouTubeBooster AI · Ops</div>
        <nav className="admin-crm-nav">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to || 'home'}
              to={to ? `/admin/${to}` : '/admin'}
              end={!!end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="admin-crm-main">
        <header className="admin-crm-topbar">
          <h1>{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="admin-crm-pill">{adminSession.email}</span>
            <button type="button" className="admin-crm-btn" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>
        <div className="admin-crm-body">{children}</div>
      </div>
    </div>
  );
}

export function AdminHomePage() {
  const [range, setRange] = useState('30d');
  const [dash, setDash] = useState<AdminOperationalDashboard | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    adminApi
      .crmDashboard(range)
      .then(setDash)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'));
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminShell title="Dashboard">
      <div className="admin-crm-toolbar" style={{ marginBottom: 16 }}>
        <span style={{ color: '#94a3b8', marginRight: 8 }}>Range</span>
        {(['today', '7d', '30d', 'all'] as const).map((r) => (
          <button
            key={r}
            type="button"
            className={`admin-crm-seg ${range === r ? 'admin-crm-seg-active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === 'all' ? 'All time' : r}
          </button>
        ))}
      </div>
      {error && <p className="admin-crm-error">{error}</p>}
      {!dash && !error && <p style={{ color: '#64748b' }}>Loading operational metrics…</p>}
      {dash && (
        <>
          <div className="admin-crm-metric-grid admin-crm-metric-grid-dense">
            <div className="admin-crm-metric">
              <span>Total users</span>
              <strong>{dash.kpis.totalUsers}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Active entitled</span>
              <strong>{dash.kpis.activeEntitledUsers}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Demo completions</span>
              <strong>{dash.kpis.totalDemos}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Paid live orders</span>
              <strong>{dash.kpis.paidLiveOrders}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Revenue (live USD)</span>
              <strong>{formatMoney(dash.kpis.revenueLiveUsd, 'USD')}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Demo → paid %</span>
              <strong>{dash.kpis.demoToPaidConversionPct.toFixed(1)}%</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Failed / unpaid</span>
              <strong>{dash.kpis.failedOrUnpaidCheckouts}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Open contacts</span>
              <strong>{dash.kpis.openSupportTickets}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Unmatched payments</span>
              <strong>{dash.kpis.unmatchedPayments}</strong>
            </div>
          </div>

          {dash.attentionRequired.length > 0 && (
            <div className="admin-crm-panel admin-crm-panel-attention">
              <h2>Attention required</h2>
              <ul className="admin-crm-attn-list">
                {dash.attentionRequired.map((a, i: number) => (
                  <li key={`${a.code}-${i}`}>
                    <Badge kind="warn">{a.code}</Badge> {a.message}
                    {a.relatedId && (
                      <>
                        {' '}
                        <code className="admin-crm-mono">{a.relatedId}</code>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="admin-crm-panel">
            <h2>Recent activity</h2>
            {dash.recentActivity.length === 0 ? (
              <p className="admin-crm-muted">No events in this range.</p>
            ) : (
              <div className="admin-crm-table-wrap">
                <table className="admin-crm-table admin-crm-table-sticky">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>Scope / detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.recentActivity.map((item, i: number) => (
                      <tr key={`${item.title}-${item.timestamp}-${i}`}>
                        <td className="admin-crm-nowrap">{formatDt(item.timestamp)}</td>
                        <td>{item.title}</td>
                        <td style={{ maxWidth: 480 }}>{item.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-crm-two-col">
            <div className="admin-crm-panel">
              <h2>Orders needing attention</h2>
              {dash.ordersNeedingAttention.length === 0 ? (
                <p className="admin-crm-muted">None.</p>
              ) : (
                <MiniOrderTable rows={dash.ordersNeedingAttention} />
              )}
            </div>
            <div className="admin-crm-panel">
              <h2>Contacts queue</h2>
              {dash.supportQueue.length === 0 ? (
                <p className="admin-crm-muted">Queue clear.</p>
              ) : (
                <MiniSupportTable rows={dash.supportQueue} />
              )}
            </div>
          </div>

          <div className="admin-crm-two-col">
            <div className="admin-crm-panel">
              <h2>Recently entitled users</h2>
              {dash.recentlyEntitledUsers.length === 0 ? (
                <p className="admin-crm-muted">None.</p>
              ) : (
                <div className="admin-crm-table-wrap">
                  <table className="admin-crm-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {dash.recentlyEntitledUsers.map((u) => (
                        <tr key={u.userId}>
                          <td>
                            <Link to={`/admin/user/${encodeURIComponent(u.userId)}`}>{u.email}</Link>
                          </td>
                          <td>{userStatusBadge(u.userStatus)}</td>
                          <td className="admin-crm-nowrap">{formatDt(u.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="admin-crm-panel">
              <h2>Audit issues</h2>
              {dash.recentAuditIssues.length === 0 ? (
                <p className="admin-crm-muted">None flagged.</p>
              ) : (
                <div className="admin-crm-table-wrap">
                  <table className="admin-crm-table">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Type</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.recentAuditIssues.map((r: AdminDemoAuditRow) => (
                        <tr key={r.demoId}>
                          <td>{r.channelTitle || r.channelInput}</td>
                          <td>{r.auditType}</td>
                          <td>
                            <Badge kind={r.status === 'failed' ? 'bad' : 'warn'}>{r.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function MiniOrderTable({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <div className="admin-crm-table-wrap">
      <table className="admin-crm-table admin-crm-table-sm">
        <thead>
          <tr>
            <th>Email</th>
            <th>Amount</th>
            <th>Class</th>
            <th>Mode</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const m = orderClassificationMeta(o.classification);
            return (
              <tr key={o.paymentId}>
                <td>{o.accountEmail || o.stripeEmail || '—'}</td>
                <td>{formatMoney(o.amount, o.currency)}</td>
                <td>
                  <Badge kind={m.kind}>{m.label}</Badge>
                </td>
                <td>{o.mode}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniSupportTable({ rows }: { rows: AdminSupportTicketRow[] }) {
  return (
    <div className="admin-crm-table-wrap">
      <table className="admin-crm-table admin-crm-table-sm">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.ticketId}>
              <td>
                <Link to={`/admin/contacts/${encodeURIComponent(t.ticketId)}`}>{t.subject}</Link>
              </td>
              <td>
                {contactsStatusBadge(t.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type UserFilter =
  | 'all'
  | 'active'
  | 'suspended'
  | 'deactivated'
  | 'purchased'
  | 'not_purchased'
  | 'entitled'
  | 'not_entitled'
  | 'verified'
  | 'unverified'
  | 'recent7d';

export function UsersPage() {
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');

  const fetchPage = async (cursor: string | null, append: boolean) => {
    try {
      const res = await adminApi.crmUsers(50, cursor);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  };

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmUsers(50, null)
      .then((res) => {
        if (!c) {
          setItems(res.items);
          setNext(res.nextCursor);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load users');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await adminApi.crmUsers(50, null);
      setItems(res.items);
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter((u) => u.email.toLowerCase().includes(qq));
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (filter === 'active') list = list.filter((u) => (u.userStatus || 'active').toLowerCase() === 'active');
    if (filter === 'suspended') list = list.filter((u) => (u.userStatus || '').toLowerCase() === 'suspended');
    if (filter === 'deactivated') list = list.filter((u) => (u.userStatus || '').toLowerCase() === 'deactivated');
    if (filter === 'purchased') list = list.filter((u) => u.purchased);
    if (filter === 'not_purchased') list = list.filter((u) => !u.purchased);
    if (filter === 'entitled')
      list = list.filter(
        (u) =>
          u.purchased ||
          (u.entitlementsSummary && !u.entitlementsSummary.toLowerCase().includes('none') && u.entitlementsSummary.trim() !== '')
      );
    if (filter === 'not_entitled')
      list = list.filter(
        (u) =>
          !u.purchased &&
          (!u.entitlementsSummary || u.entitlementsSummary.toLowerCase().includes('none') || u.entitlementsSummary.trim() === '')
      );
    if (filter === 'verified') list = list.filter((u) => u.emailVerified);
    if (filter === 'unverified') list = list.filter((u) => !u.emailVerified);
    if (filter === 'recent7d')
      list = list.filter((u) => {
        const t = new Date(u.createdAt).getTime();
        return !Number.isNaN(t) && t >= sevenDaysAgo;
      });
    return list;
  }, [items, q, filter]);

  return (
    <AdminShell title="Users">
      {error && <p className="admin-crm-error">{error}</p>}
      <div className="admin-crm-toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <input
          className="admin-crm-input admin-crm-input-inline"
          placeholder="Search email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="admin-crm-select" value={filter} onChange={(e) => setFilter(e.target.value as UserFilter)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
          <option value="purchased">Has purchase flag</option>
          <option value="not_purchased">No purchase flag</option>
          <option value="entitled">Entitled / premium</option>
          <option value="not_entitled">Not entitled</option>
          <option value="verified">Email verified</option>
          <option value="unverified">Email not verified</option>
          <option value="recent7d">New (7d)</option>
        </select>
      </div>
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading users…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No users match.</div>
      ) : (
        <>
          <div className="admin-crm-table-wrap">
            <table className="admin-crm-table admin-crm-table-sticky">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Entitlements</th>
                  <th>Purchased</th>
                  <th>Verified</th>
                  <th>Last login</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.userId} className="admin-crm-row-click">
                    <td>
                      <Link to={`/admin/user/${encodeURIComponent(u.userId)}`}>{u.email}</Link>
                    </td>
                    <td>{userStatusBadge(u.userStatus)}</td>
                    <td style={{ maxWidth: 200 }} title={u.entitlementsSummary}>
                      {u.entitlementsSummary || '—'}
                    </td>
                    <td>
                      <Badge kind={u.purchased ? 'ok' : 'neutral'}>{u.purchased ? 'yes' : 'no'}</Badge>
                    </td>
                    <td>
                      <Badge kind={u.emailVerified ? 'ok' : 'warn'}>{u.emailVerified ? 'yes' : 'no'}</Badge>
                    </td>
                    <td className="admin-crm-nowrap">{u.lastLoginAt ? formatDt(u.lastLoginAt) : '—'}</td>
                    <td className="admin-crm-nowrap">{formatDt(u.createdAt)}</td>
                    <td className="admin-crm-nowrap">{formatDt(u.updatedAt)}</td>
                    <td>
                      <UserRowActions user={u} onChanged={refreshUsers} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {next && (
            <button
              type="button"
              className="admin-crm-btn"
              style={{ marginTop: 16 }}
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await fetchPage(next, true);
                setLoadingMore(false);
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </AdminShell>
  );
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.crmUser>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [grantType, setGrantType] = useState('dashboard_access');
  const [grantReason, setGrantReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    setLoading(true);
    adminApi
      .crmUser(id)
      .then((d) => {
        setData(d);
        setNote(d.user.adminNotes ?? '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Not found'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function patchUser(body: { userStatus?: string; adminNotes?: string }) {
    if (!id) return;
    setBusy('patch');
    try {
      await adminApi.crmPatchUser(id, body);
      await adminApi.crmUser(id).then(setData);
    } finally {
      setBusy(null);
    }
  }

  async function grantEntitlement() {
    if (!id) return;
    setBusy('grant');
    try {
      await adminApi.crmGrantEntitlement(id, { accessType: grantType, reason: grantReason || null });
      setGrantReason('');
      reload();
    } finally {
      setBusy(null);
    }
  }

  async function revokeEntitlement(e: AdminEntitlementRecord) {
    if (!id) return;
    const reason = window.prompt('Revoke reason (optional)') ?? '';
    if (reason === null) return;
    setBusy(`revoke-${e.entitlementId}`);
    try {
      await adminApi.crmRevokeEntitlement(id, e.entitlementId, reason);
      reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="User detail">
      <button type="button" className="admin-crm-btn" style={{ marginBottom: 16 }} onClick={() => navigate('/admin/users')}>
        ← Users
      </button>
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {error && <p className="admin-crm-error">{error}</p>}
      {data && (
        <>
          <div className="admin-crm-panel">
            <div className="admin-crm-user-header">
              <div>
                <h2 style={{ margin: '0 0 8px' }}>{data.user.email}</h2>
                <p className="admin-crm-muted" style={{ margin: 0 }}>
                  ID <code className="admin-crm-mono">{data.user.userId}</code> · Cognito access: {data.user.accessStatus} · Created{' '}
                  {formatDt(data.user.createdAt)}
                </p>
              </div>
              <div className="admin-crm-actions">
                <button
                  type="button"
                  className="admin-crm-btn"
                  disabled={!!busy}
                  onClick={() => patchUser({ userStatus: 'active' })}
                >
                  Activate
                </button>
                <button
                  type="button"
                  className="admin-crm-btn"
                  disabled={!!busy}
                  onClick={() => patchUser({ userStatus: 'suspended' })}
                >
                  Suspend
                </button>
                <button
                  type="button"
                  className="admin-crm-btn"
                  disabled={!!busy}
                  onClick={() => {
                    if (!window.confirm('Deactivate user? They lose access until re-activated.')) return;
                    patchUser({ userStatus: 'deactivated' });
                  }}
                >
                  Deactivate
                </button>
              </div>
            </div>
            <p style={{ marginTop: 12 }}>
              Status {userStatusBadge(data.user.userStatus)} · Email{' '}
              <Badge kind={data.user.emailVerified ? 'ok' : 'warn'}>{data.user.emailVerified ? 'verified' : 'unverified'}</Badge> ·
              Channel {data.user.channelUrl ?? '—'}
            </p>
          </div>

          <SectionCard title="Admin notes">
            <textarea className="admin-crm-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal notes…" />
            <button
              type="button"
              className="admin-crm-btn admin-crm-btn-primary"
              disabled={saving}
              onClick={async () => {
                if (!id) return;
                setSaving(true);
                try {
                  await adminApi.crmPatchUser(id, { adminNotes: note });
                  await adminApi.crmUser(id).then(setData);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          </SectionCard>

          <SectionCard title="Grant entitlement">
            <p className="admin-crm-muted">Grants are recorded server-side; access flags reconcile from entitlements.</p>
            <div className="admin-crm-toolbar" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select className="admin-crm-select" value={grantType} onChange={(e) => setGrantType(e.target.value)}>
                {ENTITLEMENT_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                className="admin-crm-input admin-crm-input-inline"
                style={{ minWidth: 240 }}
                placeholder="Reason (support ticket, promo, …)"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
              <button type="button" className="admin-crm-btn admin-crm-btn-primary" disabled={!!busy} onClick={grantEntitlement}>
                Grant
              </button>
            </div>
          </SectionCard>

          <SectionCard title={`Entitlements (${data.entitlements.length})`}>
            {data.entitlements.length === 0 ? (
              <p className="admin-crm-muted">None.</p>
            ) : (
              <div className="admin-crm-table-wrap">
                <table className="admin-crm-table admin-crm-table-sm">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Source</th>
                      <th>Granted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.entitlements.map((e: AdminEntitlementRecord) => (
                      <tr key={e.entitlementId}>
                        <td>{e.accessType}</td>
                        <td>
                          <Badge kind={e.status === 'active' ? 'ok' : 'bad'}>{e.status}</Badge>
                        </td>
                        <td>{e.source}</td>
                        <td className="admin-crm-nowrap">{formatDt(e.grantedAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="admin-crm-btn admin-crm-btn-tiny"
                            disabled={!!busy || e.status !== 'active'}
                            onClick={() => revokeEntitlement(e)}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Stripe payments (${data.stripePayments.length})`}>
            {data.stripePayments.length === 0 ? (
              <p className="admin-crm-muted">None.</p>
            ) : (
              <div className="admin-crm-table-wrap">
                <table className="admin-crm-table admin-crm-table-sm">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Mode</th>
                      <th>Session</th>
                      <th>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stripePayments.map((p: AdminPaymentRecord) => (
                      <tr key={p.paymentId}>
                        <td>
                          {formatMoney(p.amount, p.currency)} <span className="admin-crm-muted">{p.planCode}</span>
                        </td>
                        <td>{p.status}</td>
                        <td>
                          <Badge kind={p.mode === 'live' ? 'ok' : 'info'}>{p.mode}</Badge>
                        </td>
                        <td>
                          <code className="admin-crm-mono" title={p.stripeCheckoutSessionId}>
                            {p.stripeCheckoutSessionId.slice(0, 14)}…
                          </code>
                        </td>
                        <td className="admin-crm-nowrap">{p.paidAt ? formatDt(p.paidAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Legacy purchases (${data.purchases.length})`}>
            {data.purchases.length === 0 ? (
              <p className="admin-crm-muted">None.</p>
            ) : (
              <div className="admin-crm-table-wrap">
                <table className="admin-crm-table admin-crm-table-sm">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchases.map((p) => (
                      <tr key={p.purchaseId}>
                        <td>
                          {p.amount} {p.currency}
                        </td>
                        <td>{p.status}</td>
                        <td>{formatDt(p.purchasedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {data.onboarding && (
            <SectionCard title="Onboarding">
              <p className="admin-crm-muted">Goal: {data.onboarding.growthGoal ?? '—'}</p>
            </SectionCard>
          )}

          <SectionCard title="Recent events">
            {data.recentEvents.length === 0 ? (
              <p className="admin-crm-muted">None.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, color: '#94a3b8' }}>
                {data.recentEvents.map((ev, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>
                    <strong style={{ color: '#cbd5e1' }}>{ev.title}</strong>: {ev.detail}{' '}
                    <span style={{ fontSize: 12 }}>({formatDt(ev.timestamp)})</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </AdminShell>
  );
}

export function OrdersPage() {
  const [items, setItems] = useState<AdminOrderRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [linkSession, setLinkSession] = useState('');
  const [linkUser, setLinkUser] = useState('');
  const [linking, setLinking] = useState(false);

  const filteredOrders = useMemo(() => filterOrders(items, orderFilter), [items, orderFilter]);

  const fetchPage = async (cursor: string | null, append: boolean) => {
    try {
      const res = await adminApi.crmOrders(50, cursor);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    }
  };

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmOrders(50, null)
      .then((res) => {
        if (!c) {
          setItems(res.items);
          setNext(res.nextCursor);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load orders');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  async function copyText(t: string) {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  }

  return (
    <AdminShell title="Orders">
      {error && <p className="admin-crm-error">{error}</p>}
      <div className="admin-crm-panel">
        <h2>Link Stripe checkout to user</h2>
        <p className="admin-crm-muted">Use when purchaser email does not match Cognito yet.</p>
        <div className="admin-crm-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            className="admin-crm-input admin-crm-input-inline"
            placeholder="Stripe checkout session ID"
            value={linkSession}
            onChange={(e) => setLinkSession(e.target.value)}
            style={{ minWidth: 280 }}
          />
          <input
            className="admin-crm-input admin-crm-input-inline"
            placeholder="User ID"
            value={linkUser}
            onChange={(e) => setLinkUser(e.target.value)}
            style={{ minWidth: 280 }}
          />
          <button
            type="button"
            className="admin-crm-btn admin-crm-btn-primary"
            disabled={linking || !linkSession.trim() || !linkUser.trim()}
            onClick={async () => {
              setLinking(true);
              try {
                await adminApi.crmLinkOrder(linkSession.trim(), linkUser.trim());
                setLinkSession('');
                setLinkUser('');
                await fetchPage(null, false);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Link failed');
              } finally {
                setLinking(false);
              }
            }}
          >
            {linking ? 'Linking…' : 'Link order'}
          </button>
        </div>
      </div>
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No payment rows.</div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <OrderFilterBar value={orderFilter} onChange={setOrderFilter} />
          </div>
          {filteredOrders.length === 0 ? (
            <div className="admin-crm-panel admin-crm-empty">No orders match this filter.</div>
          ) : (
            <div className="admin-crm-table-wrap">
              <table className="admin-crm-table admin-crm-table-sticky">
                <thead>
                  <tr>
                    <th>Classification</th>
                    <th>Email</th>
                    <th>User</th>
                    <th>Product</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Mode</th>
                    <th>Stripe session</th>
                    <th>Created</th>
                    <th>Paid</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const m = orderClassificationMeta(o.classification);
                    const rowTone =
                      m.kind === 'info' ? 'admin-crm-row-muted' : o.userId ? '' : 'admin-crm-row-warn';
                    return (
                      <tr key={o.paymentId} className={rowTone}>
                        <td>
                          <Badge kind={m.kind}>{m.label}</Badge>
                        </td>
                        <td>{o.accountEmail || o.stripeEmail || '—'}</td>
                        <td>
                          {o.userId ? (
                            <Link to={`/admin/user/${encodeURIComponent(o.userId)}`}>{o.userId.slice(0, 8)}…</Link>
                          ) : (
                            <span className="admin-crm-muted">unmatched</span>
                          )}
                        </td>
                        <td>{o.planCode}</td>
                        <td>{formatMoney(o.amount, o.currency)}</td>
                        <td>{o.status}</td>
                        <td>
                          <Badge kind={o.mode === 'live' ? 'ok' : 'info'}>{o.mode}</Badge>
                        </td>
                        <td>
                          <code className="admin-crm-mono">{o.stripeCheckoutSessionId.slice(0, 12)}…</code>
                        </td>
                        <td className="admin-crm-nowrap">{formatDt(o.createdAt)}</td>
                        <td className="admin-crm-nowrap">{o.paidAt ? formatDt(o.paidAt) : '—'}</td>
                        <td>
                          <button type="button" className="admin-crm-btn admin-crm-btn-tiny" onClick={() => copyText(o.stripeCheckoutSessionId)}>
                            Copy session
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {next && (
            <button
              type="button"
              className="admin-crm-btn"
              style={{ marginTop: 16 }}
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await fetchPage(next, true);
                setLoadingMore(false);
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </AdminShell>
  );
}

/** @deprecated Use OrdersPage */
export const PaymentsPage = OrdersPage;

export function AuditsPage() {
  const [items, setItems] = useState<AdminDemoAuditRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [auditFilter, setAuditFilter] = useState('all');

  const filteredAudits = useMemo(() => filterAudits(items, auditFilter), [items, auditFilter]);

  const fetchPage = async (cursor: string | null, append: boolean) => {
    try {
      const res = await adminApi.crmAudits(50, cursor);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audits');
    }
  };

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmAudits(50, null)
      .then((res) => {
        if (!c) {
          setItems(res.items);
          setNext(res.nextCursor);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load audits');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="Audits">
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No audits recorded.</div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <AuditFilterBar value={auditFilter} onChange={setAuditFilter} />
          </div>
          {filteredAudits.length === 0 ? (
            <div className="admin-crm-panel admin-crm-empty">No audits match this filter.</div>
          ) : (
            <div className="admin-crm-table-wrap">
              <table className="admin-crm-table admin-crm-table-sticky">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Handle</th>
                    <th>User</th>
                    <th>Type</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Visibility</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudits.map((r) => (
                    <tr key={r.demoId}>
                      <td>{r.channelTitle || r.channelInput}</td>
                      <td>{r.channelHandle || '—'}</td>
                      <td>
                        {r.linkedUserId ? (
                          <Link to={`/admin/user/${encodeURIComponent(r.linkedUserId)}`}>linked</Link>
                        ) : (
                          <span className="admin-crm-muted">—</span>
                        )}
                      </td>
                      <td>{r.auditType}</td>
                      <td>{r.healthScore}</td>
                      <td>{r.status}</td>
                      <td>{r.visibility}</td>
                      <td className="admin-crm-nowrap">{formatDt(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {next && (
            <button
              type="button"
              className="admin-crm-btn"
              style={{ marginTop: 16 }}
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await fetchPage(next, true);
                setLoadingMore(false);
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </AdminShell>
  );
}

export function ContactListPage() {
  const [items, setItems] = useState<AdminSupportTicketRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [draftStatus, setDraftStatus] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredSupport = useMemo(() => filterSupport(items, statusFilter), [items, statusFilter]);

  const fetchPage = async (cursor: string | null, append: boolean) => {
    try {
      const res = await adminApi.crmSupportTickets(50, cursor);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    }
  };

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmSupportTickets(50, null)
      .then((res) => {
        if (!c) {
          setItems(res.items);
          setNext(res.nextCursor);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load tickets');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="Contacts">
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No contacts.</div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div className="admin-crm-toolbar" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <select className="admin-crm-select" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
                <option value="all">All status</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <button
                type="button"
                className="admin-crm-btn admin-crm-btn-primary"
                onClick={() => setStatusFilter(draftStatus)}
              >
                Filter
              </button>
            </div>
          </div>
          {filteredSupport.length === 0 ? (
            <div className="admin-crm-panel admin-crm-empty">No contacts match this filter.</div>
          ) : (
            <div className="admin-crm-table-wrap">
              <table className="admin-crm-table admin-crm-table-sticky">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupport.map((t) => (
                    <tr key={t.ticketId}>
                      <td>{t.name ?? '—'}</td>
                      <td>{t.email}</td>
                      <td>
                        <Link to={`/admin/contacts/${encodeURIComponent(t.ticketId)}`}>{t.subject}</Link>
                      </td>
                      <td>{contactsStatusBadge(t.status)}</td>
                      <td className="admin-crm-nowrap">{formatDt(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {next && (
            <button
              type="button"
              className="admin-crm-btn"
              style={{ marginTop: 16 }}
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await fetchPage(next, true);
                setLoadingMore(false);
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </AdminShell>
  );
}

export function ContactTicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.crmSupportTicket>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('Re: ');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');

  useEffect(() => {
    if (!ticketId) return;
    let c = false;
    setLoading(true);
    adminApi
      .crmSupportTicket(ticketId)
      .then((d) => {
        if (!c) {
          setData(d);
          setSubject(`Re: ${d.ticket.subject}`);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Not found');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, [ticketId]);

  async function sendReply() {
    if (!ticketId || !body.trim()) return;
    setSending(true);
    setSendErr('');
    try {
      await adminApi.crmSupportReply(ticketId, subject, body);
      const refreshed = await adminApi.crmSupportTicket(ticketId);
      setData(refreshed);
      setBody('');
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminShell title="Contact thread">
      <button type="button" className="admin-crm-btn" style={{ marginBottom: 16 }} onClick={() => navigate('/admin/contacts')}>
        ← Inbox
      </button>
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {error && <p className="admin-crm-error">{error}</p>}
      {data && (
        <>
          <div className="admin-crm-panel">
            <h2>{data.ticket.subject}</h2>
            <p style={{ color: '#94a3b8' }}>
              {data.ticket.email} · {data.ticket.status} · {data.name ?? '—'}
            </p>
            {data.ticket.linkedUserId && (
              <p>
                <Link to={`/admin/user/${encodeURIComponent(data.ticket.linkedUserId)}`}>Open linked user</Link>
              </p>
            )}
            <div className="admin-crm-thread" style={{ marginTop: 16 }}>
              <div className="admin-crm-msg admin-crm-msg-in">
                <div className="admin-crm-msg-meta">Original · {formatDt(data.ticket.createdAt)}</div>
                <div className="admin-crm-msg-body">{data.message}</div>
              </div>
              {data.thread.map((m) => (
                <div
                  key={m.messageId}
                  className={`admin-crm-msg ${m.direction.toLowerCase() === 'outbound' ? 'admin-crm-msg-out' : 'admin-crm-msg-in'}`}
                >
                  <div className="admin-crm-msg-meta">
                    {m.direction} · {formatDt(m.sentAt)}
                    {m.sesMessageId ? (
                      <>
                        {' '}
                        · SES <code className="admin-crm-mono">{m.sesMessageId}</code>
                      </>
                    ) : null}
                    {m.deliveryStatus ? ` · ${m.deliveryStatus}` : ''}
                  </div>
                  <div className="admin-crm-msg-body">{m.body}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-crm-panel">
            <h2>Reply (SES)</h2>
            {sendErr && <p className="admin-crm-error">{sendErr}</p>}
            <input className="admin-crm-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
            <textarea className="admin-crm-textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" />
            <button type="button" className="admin-crm-btn admin-crm-btn-primary" disabled={sending || !body.trim()} onClick={sendReply}>
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </>
      )}
    </AdminShell>
  );
}

export function ActivityLogsPage() {
  const [items, setItems] = useState<AdminActivityEventRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = async (cursor: string | null, append: boolean) => {
    try {
      const res = await adminApi.crmActivity(100, cursor);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    }
  };

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmActivity(100, null)
      .then((res) => {
        if (!c) {
          setItems(res.items);
          setNext(res.nextCursor);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load activity');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="Activity logs">
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No recorded events.</div>
      ) : (
        <>
          <div className="admin-crm-table-wrap">
            <table className="admin-crm-table admin-crm-table-sticky">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Scope</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={`${row.eventName}-${row.createdAt}-${i}`}>
                    <td className="admin-crm-nowrap">{formatDt(row.createdAt)}</td>
                    <td>{row.eventName}</td>
                    <td style={{ maxWidth: 220 }}>{row.scope}</td>
                    <td>
                      <pre className="admin-crm-meta-pre">{JSON.stringify(row.metadata ?? {}, null, 0)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {next && (
            <button
              type="button"
              className="admin-crm-btn"
              style={{ marginTop: 16 }}
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await fetchPage(next, true);
                setLoadingMore(false);
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </AdminShell>
  );
}

export const SystemLogsPage = ActivityLogsPage;
