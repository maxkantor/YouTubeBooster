import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type {
  AdminDemoAuditRow,
  AdminEntitlementRecord,
  AdminOrderRow,
  AdminPaymentRecord,
  AdminSupportTicketRow,
  AdminUserRow,
  AdminActivityEventRow,
  AdminDiagnosticRow,
  AdminDiagnosticsResponse,
  AdminFunnelEventDiagnostic
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
import { AdminShell } from './AdminShell';

export { AdminShell } from './AdminShell';
export { AdminDashboardPage as AdminHomePage } from './AdminDashboardPage';

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
  const [totalCount, setTotalCount] = useState<number | null>(null);
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
      if (res.totalCount != null) setTotalCount(res.totalCount);
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
          if (res.totalCount != null) setTotalCount(res.totalCount);
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
      {totalCount != null && (
        <p className="admin-crm-muted" style={{ marginBottom: 8 }}>
          {totalCount} registered user{totalCount === 1 ? '' : 's'} in DynamoDB (matches dashboard Total Users).
        </p>
      )}
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
                    <th>Created</th>
                    <th>Email</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Livemode</th>
                    <th>Stripe session</th>
                    <th>Entitlement</th>
                    <th>Source</th>
                    <th>Notes</th>
                    <th>User</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const rowTone = o.userId ? '' : 'admin-crm-row-warn';
                    return (
                      <tr key={o.paymentId} className={rowTone}>
                        <td className="admin-crm-nowrap">{formatDt(o.createdAt)}</td>
                        <td>{o.accountEmail || o.stripeEmail || '—'}</td>
                        <td>{formatMoney(o.amount, o.currency)}</td>
                        <td>{o.status}</td>
                        <td>
                          <Badge kind={o.mode === 'live' ? 'ok' : 'info'}>{o.mode === 'live' ? 'live' : 'test'}</Badge>
                        </td>
                        <td>
                          <code className="admin-crm-mono">{o.stripeCheckoutSessionId.slice(0, 12)}…</code>
                        </td>
                        <td>{o.entitlementGranted ? <Badge kind="ok">yes</Badge> : <span className="admin-crm-muted">no</span>}</td>
                        <td>{o.source || 'stripe'}</td>
                        <td style={{ maxWidth: 160 }}>{o.statusNote || '—'}</td>
                        <td>
                          {o.userId ? (
                            <Link to={`/admin/user/${encodeURIComponent(o.userId)}`}>{o.userId.slice(0, 8)}…</Link>
                          ) : (
                            <span className="admin-crm-muted">unmatched</span>
                          )}
                        </td>
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
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminSupportTicketRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [draftStatus, setDraftStatus] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [linkFilter, setLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [outEmail, setOutEmail] = useState('');
  const [outName, setOutName] = useState('');
  const [outChannel, setOutChannel] = useState('');
  const [outProspect, setOutProspect] = useState('');
  const [outSubject, setOutSubject] = useState('');
  const [outBody, setOutBody] = useState('');
  const [outSending, setOutSending] = useState(false);
  const [outErr, setOutErr] = useState('');

  const filteredSupport = useMemo(() => {
    const base = filterSupport(items, statusFilter);
    const searchTerm = search.trim().toLowerCase();
    const linkedFiltered = linkFilter === 'all'
      ? base
      : base.filter((t) => (linkFilter === 'linked' ? !!t.linkedUserId : !t.linkedUserId));
    if (!searchTerm) return linkedFiltered;
    return linkedFiltered.filter((t) => {
      return (
        t.ticketId.toLowerCase().includes(searchTerm) ||
        t.email.toLowerCase().includes(searchTerm) ||
        t.subject.toLowerCase().includes(searchTerm)
      );
    });
  }, [items, statusFilter, search, linkFilter]);

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

  const sendOutreach = async () => {
    setOutErr('');
    setOutSending(true);
    try {
      const res = await adminApi.crmComposeOutreach({
        email: outEmail.trim(),
        name: outName.trim() || undefined,
        channelUrl: outChannel.trim() || undefined,
        prospectId: outProspect.trim() || undefined,
        subject: outSubject.trim(),
        body: outBody.trim(),
        sendNow: true
      });
      if (res.ticketId) navigate(`/admin/contacts/${encodeURIComponent(res.ticketId)}`);
    } catch (e) {
      setOutErr(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setOutSending(false);
    }
  };

  return (
    <AdminShell title="Support">
      {error && <p className="admin-crm-error">{error}</p>}
      <div className="admin-crm-panel" style={{ marginBottom: 16 }}>
        <h2>Send outreach (SES)</h2>
        <p className="admin-crm-muted">
          From: <code>contact@youtubeboosterai.com</code> (SSM <code>ses/from-email</code>). Reply-To and BCC: Admin CRM inbox
          (SSM <code>admin/email</code>). Paste an address only from the creator’s public contact page — do not guess. The sent
          message is stored on this Support thread.
        </p>
        {outErr && <p className="admin-crm-error">{outErr}</p>}
        <div className="admin-crm-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <input className="admin-crm-input" placeholder="Recipient email (from public contact page)" value={outEmail} onChange={(e) => setOutEmail(e.target.value)} style={{ minWidth: 280 }} />
          <input className="admin-crm-input" placeholder="Name" value={outName} onChange={(e) => setOutName(e.target.value)} />
          <input className="admin-crm-input" placeholder="Channel URL" value={outChannel} onChange={(e) => setOutChannel(e.target.value)} style={{ minWidth: 240 }} />
          <input className="admin-crm-input" placeholder="Prospect ID (P01…)" value={outProspect} onChange={(e) => setOutProspect(e.target.value)} style={{ width: 120 }} />
        </div>
        <input className="admin-crm-input" placeholder="Subject" value={outSubject} onChange={(e) => setOutSubject(e.target.value)} style={{ width: '100%', marginTop: 8 }} />
        <textarea className="admin-crm-textarea" placeholder="Message" value={outBody} onChange={(e) => setOutBody(e.target.value)} style={{ marginTop: 8 }} />
        <button
          type="button"
          className="admin-crm-btn admin-crm-btn-primary"
          style={{ marginTop: 8 }}
          disabled={outSending || !outEmail.trim() || !outSubject.trim() || !outBody.trim()}
          onClick={sendOutreach}
        >
          {outSending ? 'Sending…' : 'Send and open thread'}
        </button>
      </div>
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No contacts yet. Send outreach above to create the first thread.</div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div className="admin-crm-toolbar" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                className="admin-crm-input"
                placeholder="Search by email, subject, or ticket id"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: 260 }}
              />
              <select className="admin-crm-select" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
                <option value="all">All status</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select className="admin-crm-select" value={linkFilter} onChange={(e) => setLinkFilter(e.target.value as any)}>
                <option value="all">All links</option>
                <option value="linked">Linked users</option>
                <option value="unlinked">Unlinked</option>
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
                    <th>Ticket</th>
                    <th>Subject</th>
                    <th>Contact</th>
                    <th>Linked user</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Last message</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSupport.map((t) => (
                    <tr key={t.ticketId}>
                      <td className="admin-crm-mono">{t.ticketId}</td>
                      <td>
                        <Link to={`/admin/contacts/${encodeURIComponent(t.ticketId)}`}>{t.subject}</Link>
                      </td>
                      <td>
                        <div>{t.name ?? '—'}</div>
                        <div className="admin-crm-muted">{t.email}</div>
                      </td>
                      <td>
                        {t.linkedUserId ? (
                          <Link to={`/admin/user/${encodeURIComponent(t.linkedUserId)}`}>Open</Link>
                        ) : (
                          <span className="admin-crm-muted">—</span>
                        )}
                      </td>
                      <td>{contactsStatusBadge(t.status)}</td>
                      <td>{t.priority ?? 'normal'}</td>
                      <td className="admin-crm-nowrap">{t.lastMessageAt ? formatDt(t.lastMessageAt) : '—'}</td>
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
  const [noteBody, setNoteBody] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [noteErr, setNoteErr] = useState('');
  const [statusValue, setStatusValue] = useState('open');
  const [priorityValue, setPriorityValue] = useState('normal');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusErr, setStatusErr] = useState('');
  const [linkUserId, setLinkUserId] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkErr, setLinkErr] = useState('');
  const [inboundSubject, setInboundSubject] = useState('Re: ');
  const [inboundBody, setInboundBody] = useState('');
  const [inboundSaving, setInboundSaving] = useState(false);
  const [inboundErr, setInboundErr] = useState('');

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
          setInboundSubject(`Re: ${d.ticket.subject}`);
          setStatusValue(d.ticket.status || 'open');
          setPriorityValue(d.ticket.priority || 'normal');
          setLinkUserId(d.ticket.linkedUserId ?? '');
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

  async function addNote() {
    if (!ticketId || !noteBody.trim()) return;
    setNoteSending(true);
    setNoteErr('');
    try {
      await adminApi.crmSupportNote(ticketId, noteBody.trim());
      const refreshed = await adminApi.crmSupportTicket(ticketId);
      setData(refreshed);
      setNoteBody('');
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : 'Failed to add note');
    } finally {
      setNoteSending(false);
    }
  }

  async function updateTicket() {
    if (!ticketId) return;
    setStatusSaving(true);
    setStatusErr('');
    try {
      await adminApi.crmPatchSupportTicket(ticketId, {
        status: statusValue,
        priority: priorityValue
      });
      const refreshed = await adminApi.crmSupportTicket(ticketId);
      setData(refreshed);
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : 'Failed to update ticket');
    } finally {
      setStatusSaving(false);
    }
  }

  async function linkUser() {
    if (!ticketId) return;
    setLinkSaving(true);
    setLinkErr('');
    try {
      await adminApi.crmSupportLinkUser(ticketId, linkUserId.trim() ? linkUserId.trim() : null);
      const refreshed = await adminApi.crmSupportTicket(ticketId);
      setData(refreshed);
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : 'Failed to link user');
    } finally {
      setLinkSaving(false);
    }
  };

  const logInbound = async () => {
    if (!ticketId || !inboundBody.trim()) return;
    setInboundSaving(true);
    setInboundErr('');
    try {
      await adminApi.crmSupportInbound(ticketId, inboundSubject, inboundBody);
      const refreshed = await adminApi.crmSupportTicket(ticketId);
      setData(refreshed);
      setInboundBody('');
    } catch (e) {
      setInboundErr(e instanceof Error ? e.message : 'Failed to record reply');
    } finally {
      setInboundSaving(false);
    }
  };

  return (
    <AdminShell title="Support thread">
      <button type="button" className="admin-crm-btn" style={{ marginBottom: 16 }} onClick={() => navigate('/admin/contacts')}>
        ← Inbox
      </button>
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {error && <p className="admin-crm-error">{error}</p>}
      {data && (
        <>
          <div className="admin-crm-panel">
            <h2>{data.ticket.subject}</h2>
            <div className="admin-crm-muted" style={{ marginBottom: 12 }}>
              Ticket <span className="admin-crm-mono">{data.ticket.ticketId}</span>
            </div>
            <div className="admin-crm-two-col">
              <div>
                <p><strong>Contact</strong>: {data.name ?? '—'} · {data.ticket.email}</p>
                {data.ticket.accountEmail && <p><strong>Account email</strong>: {data.ticket.accountEmail}</p>}
                {data.ticket.orderReference && <p><strong>Order reference</strong>: {data.ticket.orderReference}</p>}
                {data.ticket.channelUrl && (
                  <p>
                    <strong>Channel</strong>: <a href={data.ticket.channelUrl} target="_blank" rel="noreferrer">{data.ticket.channelUrl}</a>
                  </p>
                )}
                <p><strong>Source</strong>: {data.ticket.source ?? 'contact_form'}</p>
                <p className="admin-crm-muted">
                  Outbound From: contact@youtubeboosterai.com. Recipient replies go to the Admin CRM inbox
                  (SSM admin/email). Continue the conversation with Send reply below so the thread stays in CRM.
                </p>
              </div>
              <div>
                <p><strong>Status</strong>: {contactsStatusBadge(data.ticket.status)}</p>
                <p><strong>Priority</strong>: {data.ticket.priority ?? 'normal'}</p>
                <p><strong>Last message</strong>: {data.ticket.lastMessageAt ? formatDt(data.ticket.lastMessageAt) : '—'}</p>
                <p><strong>Created</strong>: {formatDt(data.ticket.createdAt)}</p>
                {data.ticket.assignedAdmin && <p><strong>Assigned</strong>: {data.ticket.assignedAdmin}</p>}
              </div>
            </div>
            {statusErr && <p className="admin-crm-error">{statusErr}</p>}
            <div className="admin-crm-toolbar" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <select className="admin-crm-select" value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select className="admin-crm-select" value={priorityValue} onChange={(e) => setPriorityValue(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <button type="button" className="admin-crm-btn admin-crm-btn-primary" disabled={statusSaving} onClick={updateTicket}>
                {statusSaving ? 'Saving…' : 'Update'}
              </button>
            </div>
            {linkErr && <p className="admin-crm-error" style={{ marginTop: 12 }}>{linkErr}</p>}
            <div className="admin-crm-toolbar" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input
                className="admin-crm-input"
                placeholder="Link user id (leave empty to unlink)"
                value={linkUserId}
                onChange={(e) => setLinkUserId(e.target.value)}
                style={{ minWidth: 280 }}
              />
              <button type="button" className="admin-crm-btn" disabled={linkSaving} onClick={linkUser}>
                {linkSaving ? 'Linking…' : linkUserId.trim() ? 'Link user' : 'Unlink'}
              </button>
              {data.ticket.linkedUserId && (
                <Link to={`/admin/user/${encodeURIComponent(data.ticket.linkedUserId)}`} style={{ alignSelf: 'center' }}>
                  Open linked user
                </Link>
              )}
            </div>
          </div>
          <div className="admin-crm-panel">
            <h2>Conversation</h2>
            <div className="admin-crm-thread" style={{ marginTop: 16 }}>
              {data.ticket.source !== 'founder_outreach' && (
              <div className="admin-crm-msg admin-crm-msg-in">
                <div className="admin-crm-msg-meta">Original · {formatDt(data.ticket.createdAt)}</div>
                <div className="admin-crm-msg-body">{data.message}</div>
              </div>
              )}
              {data.thread.map((m) => (
                <div
                  key={m.messageId}
                  className={`admin-crm-msg ${m.direction.toLowerCase() === 'outbound' ? 'admin-crm-msg-out' : 'admin-crm-msg-in'}`}
                >
                  <div className="admin-crm-msg-meta">
                    {m.direction} · {formatDt(m.sentAt)}
                    {m.createdByType ? ` · ${m.createdByType}` : ''}
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
            <p className="admin-crm-muted" style={{ marginTop: 8 }}>
              Sends UTF-8 HTML + text from contact@youtubeboosterai.com, BCC + Reply-To the Admin inbox. Stored on this thread.
            </p>
          </div>
          <div className="admin-crm-panel">
            <h2>Log recipient reply</h2>
            <p className="admin-crm-muted">
              When the creator replies, it arrives at the Admin CRM inbox. Paste it here so the thread stays complete, then
              answer with Send reply (not from Gmail).
            </p>
            {inboundErr && <p className="admin-crm-error">{inboundErr}</p>}
            <input className="admin-crm-input" value={inboundSubject} onChange={(e) => setInboundSubject(e.target.value)} placeholder="Subject" />
            <textarea className="admin-crm-textarea" value={inboundBody} onChange={(e) => setInboundBody(e.target.value)} placeholder="Paste the recipient’s email" />
            <button type="button" className="admin-crm-btn" disabled={inboundSaving || !inboundBody.trim()} onClick={logInbound}>
              {inboundSaving ? 'Saving…' : 'Record reply and notify Admin inbox'}
            </button>
          </div>
          <div className="admin-crm-panel">
            <h2>Internal note</h2>
            {noteErr && <p className="admin-crm-error">{noteErr}</p>}
            <textarea className="admin-crm-textarea" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add an internal note" />
            <button type="button" className="admin-crm-btn" disabled={noteSending || !noteBody.trim()} onClick={addNote}>
              {noteSending ? 'Saving…' : 'Add note'}
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

export function DiagnosticsPage() {
  const [data, setData] = useState<AdminDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backfillMsg, setBackfillMsg] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const [range, setRange] = useState('30d');

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmDiagnostics(range)
      .then((res) => {
        if (!c) setData(res);
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load diagnostics');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, [range]);

  return (
    <AdminShell title="Diagnostics">
      {error && <p className="admin-crm-error">{error}</p>}
      <div className="admin-crm-toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
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
        <button
          type="button"
          className="admin-crm-btn admin-crm-btn-primary"
          disabled={backfilling}
          onClick={async () => {
            setBackfilling(true);
            setBackfillMsg('');
            try {
              const res = await adminApi.crmBackfillPaymentLivemode();
              setBackfillMsg(
                `Backfill: scanned ${res.scanned}, updated ${res.updated}, assumed test ${res.assumedTest}, confirmed live ${res.confirmedLive}, confirmed test ${res.confirmedTest}.`
              );
              const fresh = await adminApi.crmDiagnostics(range);
              setData(fresh);
            } catch (e) {
              setBackfillMsg(e instanceof Error ? e.message : 'Backfill failed');
            } finally {
              setBackfilling(false);
            }
          }}
        >
          {backfilling ? 'Backfilling…' : 'Backfill payment livemode'}
        </button>
      </div>
      {backfillMsg && <p className="admin-crm-muted" style={{ marginBottom: 12 }}>{backfillMsg}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : !data || (data.rows.length === 0 && data.eventDiagnostics.length === 0) ? (
        <div className="admin-crm-panel admin-crm-empty">No diagnostics available.</div>
      ) : (
        <>
          {data.rows.length > 0 && (
            <div className="admin-crm-table-wrap" style={{ marginBottom: 24 }}>
              <h2 style={{ marginTop: 0 }}>Metric sources</h2>
              <table className="admin-crm-table admin-crm-table-sticky">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Data source</th>
                    <th>Filters</th>
                    <th>Last updated</th>
                    <th>Warning</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.metric}>
                      <td>{r.metric}</td>
                      <td>{r.value}</td>
                      <td style={{ maxWidth: 200 }}>{r.dataSource}</td>
                      <td style={{ maxWidth: 180 }}>{r.filters}</td>
                      <td className="admin-crm-nowrap">{formatDt(r.lastUpdated)}</td>
                      <td>{r.warning ? <Badge kind="warn">{r.warning}</Badge> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.eventDiagnostics.length > 0 && (
            <div className="admin-crm-table-wrap">
              <h2 style={{ marginTop: 0 }}>Funnel event diagnostics</h2>
              <table className="admin-crm-table admin-crm-table-sticky">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Raw</th>
                    <th>Unique</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th>Missing identity</th>
                    <th>% no userId</th>
                    <th>% no anonId</th>
                  </tr>
                </thead>
                <tbody>
                  {data.eventDiagnostics.map((r: AdminFunnelEventDiagnostic) => (
                    <tr key={r.eventName}>
                      <td>{r.eventName}</td>
                      <td>{r.rawCount}</td>
                      <td>{r.uniqueActorCount}</td>
                      <td className="admin-crm-nowrap">{formatDt(r.firstSeen)}</td>
                      <td className="admin-crm-nowrap">{formatDt(r.lastSeen)}</td>
                      <td>{r.missingIdentityCount}</td>
                      <td>{r.percentMissingUserId.toFixed(1)}%</td>
                      <td>{r.percentMissingAnonymousId.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
