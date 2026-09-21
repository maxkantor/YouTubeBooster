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
  const needsApproval = summary?.needsApproval ?? 0;
  const approvedWaiting =
    summary?.approvedWaiting ?? summary?.currentlyApprovedWaitingToSend ?? d.currentlyApprovedWaitingToSend;
  const approvedEligible =
    summary?.approvedReadyToSend ?? summary?.pipeline?.approvedEligibleNow ?? d.approvedEligibleNow;
  const blockedCooldown = summary?.blockedCooldown ?? summary?.pipeline?.blockedByCooldown ?? d.blockedByCooldown;
  const blockedQual = summary?.pipeline?.blockedByQualification ?? d.blockedByQualification;
  const sentToday = summary?.sentToday ?? d.sentToday;
  const dailyLimit = summary?.dailyLimit ?? d.dailyLimit;
  const dailyRemaining = summary?.dailyRemaining ?? summary?.pipeline?.dailyRemaining ?? d.dailyRemaining;
  const followUpsDue = summary?.followUpsDue ?? 0;
  const replies = summary?.repliesNeedingAction ?? 0;

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
    { label: 'Discovered', value: summary?.cohortFunnel?.discovered ?? summary?.discovered ?? 0, to: '/admin/acquisition/creators' },
    {
      label: 'Contactable',
      value: summary?.cohortFunnel?.contactable ?? summary?.contactVerified ?? 0,
      to: '/admin/acquisition/creators?status=EMAIL_REQUIRED'
    },
    { label: 'Needs Approval', value: needsApproval, to: '/admin/acquisition/approvals?tab=needs' },
    {
      label: 'Approved',
      value: summary?.cohortFunnel?.approved ?? approvedWaiting,
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

  const actions = [
    { label: 'Needs approval', count: needsApproval, to: '/admin/acquisition/approvals?tab=needs' },
    { label: 'Ready to send', count: approvedEligible, to: '/admin/acquisition/approvals?tab=ready' },
    { label: 'In cooldown', count: blockedCooldown, to: '/admin/acquisition/creators?status=COOLDOWN' },
    { label: 'Blocked by qualification', count: blockedQual, to: '/admin/acquisition/creators?status=OTHER' },
    { label: 'Follow-ups due', count: followUpsDue, to: '/admin/acquisition/campaigns' },
    { label: 'Replies', count: replies, to: '/admin/acquisition/inbox' }
  ];

  return (
    <AdminShell title="Acquisition" subtitle="North star first. Open Approvals to review and send.">
      {error && <p className="admin-crm-error">{error}</p>}

      <div className="ops-page-head acq-campaign-head">
        <div className="acq-status-pills">
          <span className="acq-pill">
            Campaign
            <strong className="acq-dot acq-dot-ok"> COOK-001</strong>
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
          {summary?.nextScheduledSendEt && (
            <span className="acq-pill">
              Next scheduled
              <strong> {new Date(summary.nextScheduledSendEt).toLocaleString()}</strong>
            </span>
          )}
        </div>
      </div>

      {approvedEligible > 0 && (
        <section className="ops-panel acq-blocker acq-blocker-hot">
          <header className="ops-section-head">
            <h2>Send approved now</h2>
            <p className="ops-muted" style={{ margin: 0 }}>
              {approvedEligible} approved creator{approvedEligible === 1 ? '' : 's'} eligible under daily gates (
              {dailyRemaining} remaining today).
            </p>
          </header>
          <Link className="ops-btn ops-btn-primary" to="/admin/acquisition/approvals?tab=ready">
            SEND APPROVED NOW ({approvedEligible})
          </Link>
        </section>
      )}

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
          <h2>Conversion funnel</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            Includes Needs Approval — drafts waiting for human review before send.
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
          <h2>Today&apos;s actions</h2>
        </header>
        <div className="acq-pipeline">
          {actions.map((a) => (
            <Link key={a.label} className="acq-pipeline-card" to={a.to}>
              <span>{a.label}</span>
              <strong>{a.count}</strong>
            </Link>
          ))}
        </div>
        <p className="ops-muted" style={{ marginTop: 12 }}>
          Approved waiting to send: <strong>{approvedWaiting}</strong> · Eligible now:{' '}
          <strong>{approvedEligible}</strong> · Cooldown: <strong>{blockedCooldown}</strong>
        </p>
      </section>
    </AdminShell>
  );
}
