import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { rateOrNa } from './acqUiShared';

export function AcquisitionCampaignsPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

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
              if (
                !window.confirm(
                  'Run scheduled weekday send now? Uses RunWeekdaySendAsync (same gates as cron). Will send real SES mail if sending is enabled.'
                )
              )
                return;
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  const res = await adminApi.acqRunSend();
                  setNote(
                    `Weekday send finished: attempted ${res.attempted ?? res.sesAttempted ?? 0}, sent ${res.sent ?? 0}, skipped ${res.skipped ?? 0}.`
                  );
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Run send failed');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Run Scheduled Send Now
          </button>
        </div>
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
