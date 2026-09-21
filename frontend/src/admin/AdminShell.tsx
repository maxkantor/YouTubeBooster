import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { adminApi } from '../lib/api';
import { useAdminCrm } from './useAdminCrm';

type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: string;
  badge?: 'approvals' | 'inbox' | 'acq-parent';
};

const TOP_NAV: NavItem[] = [{ to: '', end: true, label: 'Dashboard', icon: '▣' }];

const ACQ_CHILDREN: NavItem[] = [
  { to: 'acquisition/creators', label: 'Creators', icon: '◎' },
  { to: 'acquisition/approvals', label: 'Approvals', icon: '☑', badge: 'approvals' },
  { to: 'acquisition/campaigns', label: 'Campaigns', icon: '◈' },
  { to: 'acquisition/inbox', label: 'Inbox', icon: '✉', badge: 'inbox' },
  { to: 'acquisition/analytics', label: 'Analytics', icon: '▤' }
];

const BOTTOM_NAV: NavItem[] = [
  { to: 'users', label: 'Users', icon: '◎' },
  { to: 'orders', label: 'Orders', icon: '◈' },
  { to: 'audits', label: 'Audits', icon: '◉' },
  { to: 'contacts', label: 'Support', icon: '✉' },
  { to: 'activity', label: 'Activity logs', icon: '▤' },
  { to: 'diagnostics', label: 'Diagnostics', icon: '⚙' }
];

function NavRow({
  item,
  badgeCount,
  nested
}: {
  item: NavItem;
  badgeCount?: number | null;
  nested?: boolean;
}) {
  return (
    <NavLink
      to={item.to ? `/admin/${item.to}` : '/admin'}
      end={!!item.end}
      className={({ isActive }) =>
        [isActive ? 'active' : '', nested ? 'admin-crm-nav-nested' : ''].filter(Boolean).join(' ')
      }
    >
      <span className="admin-crm-nav-icon" aria-hidden>
        {item.icon}
      </span>
      <span className="admin-crm-nav-label">{item.label}</span>
      {badgeCount != null && badgeCount > 0 && (
        <span className="admin-crm-nav-badge" title="Attention required">
          {badgeCount}
        </span>
      )}
    </NavLink>
  );
}

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
  const [needsApproval, setNeedsApproval] = useState<number | null>(null);
  const [inboxReplies, setInboxReplies] = useState<number | null>(null);
  const [acqSystemBadge, setAcqSystemBadge] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .acqSummary()
      .then((s) => {
        if (cancelled) return;
        const needs = s.needsApproval ?? 0;
        const replies = s.repliesNeedingAction ?? 0;
        setNeedsApproval(needs > 0 ? needs : null);
        setInboxReplies(replies > 0 ? replies : null);
        const systemProblem =
          Boolean(s.outreachBlocked) ||
          s.sesConfigured === false ||
          Boolean(s.complaintPause) ||
          s.fromEmailConfigured === false;
        setAcqSystemBadge(systemProblem ? 1 : null);
      })
      .catch(() => {
        if (!cancelled) {
          setNeedsApproval(null);
          setInboxReplies(null);
          setAcqSystemBadge(null);
        }
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
          {TOP_NAV.map((item) => (
            <NavRow key={item.to || 'home'} item={item} />
          ))}

          <div className="admin-crm-nav-section">
            <NavRow
              item={{ to: 'acquisition', end: true, label: 'Acquisition', icon: '✦', badge: 'acq-parent' }}
              badgeCount={acqSystemBadge}
            />
            <div className="admin-crm-nav-children">
              {ACQ_CHILDREN.map((item) => (
                <NavRow
                  key={item.to}
                  item={item}
                  nested
                  badgeCount={
                    item.badge === 'approvals' ? needsApproval : item.badge === 'inbox' ? inboxReplies : null
                  }
                />
              ))}
            </div>
          </div>

          {BOTTOM_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
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
