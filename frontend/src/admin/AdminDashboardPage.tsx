import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqSummary, AdminFunnelStep, AdminOperationalDashboard } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';

function formatMoney(amount: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatUpdated(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stepByKey(steps: AdminFunnelStep[], key: string) {
  return steps.find((s) => s.eventKey === key);
}

function hasIdentityGap(step: AdminFunnelStep | undefined) {
  return Boolean(step?.warning);
}

type AttentionCard = {
  id: string;
  title: string;
  detail: string;
  explain?: string;
  cta: { label: string; to: string };
  severity: 'warn' | 'bad' | 'info';
};

export function AdminDashboardPage() {
  useAdminCrm();
  const [range, setRange] = useState('30d');
  const [dash, setDash] = useState<AdminOperationalDashboard | null>(null);
  const [acq, setAcq] = useState<AcqSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [showRawFunnel, setShowRawFunnel] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [d, a] = await Promise.all([adminApi.crmDashboard(range), adminApi.acqSummary()]);
      setDash(d);
      setAcq(a);
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelSteps = dash?.funnel?.steps ?? [];
  const landing = stepByKey(funnelSteps, 'landing_page_view');
  const auditUrl = stepByKey(funnelSteps, 'audit_url_entered');
  const demoStarted = stepByKey(funnelSteps, 'demo_started');
  const demoCompleted = stepByKey(funnelSteps, 'demo_completed');
  const login = stepByKey(funnelSteps, 'login_completed');
  const checkout = stepByKey(funnelSteps, 'checkout_started');
  const paid = stepByKey(funnelSteps, 'payment_succeeded_live');

  const visualFunnel = useMemo(
    () =>
      [
        { key: 'landing', label: 'Landing', step: landing },
        { key: 'audit_url', label: 'Audit URL entered', step: auditUrl },
        { key: 'demo_started', label: 'Demo started', step: demoStarted },
        { key: 'demo_completed', label: 'Demo completed', step: demoCompleted },
        { key: 'login', label: 'Login', step: login },
        { key: 'checkout', label: 'Checkout', step: checkout },
        { key: 'paid', label: 'Paid', step: paid }
      ].filter((x) => x.step),
    [landing, auditUrl, demoStarted, demoCompleted, login, checkout, paid]
  );

  const conversionPct =
    dash && dash.kpis.totalDemos > 0
      ? (dash.kpis.paidLiveOrders / dash.kpis.totalDemos) * 100
      : dash?.kpis.demoToPaidConversionPct ?? 0;

  const reconciliationIssue =
    dash != null &&
    dash.kpis.paidLiveOrders !== (dash.kpis.activeLiveEntitledUsers ?? 0) &&
    !(dash.kpis.paidLiveOrders === 0 && (dash.kpis.activeLiveEntitledUsers ?? 0) === 0);

  const attention = useMemo(() => {
    const items: AttentionCard[] = [];
    const demo = demoCompleted?.uniqueActorCount ?? 0;
    const logins = login?.uniqueActorCount ?? 0;
    if (demo >= 10 && logins <= Math.max(2, Math.floor(demo * 0.05))) {
      items.push({
        id: 'identity-gap',
        title: 'Conversion tracking issue',
        detail: `Demo completed → Login completed · ${demo} → ${logins}`,
        explain:
          'Possible identity/tracking gap. Anonymous demo users may not currently be stitched correctly to authenticated users.',
        cta: { label: 'View diagnostics', to: '/admin/diagnostics' },
        severity: 'warn'
      });
    }

    if (acq) {
      const evaluated = acq.prospectsEvaluated ?? acq.discovered;
      const attempted = acq.emailsAttemptedToday ?? acq.sentToday ?? 0;
      const blocked =
        acq.outreachBlocked ||
        (acq.marketingSendingEnabled && attempted === 0 && (acq.sendEligible ?? 0) === 0);
      if (blocked || (acq.marketingSendingEnabled && attempted === 0 && evaluated > 0)) {
        items.push({
          id: 'outreach-blocked',
          title: 'Creator outreach blocked',
          detail: `${evaluated} evaluated · ${attempted} emails attempted today`,
          explain: acq.primaryBlocker
            ? `Dominant reason: ${acq.primaryBlocker.code} — ${acq.primaryBlocker.count}`
            : undefined,
          cta: { label: 'Open Creator Acquisition', to: '/admin/acquisition' },
          severity: 'bad'
        });
      }
    }

    for (const a of dash?.attentionRequired ?? []) {
      if (items.some((x) => x.title === a.message)) continue;
      items.push({
        id: a.code + (a.relatedId || ''),
        title: a.code.replace(/_/g, ' '),
        detail: a.message,
        cta: { label: 'Open diagnostics', to: '/admin/diagnostics' },
        severity: 'warn'
      });
    }

    return items;
  }, [acq, dash, demoCompleted, login]);

  const checkoutStarts = checkout?.uniqueActorCount ?? checkout?.rawEventCount ?? 0;

  return (
    <AdminShell title="Dashboard" subtitle="Growth, conversion and revenue at a glance">
      <div className="ops-page-head">
        <div className="ops-range-bar">
          {(['today', '7d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`ops-chip ${range === r ? 'ops-chip-active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r === 'today' ? 'Today' : r === 'all' ? 'All time' : r.toUpperCase()}
            </button>
          ))}
          <span className="ops-meta">Updated {formatUpdated(updatedAt)}</span>
          <button type="button" className="ops-btn ops-btn-ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="admin-crm-error">{error}</p>}
      {loading && !dash && <p className="ops-muted">Loading operational metrics…</p>}

      {dash && (
        <>
          <section className="ops-kpi-row">
            <article className="ops-kpi-card">
              <span className="ops-kpi-label">Users</span>
              <strong className="ops-kpi-value">{dash.kpis.totalUsers}</strong>
              <span className="ops-kpi-sub">{dash.kpis.activeEntitledUsers} entitled</span>
            </article>
            <article className="ops-kpi-card">
              <span className="ops-kpi-label">Audits</span>
              <strong className="ops-kpi-value">{dash.kpis.totalDemos}</strong>
              <span className="ops-kpi-sub">
                {dash.kpis.rawDemoEvents ?? dash.kpis.totalDemos} demo events in range
              </span>
            </article>
            <article className="ops-kpi-card">
              <span className="ops-kpi-label">Customers</span>
              <strong className="ops-kpi-value">{dash.kpis.paidLiveOrders}</strong>
              <span className="ops-kpi-sub">
                {dash.kpis.paidLiveOrders} paid · {conversionPct.toFixed(1)}% demo→paid*
              </span>
            </article>
            <article className="ops-kpi-card ops-kpi-card-accent">
              <span className="ops-kpi-label">Revenue</span>
              <strong className="ops-kpi-value">{formatMoney(dash.kpis.revenueLiveUsd)}</strong>
              <span className="ops-kpi-sub">Live product revenue · selected period</span>
            </article>
          </section>

          <section className={`ops-attention ${attention.length ? 'ops-attention-warn' : 'ops-attention-ok'}`}>
            <header className="ops-section-head">
              <h2>Attention required</h2>
            </header>
            {attention.length === 0 ? (
              <p className="ops-healthy">All clear — no blocking issues detected for this range.</p>
            ) : (
              <div className="ops-attention-grid">
                {attention.map((a) => (
                  <div key={a.id} className={`ops-attention-card ops-sev-${a.severity}`}>
                    <div className="ops-attention-title">
                      <span className="ops-warn-icon" aria-hidden>
                        ⚠
                      </span>
                      {a.title}
                    </div>
                    <p className="ops-attention-detail">{a.detail}</p>
                    {a.explain && <p className="ops-muted">{a.explain}</p>}
                    <Link className="ops-btn ops-btn-primary" to={a.cta.to}>
                      {a.cta.label}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="ops-panel">
            <header className="ops-section-head">
              <div>
                <h2>Conversion funnel</h2>
                <p className="ops-muted">Unique actors where identity allows · range {dash.range}</p>
              </div>
              <button type="button" className="ops-btn ops-btn-ghost" onClick={() => setShowRawFunnel((v) => !v)}>
                {showRawFunnel ? 'Hide raw funnel data' : 'Show raw funnel data'}
              </button>
            </header>

            <div className="ops-funnel">
              {visualFunnel.map((node, idx) => {
                const gap = hasIdentityGap(node.step);
                const count = node.step?.uniqueActorCount ?? 0;
                return (
                  <React.Fragment key={node.key}>
                    {idx > 0 && <div className="ops-funnel-arrow">↓</div>}
                    <div className={`ops-funnel-step ${gap ? 'ops-funnel-gap' : ''}`}>
                      <span className="ops-funnel-label">
                        {node.label}
                        {gap && (
                          <span className="ops-gap-badge" title={node.step?.warning || 'Identity gap'}>
                            ⚠
                          </span>
                        )}
                      </span>
                      <strong className="ops-funnel-count">
                        {count}
                        {gap ? '*' : ''}
                      </strong>
                      {gap && (
                        <span className="ops-funnel-note">Identity gap — cannot reliably compare with previous stage</span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            {dash.funnel?.notes && <p className="ops-muted ops-funnel-notes">{dash.funnel.notes}</p>}

            {showRawFunnel && (
              <div className="admin-crm-table-wrap ops-raw-table">
                <table className="admin-crm-table admin-crm-table-sticky">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th>Unique</th>
                      <th>Raw</th>
                      <th>Conv.</th>
                      <th>Drop-off</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnelSteps.map((s) => (
                      <tr key={s.eventKey}>
                        <td>{s.label}</td>
                        <td>{s.uniqueActorCount ?? 0}</td>
                        <td>{s.rawEventCount ?? 0}</td>
                        <td>
                          {s.warning || s.conversionFromPreviousPct == null
                            ? 'N/A'
                            : `${s.conversionFromPreviousPct.toFixed(1)}%`}
                        </td>
                        <td>
                          {s.warning || s.dropOffFromPreviousPct == null
                            ? '—'
                            : `${s.dropOffFromPreviousPct.toFixed(1)}%`}
                        </td>
                        <td>{s.warning ? <Badge kind="warn">identity gap</Badge> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ops-two-col">
            <article className="ops-panel">
              <header className="ops-section-head">
                <h2>Creator Acquisition</h2>
              </header>
              {acq ? (
                <>
                  <div className="ops-stat-grid">
                    <div>
                      <span>Evaluated</span>
                      <strong>{acq.prospectsEvaluated ?? acq.discovered}</strong>
                    </div>
                    <div>
                      <span>Qualified</span>
                      <strong>{acq.views?.qualified ?? '—'}</strong>
                    </div>
                    <div>
                      <span>Approved</span>
                      <strong>{acq.approved}</strong>
                    </div>
                    <div>
                      <span>Sent today</span>
                      <strong>{acq.sentToday ?? acq.emailsAttemptedToday ?? 0}</strong>
                    </div>
                    <div>
                      <span>Sent lifetime</span>
                      <strong>{acq.sentLifetime ?? acq.sent}</strong>
                    </div>
                    <div>
                      <span>Converted</span>
                      <strong>{acq.converted ?? 0}</strong>
                    </div>
                  </div>
                  <div className="ops-status-line">
                    <span>Status</span>
                    <Badge kind={acq.outreachBlocked || (acq.sendEligible ?? 0) === 0 ? 'bad' : 'ok'}>
                      {acq.outreachBlocked || (acq.sendEligible ?? 0) === 0 ? 'BLOCKED' : 'READY'}
                    </Badge>
                  </div>
                  {acq.primaryBlocker && (
                    <p className="ops-muted">
                      Dominant reason: <strong>{acq.primaryBlocker.code}</strong> — {acq.primaryBlocker.count}
                    </p>
                  )}
                  <Link className="ops-btn ops-btn-primary" to="/admin/acquisition">
                    Manage outreach
                  </Link>
                </>
              ) : (
                <p className="ops-muted">Acquisition summary unavailable.</p>
              )}
            </article>

            <article className="ops-panel">
              <header className="ops-section-head">
                <h2>Revenue</h2>
              </header>
              <div className="ops-stat-grid">
                <div>
                  <span>Live customers</span>
                  <strong>{dash.kpis.paidLiveOrders}</strong>
                </div>
                <div>
                  <span>Live revenue</span>
                  <strong>{formatMoney(dash.kpis.revenueLiveUsd)}</strong>
                </div>
                <div>
                  <span>Checkout starts</span>
                  <strong>{checkoutStarts}</strong>
                </div>
                <div>
                  <span>Failed / unpaid</span>
                  <strong>{dash.kpis.failedOrUnpaidCheckouts}</strong>
                </div>
                <div>
                  <span>Entitled users</span>
                  <strong>{dash.kpis.activeLiveEntitledUsers ?? dash.kpis.activeEntitledUsers}</strong>
                </div>
              </div>
              {reconciliationIssue && (
                <p className="ops-recon-warn">
                  Reconciliation issue — live paid customers and live entitled users disagree.
                </p>
              )}
              <Link className="ops-btn ops-btn-primary" to="/admin/orders">
                View orders
              </Link>
            </article>
          </section>

          <p className="ops-footnote">
            * Demo→paid % uses unique demo actors vs live paid orders. Where identity stitching is incomplete, treat funnel
            stage-to-stage rates as directional only.
          </p>
        </>
      )}
    </AdminShell>
  );
}
