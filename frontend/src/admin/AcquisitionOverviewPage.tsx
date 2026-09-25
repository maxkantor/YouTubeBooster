import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { ACQ_OVERVIEW_DEFAULTS } from './acqUiShared';

export function AcquisitionOverviewPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSummary(await adminApi.acqSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load acquisition overview');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const d = ACQ_OVERVIEW_DEFAULTS;
  const status = summary?.acquisitionStatus;
  const readyNow =
    status?.readyNow ??
    summary?.inventory?.readyToSend ??
    summary?.pipeline?.readyToSend ??
    summary?.approvedReadyToSend ??
    0;
  const needsApproval = status?.needsApproval ?? summary?.needsApproval ?? 0;
  const approvedWaiting =
    summary?.approvedWaiting ?? summary?.currentlyApprovedWaitingToSend ?? d.currentlyApprovedWaitingToSend;
  const blockedCooldown = summary?.blockedCooldown ?? summary?.pipeline?.blockedByCooldown ?? d.blockedByCooldown;
  const blockedQual = summary?.pipeline?.blockedByQualification ?? d.blockedByQualification;
  const sentToday = status?.sentToday ?? summary?.sentToday ?? d.sentToday;
  const dailyLimit = status?.dailyLimit ?? summary?.dailyLimit ?? d.dailyLimit;
  const dailyRemaining = status?.remaining ?? summary?.dailyRemaining ?? summary?.pipeline?.dailyRemaining ?? d.dailyRemaining;
  const followUpsDue = status?.followUpsDue ?? summary?.followUpsDue ?? 0;
  const replies = summary?.repliesNeedingAction ?? 0;
  const discoveryEligible = status?.missingEmailEligible ?? summary?.inventory?.discoveryEligible ?? 0;
  const bottleneck = status?.bottleneck || 'Loading…';
  const automatic = status?.automaticSending ?? summary?.automaticSending === true;

  const northStar = [
    {
      label: 'Paid customers',
      value: summary?.northStar?.paidCustomers ?? summary?.converted ?? 0,
      to: '/admin/orders?status=paid'
    },
    {
      label: 'Revenue',
      value: summary?.northStar?.revenue != null ? `$${summary.northStar.revenue}` : '—',
      to: '/admin/orders'
    },
    {
      label: 'Audits started',
      value: summary?.northStar?.auditsStarted ?? summary?.auditStarted ?? 0,
      to: '/admin/audits'
    },
    {
      label: 'Accounts created',
      value: summary?.northStar?.accountsCreated ?? summary?.pricingViewed ?? 0,
      to: '/admin/users'
    }
  ];

  const funnel = [
    {
      label: 'COOK-001 discovered',
      value: summary?.scope?.cook001CookingAndFood ?? summary?.cohortFunnel?.discovered ?? summary?.inventory?.totalCreators ?? 0,
      to: '/admin/acquisition/creators'
    },
    {
      label: 'Contactable',
      value: status?.publicEmails ?? summary?.cohortFunnel?.contactable ?? summary?.contactVerified ?? 0,
      to: '/admin/acquisition/creators?status=EMAIL_REQUIRED'
    },
    { label: 'Needs Approval', value: needsApproval, to: '/admin/acquisition/approvals?tab=needs' },
    {
      label: 'Ready to send',
      value: readyNow,
      to: '/admin/acquisition/approvals?tab=ready'
    },
    {
      label: 'Sent',
      value: summary?.cohortFunnel?.emailsSent ?? summary?.sent ?? 0,
      to: '/admin/acquisition/approvals?tab=sent'
    },
    { label: 'Clicked', value: summary?.cohortFunnel?.clicked ?? summary?.clicked ?? 0, to: '/admin/acquisition/analytics' },
    {
      label: 'Audit',
      value: summary?.cohortFunnel?.auditStarts ?? summary?.auditStarted ?? 0,
      to: '/admin/audits'
    },
    {
      label: 'Paid',
      value: summary?.cohortFunnel?.paid ?? summary?.converted ?? 0,
      to: '/admin/orders?status=paid'
    }
  ];

  const healthCells = [
    { label: 'Daily limit', value: dailyLimit },
    { label: 'Sent today', value: sentToday },
    { label: 'Remaining', value: dailyRemaining },
    {
      label: 'SES remaining',
      value: status?.sesRemaining ?? summary?.sesRemaining ?? (summary?.sesQuotaAvailable ? '—' : 'Unavailable')
    },
    { label: 'Discovered', value: status?.discovered ?? summary?.inventory?.totalCreators ?? 0 },
    { label: 'Public emails', value: status?.publicEmails ?? summary?.inventory?.withPublicEmail ?? 0 },
    { label: 'Qualified unsent', value: status?.qualifiedUnsent ?? 0 },
    { label: 'Ready now', value: readyNow },
    { label: 'Missing email eligible', value: discoveryEligible },
    { label: 'Discovery backoff', value: status?.discoveryBackoff ?? summary?.inventory?.backoff ?? 0 },
    { label: 'Follow-ups due', value: followUpsDue },
    {
      label: 'Next scheduled run',
      value: status?.nextScheduledRunEt
        ? new Date(status.nextScheduledRunEt).toLocaleString()
        : summary?.nextScheduledSendEt
          ? new Date(summary.nextScheduledSendEt).toLocaleString()
          : '—'
    }
  ];

  return (
    <AdminShell title="Acquisition" subtitle="Automation health first. Manual send lives on Approvals.">
      {error && <p className="admin-crm-error">{error}</p>}

      <div className="ops-page-head acq-campaign-head">
        <div className="acq-status-pills">
          <span className="acq-pill">
            Campaign
            <strong className="acq-dot acq-dot-ok"> COOK-001</strong>
          </span>
          <span className="acq-pill">
            Automatic
            <strong className={automatic ? 'acq-ok' : 'acq-bad'}> {automatic ? 'ON' : 'OFF'}</strong>
          </span>
          <span className="acq-pill">
            Sent today
            <strong>
              {' '}
              {sentToday} / {dailyLimit}
            </strong>
          </span>
          <span className="acq-pill">
            Remaining
            <strong> {dailyRemaining}</strong>
          </span>
        </div>
      </div>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Inventory / Automation Health</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            One backend acquisitionStatus for COOK-001. All Admin screens use the same Ready now count.
          </p>
        </header>
        <div className="acq-health-grid">
          {healthCells.map((c) => (
            <div key={c.label}>
              <span>{c.label}</span>
              <strong>{c.value}</strong>
            </div>
          ))}
        </div>
        <p
          className={readyNow > 0 && dailyRemaining > 0 ? 'ops-muted' : 'admin-crm-error'}
          style={{ marginTop: 16, fontWeight: 600 }}
        >
          BOTTLENECK: {bottleneck}
        </p>
        <p className="ops-muted" style={{ marginTop: 8 }}>
          Manual send (if needed):{' '}
          <Link to="/admin/acquisition/approvals?tab=ready">Approvals → Ready to Send</Link>
          {needsApproval > 0 ? ` · ${needsApproval} need human review` : ''}
        </p>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>North star</h2>
        </header>
        <div className="acq-pipeline">
          {northStar.map((p) => (
            <Link key={p.label} className="acq-pipeline-card" to={p.to}>
              <span>{p.label}</span>
              <strong>{p.value}</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Conversion funnel (COOK-001)</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            All acquisition prospects: {summary?.scope?.allAcquisitionProspects ?? summary?.discovered ?? '—'} ·{' '}
            COOK-001 / Cooking &amp; Food: {summary?.scope?.cook001CookingAndFood ?? summary?.inventory?.totalCreators ?? '—'}
          </p>
        </header>
        <div className="acq-pipeline">
          {funnel.map((p, i) => (
            <React.Fragment key={p.label}>
              {i > 0 && <div className="acq-pipeline-connector" aria-hidden />}
              <Link className="acq-pipeline-card" to={p.to}>
                <span>{p.label}</span>
                <strong>{p.value}</strong>
              </Link>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Today&apos;s monitoring</h2>
        </header>
        <div className="acq-pipeline">
          <Link className="acq-pipeline-card" to="/admin/acquisition/approvals?tab=needs">
            <span>Needs approval</span>
            <strong>{needsApproval}</strong>
          </Link>
          <Link className="acq-pipeline-card" to="/admin/acquisition/approvals?tab=ready">
            <span>Ready to send</span>
            <strong>{readyNow}</strong>
          </Link>
          <Link className="acq-pipeline-card" to="/admin/acquisition/creators?status=COOLDOWN">
            <span>In cooldown</span>
            <strong>{blockedCooldown}</strong>
          </Link>
          <Link className="acq-pipeline-card" to="/admin/acquisition/creators?status=OTHER">
            <span>Blocked by qualification</span>
            <strong>{blockedQual}</strong>
          </Link>
          <Link className="acq-pipeline-card" to="/admin/acquisition/campaigns">
            <span>Follow-ups due</span>
            <strong>{followUpsDue}</strong>
          </Link>
          <Link className="acq-pipeline-card" to="/admin/acquisition/inbox">
            <span>Replies</span>
            <strong>{replies}</strong>
          </Link>
        </div>
        <p className="ops-muted" style={{ marginTop: 12 }}>
          Approved waiting (status): <strong>{approvedWaiting}</strong> · Ready now (authoritative):{' '}
          <strong>{readyNow}</strong>
        </p>
      </section>
    </AdminShell>
  );
}
