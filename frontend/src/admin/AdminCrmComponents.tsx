import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AdminDemoAuditRow, AdminOrderRow, AdminSupportTicketRow, AdminUserRow } from '../types';

/** Semantic status badges (dark premium) */
/** @deprecated Prefer CrmBadge — kept for existing `kind` prop usage in AdminCrmApp */
export function Badge({
  kind,
  children
}: {
  kind: 'ok' | 'warn' | 'bad' | 'neutral' | 'info';
  children: React.ReactNode;
}) {
  return <CrmBadge variant={kind}>{children}</CrmBadge>;
}

export function CrmBadge({
  variant,
  children
}: {
  variant: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' | 'muted';
  children: React.ReactNode;
}) {
  const cls =
    variant === 'ok'
      ? 'admin-crm-badge-ok'
      : variant === 'warn'
        ? 'admin-crm-badge-warn'
        : variant === 'bad'
          ? 'admin-crm-badge-bad'
          : variant === 'info'
            ? 'admin-crm-badge-info'
            : variant === 'muted'
              ? 'admin-crm-badge-muted'
              : 'admin-crm-badge-neutral';
  return <span className={`admin-crm-badge ${cls}`}>{children}</span>;
}

export function userStatusBadge(status: string) {
  const s = (status || 'active').toLowerCase();
  if (s === 'active') return <CrmBadge variant="ok">active</CrmBadge>;
  if (s === 'suspended') return <CrmBadge variant="warn">suspended</CrmBadge>;
  if (s === 'deactivated') return <CrmBadge variant="bad">deactivated</CrmBadge>;
  return <CrmBadge variant="neutral">{status}</CrmBadge>;
}

type UserAction = 'open' | 'suspend' | 'activate' | 'deactivate';

export function UserRowActions({ user, onChanged }: { user: AdminUserRow; onChanged: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function run(action: UserAction) {
    if (action === 'open') {
      navigate(`/admin/user/${encodeURIComponent(user.userId)}`);
      return;
    }
    if (action === 'deactivate') {
      if (!window.confirm(`Deactivate ${user.email}? They lose access until re-activated.`)) return;
    } else if (action === 'suspend') {
      if (!window.confirm(`Suspend ${user.email}?`)) return;
    }

    setBusy(true);
    try {
      const map: Record<UserAction, string | undefined> = {
        open: undefined,
        suspend: 'suspended',
        activate: 'active',
        deactivate: 'deactivated'
      };
      const st = map[action];
      if (st) await adminApi.crmPatchUser(user.userId, { userStatus: st });
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-crm-row-actions">
      <select
        className="admin-crm-select admin-crm-select-compact"
        disabled={busy}
        defaultValue=""
        aria-label={`Actions for ${user.email}`}
        onChange={(e) => {
          const v = e.target.value as UserAction | '';
          e.target.value = '';
          if (v) void run(v);
        }}
      >
        <option value="">Actions…</option>
        <option value="open">View</option>
        <option value="activate">Activate</option>
        <option value="suspend">Suspend</option>
        <option value="deactivate">Deactivate</option>
      </select>
    </div>
  );
}

export function OrderFilterBar({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = [
    { id: 'all', label: 'All' },
    { id: 'live_paid', label: 'Live paid' },
    { id: 'test', label: 'Test' },
    { id: 'unmatched', label: 'Unmatched' },
    { id: 'non_revenue', label: 'Non-revenue' }
  ];
  return (
    <div className="admin-crm-filter-bar" role="tablist">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`admin-crm-filter-chip ${value === o.id ? 'admin-crm-filter-chip-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function filterOrders(rows: AdminOrderRow[], mode: string): AdminOrderRow[] {
  if (mode === 'all') return rows;
  return rows.filter((o) => {
    const c = (o.classification || '').toLowerCase();
    if (mode === 'live_paid') return c.includes('live_paid') || (o.mode === 'live' && o.amount > 0 && o.status === 'completed');
    if (mode === 'test') return o.mode === 'test';
    if (mode === 'unmatched') return !o.userId || c.includes('unmatched');
    if (mode === 'non_revenue')
      return o.amount <= 0 || c.includes('zero') || c.includes('free') || c.includes('test');
    return true;
  });
}

export function AuditFilterBar({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = [
    { id: 'all', label: 'All' },
    { id: 'demo', label: 'Demo' },
    { id: 'failed', label: 'Failed' },
    { id: 'linked', label: 'Linked user' }
  ];
  return (
    <div className="admin-crm-filter-bar" role="tablist">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`admin-crm-filter-chip ${value === o.id ? 'admin-crm-filter-chip-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function filterAudits(rows: AdminDemoAuditRow[], mode: string): AdminDemoAuditRow[] {
  if (mode === 'all') return rows;
  return rows.filter((r) => {
    if (mode === 'demo') return (r.auditType || 'demo').toLowerCase() === 'demo';
    if (mode === 'failed') return (r.status || '').toLowerCase() === 'failed';
    if (mode === 'linked') return !!r.linkedUserId;
    return true;
  });
}

export function SupportFilterBar({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'pending', label: 'Pending' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'closed', label: 'Closed' }
  ];
  return (
    <div className="admin-crm-filter-bar" role="tablist">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`admin-crm-filter-chip ${value === o.id ? 'admin-crm-filter-chip-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function filterSupport(rows: AdminSupportTicketRow[], mode: string): AdminSupportTicketRow[] {
  if (mode === 'all') return rows;
  return rows.filter((t) => (t.status || '').toLowerCase() === mode);
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin-crm-section">
      <h2 className="admin-crm-section-title">{title}</h2>
      <div className="admin-crm-section-body">{children}</div>
    </section>
  );
}
