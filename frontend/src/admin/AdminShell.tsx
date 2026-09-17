import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { adminApi } from '../lib/api';
import { useAdminCrm } from './useAdminCrm';

const NAV: { to: string; end?: boolean; label: string; icon: string; acq?: boolean }[] = [
  { to: '', end: true, label: 'Dashboard', icon: '▣' },
  { to: 'users', label: 'Users', icon: '◎' },
  { to: 'orders', label: 'Orders', icon: '◈' },
  { to: 'audits', label: 'Audits', icon: '◉' },
  { to: 'marketing/creator-acquisition', label: 'Creator acquisition', icon: '✦', acq: true },
  { to: 'contacts', label: 'Support', icon: '✉' },
  { to: 'activity', label: 'Activity logs', icon: '▤' },
  { to: 'diagnostics', label: 'Diagnostics', icon: '⚙' }
];

export function AdminShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { adminSession, onSignOut } = useAdminCrm();
  const [acqAttention, setAcqAttention] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .acqSummary()
      .then((s) => {
        if (cancelled) return;
        const queue = s.views?.draft_ready ?? s.drafts ?? 0;
        const blocked = Boolean(s.outreachBlocked) || (s.marketingSendingEnabled && (s.sendEligible ?? 0) === 0);
        if (blocked || queue > 0) setAcqAttention(queue > 0 ? queue : s.primaryBlocker?.count ?? 1);
        else setAcqAttention(null);
      })
      .catch(() => {
        if (!cancelled) setAcqAttention(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-crm-root">
      <aside className="admin-crm-sidebar">
        <div className="admin-crm-brand">YouTubeBooster AI · Ops</div>
        <nav className="admin-crm-nav">
          {NAV.map(({ to, label, end, icon, acq }) => (
            <NavLink
              key={to || 'home'}
              to={to ? `/admin/${to}` : '/admin'}
              end={!!end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="admin-crm-nav-icon" aria-hidden>
                {icon}
              </span>
              <span className="admin-crm-nav-label">{label}</span>
              {acq && acqAttention != null && acqAttention > 0 && (
                <span className="admin-crm-nav-badge" title="Attention required">
                  ⚠ {acqAttention}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="admin-crm-main">
        <header className="admin-crm-topbar">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="admin-crm-subtitle">{subtitle}</p>}
          </div>
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
