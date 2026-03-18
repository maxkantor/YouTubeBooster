import React, { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type {
  AdminDemoAuditRow,
  AdminPurchaseRow,
  AdminSummary,
  AdminSupportTicketRow,
  AdminUserRow,
  AdminSessionStatus
} from '../types';
import './admin-crm.css';

const NAV = [
  { to: '', end: true, label: 'Dashboard' },
  { to: 'users', label: 'Users' },
  { to: 'payments', label: 'Payments' },
  { to: 'subscriptions', label: 'Subscriptions' },
  { to: 'audits', label: 'Audits' },
  { to: 'demo-unlocks', label: 'Demo unlocks' },
  { to: 'contact', label: 'Contact' },
  { to: 'email', label: 'Email' },
  { to: 'analytics', label: 'Analytics' },
  { to: 'settings', label: 'Settings' },
  { to: 'system-logs', label: 'System logs' }
] as const;

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function AdminShell({
  title,
  adminSession,
  onSignOut,
  children
}: {
  title: string;
  adminSession: AdminSessionStatus;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-crm-root">
      <aside className="admin-crm-sidebar">
        <div className="admin-crm-brand">Admin CRM</div>
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

function PlaceholderPage({
  title,
  body,
  adminSession,
  onSignOut
}: {
  title: string;
  body: string;
  adminSession: AdminSessionStatus;
  onSignOut: () => void;
}) {
  return (
    <AdminShell title={title} adminSession={adminSession} onSignOut={onSignOut}>
      <div className="admin-crm-panel">
        <h2>{title}</h2>
        <p style={{ color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{body}</p>
      </div>
    </AdminShell>
  );
}

function AdminHomePage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let c = false;
    adminApi
      .loadSummary()
      .then((d) => {
        if (!c) setSummary(d);
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load summary');
      });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="Dashboard" adminSession={adminSession} onSignOut={onSignOut}>
      {error && <p className="admin-crm-error">{error}</p>}
      {summary && (
        <>
          <div className="admin-crm-metric-grid">
            <div className="admin-crm-metric">
              <span>Users</span>
              <strong>{summary.totalUsers}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Demos</span>
              <strong>{summary.totalDemos}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Purchases</span>
              <strong>{summary.totalPurchases}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Conversion</span>
              <strong>{summary.conversionRate}</strong>
            </div>
            <div className="admin-crm-metric">
              <span>Revenue</span>
              <strong>{summary.grossRevenue}</strong>
            </div>
          </div>
          <div className="admin-crm-panel">
            <h2>Recent activity</h2>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#94a3b8' }}>
              {summary.recentActivity.map((item) => (
                <li key={`${item.title}-${item.timestamp}`} style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#cbd5e1' }}>{item.title}</strong>: {item.detail}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="admin-crm-panel">
        <h2>Quick links</h2>
        <p style={{ color: '#94a3b8', margin: '0 0 12px' }}>
          Live CRM data is wired for Users, Payments, Demo audits, and Support (SES replies).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <NavLink
            to="/admin/users"
            className="admin-crm-btn admin-crm-btn-primary"
            style={{ textDecoration: 'none', display: 'inline-block' }}
          >
            Browse users
          </NavLink>
          <NavLink to="/admin/payments" className="admin-crm-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Payments
          </NavLink>
          <NavLink to="/admin/contact" className="admin-crm-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Support inbox
          </NavLink>
        </div>
      </div>
    </AdminShell>
  );
}

function UsersPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <AdminShell title="Users" adminSession={adminSession} onSignOut={onSignOut}>
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading users…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No users yet.</div>
      ) : (
        <>
          <div className="admin-crm-table-wrap">
            <table className="admin-crm-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Channel</th>
                  <th>Purchased</th>
                  <th>Onboarding</th>
                  <th>Access</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.userId}>
                    <td>
                      <Link to={`/admin/user/${encodeURIComponent(u.userId)}`}>{u.email}</Link>
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.channelUrl ?? '—'}</td>
                    <td>
                      <span className={`admin-crm-badge ${u.purchased ? 'admin-crm-badge-ok' : 'admin-crm-badge-warn'}`}>
                        {u.purchased ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{u.onboardingCompleted ? 'Done' : 'Pending'}</td>
                    <td>{u.accessStatus}</td>
                    <td>{formatDt(u.updatedAt)}</td>
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

function UserDetailPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.crmUser>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let c = false;
    setLoading(true);
    adminApi
      .crmUser(id)
      .then((d) => {
        if (!c) setData(d);
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
  }, [id]);

  return (
    <AdminShell title="User detail" adminSession={adminSession} onSignOut={onSignOut}>
      <button type="button" className="admin-crm-btn" style={{ marginBottom: 16 }} onClick={() => navigate('/admin/users')}>
        ← Users
      </button>
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {error && <p className="admin-crm-error">{error}</p>}
      {data && (
        <>
          <div className="admin-crm-panel">
            <h2>{data.user.email}</h2>
            <p style={{ color: '#94a3b8' }}>
              ID: {data.user.userId} · Access: {data.user.accessStatus} · Created {formatDt(data.user.createdAt)}
            </p>
            <p style={{ color: '#94a3b8' }}>
              Channel: {data.user.channelUrl ?? '—'} · Purchased: {data.user.purchased ? 'Yes' : 'No'} · Onboarding:{' '}
              {data.user.onboardingCompleted ? 'complete' : 'incomplete'}
            </p>
          </div>
          {data.onboarding && (
            <div className="admin-crm-panel">
              <h2>Onboarding</h2>
              <p style={{ color: '#94a3b8' }}>Goal: {data.onboarding.growthGoal ?? '—'}</p>
            </div>
          )}
          <div className="admin-crm-panel">
            <h2>Purchases ({data.purchases.length})</h2>
            {data.purchases.length === 0 ? (
              <p style={{ color: '#64748b' }}>None</p>
            ) : (
              <div className="admin-crm-table-wrap">
                <table className="admin-crm-table">
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
          </div>
          <div className="admin-crm-panel">
            <h2>Recent events</h2>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#94a3b8' }}>
              {data.recentEvents.map((ev, i) => (
                <li key={i} style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#cbd5e1' }}>{ev.title}</strong>: {ev.detail}{' '}
                  <span style={{ fontSize: 12 }}>({formatDt(ev.timestamp)})</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function PaymentsPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const [items, setItems] = useState<AdminPurchaseRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = async (cursor: string | null, append: boolean) => {
    try {
      const res = await adminApi.crmPayments(50, cursor);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      setNext(res.nextCursor);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    }
  };

  useEffect(() => {
    let c = false;
    setLoading(true);
    adminApi
      .crmPayments(50, null)
      .then((res) => {
        if (!c) {
          setItems(res.items);
          setNext(res.nextCursor);
        }
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed to load payments');
      })
      .finally(() => {
        if (!c) setLoading(false);
      });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="Payments" adminSession={adminSession} onSignOut={onSignOut}>
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No payment records.</div>
      ) : (
        <>
          <div className="admin-crm-table-wrap">
            <table className="admin-crm-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>User</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.purchaseId}>
                    <td>{p.email}</td>
                    <td>
                      {p.amount} {p.currency}
                    </td>
                    <td>{p.status}</td>
                    <td>
                      <Link to={`/admin/user/${encodeURIComponent(p.userId)}`}>{p.userId.slice(0, 8)}…</Link>
                    </td>
                    <td>{formatDt(p.purchasedAt)}</td>
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

function AuditsPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const [items, setItems] = useState<AdminDemoAuditRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

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
    <AdminShell title="Demo audits" adminSession={adminSession} onSignOut={onSignOut}>
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No demo runs recorded.</div>
      ) : (
        <>
          <div className="admin-crm-table-wrap">
            <table className="admin-crm-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Handle</th>
                  <th>Score</th>
                  <th>Email</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.demoId}>
                    <td>{r.channelTitle}</td>
                    <td>{r.channelHandle}</td>
                    <td>{r.healthScore}</td>
                    <td>{r.email ?? '—'}</td>
                    <td>{formatDt(r.createdAt)}</td>
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

function ContactListPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const [items, setItems] = useState<AdminSupportTicketRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

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
    <AdminShell title="Support inbox" adminSession={adminSession} onSignOut={onSignOut}>
      {error && <p className="admin-crm-error">{error}</p>}
      {loading ? (
        <p style={{ color: '#64748b' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="admin-crm-panel admin-crm-empty">No support tickets.</div>
      ) : (
        <>
          <div className="admin-crm-table-wrap">
            <table className="admin-crm-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Area</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.ticketId}>
                    <td>
                      <Link to={`/admin/contact/${encodeURIComponent(t.ticketId)}`}>{t.subject}</Link>
                    </td>
                    <td>{t.email}</td>
                    <td>{t.status}</td>
                    <td>{t.productArea}</td>
                    <td>{formatDt(t.updatedAt)}</td>
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

function ContactTicketPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
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
    <AdminShell title="Ticket" adminSession={adminSession} onSignOut={onSignOut}>
      <button type="button" className="admin-crm-btn" style={{ marginBottom: 16 }} onClick={() => navigate('/admin/contact')}>
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

function SystemLogsPage({
  adminSession,
  onSignOut
}: {
  adminSession: AdminSessionStatus;
  onSignOut: () => void;
}) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let c = false;
    adminApi
      .loadSummary()
      .then((d) => {
        if (!c) setSummary(d);
      })
      .catch((e) => {
        if (!c) setError(e instanceof Error ? e.message : 'Failed');
      });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="System logs" adminSession={adminSession} onSignOut={onSignOut}>
      {error && <p className="admin-crm-error">{error}</p>}
      <p style={{ color: '#94a3b8', marginBottom: 16 }}>
        Recent activity from the admin summary feed. Dedicated audit log API can be added later.
      </p>
      {summary && (
        <ul style={{ margin: 0, paddingLeft: 20, color: '#94a3b8' }}>
          {summary.recentActivity.map((item) => (
            <li key={`${item.title}-${item.timestamp}`} style={{ marginBottom: 10 }}>
              <strong style={{ color: '#cbd5e1' }}>{formatDt(item.timestamp)}</strong> — {item.title}: {item.detail}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function AnalyticsPage({ adminSession, onSignOut }: { adminSession: AdminSessionStatus; onSignOut: () => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  useEffect(() => {
    let c = false;
    adminApi.loadSummary().then((d) => {
      if (!c) setSummary(d);
    });
    return () => {
      c = true;
    };
  }, []);

  return (
    <AdminShell title="Analytics" adminSession={adminSession} onSignOut={onSignOut}>
      <p style={{ color: '#94a3b8', marginBottom: 20 }}>High-level funnel metrics from the same source as the dashboard.</p>
      {summary && (
        <div className="admin-crm-metric-grid">
          <div className="admin-crm-metric">
            <span>Demos</span>
            <strong>{summary.totalDemos}</strong>
          </div>
          <div className="admin-crm-metric">
            <span>Users</span>
            <strong>{summary.totalUsers}</strong>
          </div>
          <div className="admin-crm-metric">
            <span>Purchases</span>
            <strong>{summary.totalPurchases}</strong>
          </div>
          <div className="admin-crm-metric">
            <span>Conversion</span>
            <strong>{summary.conversionRate}</strong>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export default function AdminCrmApp({
  adminSession,
  refreshAdminSession
}: {
  adminSession: AdminSessionStatus;
  refreshAdminSession: () => Promise<AdminSessionStatus>;
}) {
  const navigate = useNavigate();

  async function onSignOut() {
    await adminApi.logout();
    await refreshAdminSession();
    navigate('/admin/login', { replace: true });
  }

  return (
    <Routes basename="/admin">
      <Route index element={<AdminHomePage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route path="users" element={<UsersPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route path="user/:id" element={<UserDetailPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route path="payments" element={<PaymentsPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route
        path="subscriptions"
        element={
          <PlaceholderPage
            title="Subscriptions"
            body="One-time Stripe purchases appear under Payments. Recurring subscription listing can be wired when billing supports it."
            adminSession={adminSession}
            onSignOut={onSignOut}
          />
        }
      />
      <Route path="audits" element={<AuditsPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route
        path="demo-unlocks"
        element={
          <PlaceholderPage
            title="Demo unlocks"
            body="Demo runs and gated unlocks are listed under Audits. Grant/revoke APIs can be exposed here next."
            adminSession={adminSession}
            onSignOut={onSignOut}
          />
        }
      />
      <Route path="contact" element={<ContactListPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route path="contact/:ticketId" element={<ContactTicketPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route
        path="email"
        element={
          <PlaceholderPage
            title="Email (SES)"
            body="Outbound support replies are sent from the ticket thread via Amazon SES. Configure ses/from-email and admin credentials in SSM."
            adminSession={adminSession}
            onSignOut={onSignOut}
          />
        }
      />
      <Route path="analytics" element={<AnalyticsPage adminSession={adminSession} onSignOut={onSignOut} />} />
      <Route
        path="settings"
        element={
          <PlaceholderPage
            title="Settings"
            body="SSM-backed secrets are not shown here. Use AWS Console / Terraform for admin/email, password format, and SES from-address."
            adminSession={adminSession}
            onSignOut={onSignOut}
          />
        }
      />
      <Route path="system-logs" element={<SystemLogsPage adminSession={adminSession} onSignOut={onSignOut} />} />
    </Routes>
  );
}
