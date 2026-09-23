import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { rateOrNa } from './acqUiShared';
import { explainWeekdaySendResult, type AcqWeekdaySendView } from './acqWeekdaySendResult';

export function AcquisitionCampaignsPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [runView, setRunView] = useState<AcqWeekdaySendView | null>(null);
  const [runAt, setRunAt] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSummary(await adminApi.acqSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaign');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dailyLimit = summary?.dailyLimit ?? 10;
  const sentToday = summary?.sentToday ?? 0;
  const cooldownDays = summary?.cooldownDays ?? 14;
  const sentLifetime = summary?.sentLifetime ?? summary?.sent ?? 0;
  const approvedWaiting = summary?.approvedWaiting ?? summary?.currentlyApprovedWaitingToSend ?? summary?.approved ?? 0;
  const eligibleNow = summary?.approvedReadyToSend ?? summary?.pipeline?.approvedEligibleNow ?? 0;
  const needsApproval = summary?.needsApproval ?? 0;

  const runScheduledSend = async () => {
    setConfirmSend(false);
    setBusy(true);
    setError('');
    setNote('Running scheduled send…');
    setRunView(null);
    setRunAt('');
    try {
      const res = await adminApi.acqRunSend();
      const view = explainWeekdaySendResult(res, { approvedWaiting, eligibleNow, needsApproval });
      setRunView(view);
      setRunAt(new Date().toLocaleString());
      setNote(view.headline);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Campaigns" subtitle="COOK-001 controls and scheduled send — no prospect table.">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Acquisition configuration</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            Cooking is primary. Expansion categories/languages are selectable in Creators. No China campaign.
            Spanish/Portuguese are configuration-ready, not auto-sending. Strategic creators never enter weekday
            SES automatically.
          </p>
        </header>
        <p className="ops-muted">
          Phase 1 live: Cooking / English, Cooking / Russian. India English/Hindi and other categories are
          filterable now — do not bulk-send them until you approve a campaign. Campaign IDs are not hard-coded
          beyond keeping COOK-001 as the existing history.
        </p>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>COOK-001</h2>
        </header>
        {summary && (
          <div className="acq-health-grid">
            <div>
              <span>Status</span>
              <strong className={summary.marketingSendingEnabled ? 'acq-ok' : 'acq-bad'}>
                {summary.marketingSendingEnabled ? 'ACTIVE' : 'PAUSED'}
              </strong>
            </div>
            <div>
              <span>Sending enabled</span>
              <strong>{summary.marketingSendingEnabled ? 'Yes' : 'No'}</strong>
            </div>
            <div>
              <span>Daily limit</span>
              <strong>{dailyLimit}</strong>
            </div>
            <div>
              <span>Sent today</span>
              <strong>{sentToday}</strong>
            </div>
            <div>
              <span>Daily remaining</span>
              <strong>{summary.dailyRemaining ?? Math.max(0, dailyLimit - sentToday)}</strong>
            </div>
            <div>
              <span>Cooldown days</span>
              <strong>{cooldownDays}</strong>
            </div>
            <div>
              <span>SES configured</span>
              <strong className={summary.sesConfigured ? 'acq-ok' : 'acq-bad'}>
                {summary.sesConfigured ? '✓' : '✗'}
              </strong>
            </div>
            <div>
              <span>Next scheduled (ET)</span>
              <strong>
                {summary.nextScheduledSendEt
                  ? new Date(summary.nextScheduledSendEt).toLocaleString()
                  : 'Weekday 8:00 AM ET'}
              </strong>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <p className="ops-muted">
            <strong>Follow-up policy:</strong> After initial send, up to 2 follow-ups may run when due (same SES path,
            cooldown / suppression / daily limit still apply). Replies and conversions stop further follow-ups.
          </p>
        </div>

        <div className="acq-blocker-actions" style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy || !summary}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  await adminApi.acqCampaignFlags({
                    campaign: 'COOK-001',
                    sendingEnabled: !(summary?.marketingSendingEnabled ?? true)
                  });
                  setNote(
                    summary?.marketingSendingEnabled
                      ? 'Campaign sending paused.'
                      : 'Campaign sending enabled.'
                  );
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Campaign flag update failed');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {summary?.marketingSendingEnabled ? 'Pause sending' : 'Enable sending'}
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy}
            onClick={() => {
              setError('');
              setConfirmSend(true);
            }}
          >
            {busy ? 'Running…' : 'Run Scheduled Send Now'}
          </button>
        </div>

        {confirmSend && (
          <div className="acq-discovery-confirm" role="dialog" aria-modal="true" style={{ marginTop: 16 }}>
            <h3>Run weekday send now?</h3>
            <p className="ops-muted">
              Same gates as the 8:00 AM ET job. Sends real SES mail when COOK-001 sending is enabled.
            </p>
            <p className="ops-muted">
              Ready to send: <strong>{eligibleNow}</strong>
              {' · '}
              Approved waiting: <strong>{approvedWaiting}</strong>
              {' · '}
              Needs approval: <strong>{needsApproval}</strong>
            </p>
            {eligibleNow <= 0 && (
              <p className="ops-muted">
                Nothing is eligible now. This will still evaluate the cohort and will likely send 0.
              </p>
            )}
            <div className="acq-blocker-actions" style={{ marginTop: 12 }}>
              <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => setConfirmSend(false)}>
                Cancel
              </button>
              <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={() => void runScheduledSend()}>
                Confirm &amp; send
              </button>
            </div>
          </div>
        )}

        {(busy || runView) && (
          <div className="acq-discovery-confirm" style={{ marginTop: 16 }} aria-live="polite">
            {busy && !runView ? (
              <>
                <h3>Running scheduled send…</h3>
                <p className="ops-muted">Evaluating COOK-001 against weekday gates. This can take a minute.</p>
              </>
            ) : runView ? (
              <>
                <h3>{runView.headline}</h3>
                {runAt && <p className="ops-muted">Finished {runAt}</p>}
                <p className="ops-muted">{runView.explanation}</p>
                {runView.skipLines.length > 0 && (
                  <ul className="acq-discovery-stats">
                    {runView.skipLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {runView.openApprovals && (
                  <div className="acq-blocker-actions">
                    <Link className="ops-btn ops-btn-primary" to="/admin/acquisition/approvals?tab=needs">
                      Open Approvals
                    </Link>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Performance</h2>
        </header>
        {summary && (
          <>
            <div className="acq-health-grid">
              <div>
                <span>Sent lifetime</span>
                <strong>{sentLifetime}</strong>
              </div>
              <div>
                <span>Delivered</span>
                <strong>{summary.delivered ?? 0}</strong>
              </div>
              <div>
                <span>Clicked</span>
                <strong>{summary.clicked ?? 0}</strong>
              </div>
              <div>
                <span>Audit started</span>
                <strong>{summary.auditStarted ?? 0}</strong>
              </div>
              <div>
                <span>Converted</span>
                <strong>{summary.converted ?? 0}</strong>
              </div>
              <div>
                <span>Approved waiting</span>
                <strong>{summary.approvedWaiting ?? summary.currentlyApprovedWaitingToSend ?? summary.approved}</strong>
              </div>
              <div>
                <span>Eligible now</span>
                <strong>{summary.approvedReadyToSend ?? summary.pipeline?.approvedEligibleNow ?? 0}</strong>
              </div>
              <div>
                <span>Needs approval</span>
                <strong>{summary.needsApproval ?? 0}</strong>
              </div>
            </div>
            <h3 className="acq-health-sub">Deliverability</h3>
            <div className="acq-health-grid">
              <div>
                <span>Bounce</span>
                <strong className="ops-muted">{rateOrNa(summary.bounced ?? 0, sentLifetime)}</strong>
              </div>
              <div>
                <span>Complaint</span>
                <strong className="ops-muted">{rateOrNa(summary.complained ?? 0, sentLifetime)}</strong>
              </div>
              <div>
                <span>Unsubscribe</span>
                <strong className="ops-muted">{rateOrNa(summary.unsubscribed ?? 0, sentLifetime)}</strong>
              </div>
            </div>
          </>
        )}
      </section>
    </AdminShell>
  );
}
