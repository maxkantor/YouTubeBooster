import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqCampaignConfig, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { deliveredDisplay, rateOrNa } from './acqUiShared';
import { ACQ_CATEGORIES, ACQ_LANGUAGES, ACQ_MARKETS, ACQ_TIERS, categoryLabel, languageLabel, marketLabel } from './acqTaxonomy';
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
  const [campaigns, setCampaigns] = useState<AcqCampaignConfig[]>([]);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('technology');
  const [newLanguage, setNewLanguage] = useState('ru');
  const [newMarket, setNewMarket] = useState('');
  const [newTier, setNewTier] = useState('');
  const [newLimit, setNewLimit] = useState(100);
  const [cookLimit, setCookLimit] = useState(100);
  const [cookMode, setCookMode] = useState('automatic');
  const [cookDry, setCookDry] = useState(false);
  const [cookAutoSend, setCookAutoSend] = useState(true);
  const [cookDiscover, setCookDiscover] = useState(true);
  const [cookEmails, setCookEmails] = useState(true);
  const [cookDrafts, setCookDrafts] = useState(true);
  const [cookFollow, setCookFollow] = useState(true);
  const [cookFollowMax, setCookFollowMax] = useState(2);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, camps] = await Promise.all([
        adminApi.acqSummary(),
        adminApi.acqCampaigns().catch(() => ({ items: [] as AcqCampaignConfig[] }))
      ]);
      setSummary(s);
      setCampaigns(camps.items || []);
      const cook = (camps.items || []).find((c) => c.campaignId === 'COOK-001');
      if (cook) {
        setCookLimit(cook.dailyLimit);
        setCookMode(cook.sendingMode || 'automatic');
        setCookDry(cook.dryRun === true);
        setCookAutoSend(cook.autoSend !== false);
        setCookDiscover(cook.autoDiscover !== false);
        setCookEmails(cook.autoFindEmails !== false);
        setCookDrafts(cook.autoPrepareDrafts !== false);
        setCookFollow(cook.autoFollowUps !== false);
        setCookFollowMax(cook.maxFollowUps ?? 2);
      } else {
        setCookLimit(s.dailyLimit ?? 100);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaign');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dailyLimit = summary?.dailyLimit ?? 100;
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
              <span>Automatic sending</span>
              <strong className={summary.automaticSending ? 'acq-ok' : 'acq-bad'}>
                {summary.automaticSending ? 'ON' : `PAUSED${summary.automaticPauseReason ? ` — ${summary.automaticPauseReason}` : ''}`}
              </strong>
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
              <span>Remaining today</span>
              <strong>{summary.dailyRemaining ?? Math.max(0, dailyLimit - sentToday)}</strong>
            </div>
            <div>
              <span>Sending mode</span>
              <strong>{(campaigns.find((c) => c.campaignId === 'COOK-001')?.sendingMode || 'automatic').toUpperCase()}</strong>
            </div>
            <div>
              <span>Ready to send</span>
              <strong>{eligibleNow}</strong>
            </div>
            <div>
              <span>Needs approval</span>
              <strong>{needsApproval}</strong>
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
              <span>SES remaining</span>
              <strong>
                {summary.sesQuotaAvailable
                  ? `${summary.sesRemaining ?? '—'} / ${summary.sesMax24HourSend ?? '—'}`
                  : 'Unavailable'}
              </strong>
            </div>
            <div>
              <span>Dry run</span>
              <strong>{summary.dryRun ? 'ON' : 'OFF'}</strong>
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

        <div className="acq-toolbar" style={{ marginTop: 16 }}>
          <label>
            Sending mode
            <select className="admin-crm-select" value={cookMode} onChange={(e) => setCookMode(e.target.value)}>
              <option value="manual">Manual approval</option>
              <option value="automatic">Automatic</option>
            </select>
          </label>
          <label>
            Daily send limit
            <input
              className="admin-crm-input"
              type="number"
              min={1}
              max={500}
              value={cookLimit}
              onChange={(e) => setCookLimit(Number(e.target.value) || 10)}
            />
          </label>
          <label>
            Maximum follow-ups
            <input
              className="admin-crm-input"
              type="number"
              min={0}
              max={2}
              value={cookFollowMax}
              onChange={(e) => setCookFollowMax(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }} className="ops-muted">
          <label><input type="checkbox" checked={cookDiscover} onChange={(e) => setCookDiscover(e.target.checked)} /> Discover new creators automatically</label><br />
          <label><input type="checkbox" checked={cookEmails} onChange={(e) => setCookEmails(e.target.checked)} /> Find public business emails automatically</label><br />
          <label><input type="checkbox" checked={cookDrafts} onChange={(e) => setCookDrafts(e.target.checked)} /> Prepare personalized drafts automatically</label><br />
          <label><input type="checkbox" checked={cookAutoSend} onChange={(e) => setCookAutoSend(e.target.checked)} /> Send qualified emails automatically</label><br />
          <label><input type="checkbox" checked={cookFollow} onChange={(e) => setCookFollow(e.target.checked)} /> Send permitted follow-ups</label><br />
          <label><input type="checkbox" checked={cookDry} onChange={(e) => setCookDry(e.target.checked)} /> Dry run (complete decisions, send zero emails)</label>
        </div>
        <div className="acq-blocker-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  await adminApi.acqUpdateCampaign('COOK-001', {
                    sendingMode: cookMode,
                    dailyLimit: cookLimit,
                    dryRun: cookDry,
                    maxFollowUps: cookFollowMax,
                    autoDiscover: cookDiscover,
                    autoFindEmails: cookEmails,
                    autoPrepareDrafts: cookDrafts,
                    autoSend: cookAutoSend,
                    autoFollowUps: cookFollow
                  });
                  setNote(
                    cookDry
                      ? 'COOK-001 saved. Dry run is on — the next job sends zero emails.'
                      : 'COOK-001 settings saved. Volume only changes when you set it here.'
                  );
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not save campaign settings');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Save automation settings
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  const res = await adminApi.acqRunSend({ campaign: 'COOK-001', dryRun: true });
                  setNote(
                    `DRY RUN — COOK-001. Would send ${res.wouldSend ?? 0}. External emails sent: ${res.sent ?? 0}. Drafts prepared ${res.draftsPrepared ?? 0}.`
                  );
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Dry run failed');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Dry run now
          </button>
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
                <strong>
                  {deliveredDisplay(sentLifetime, summary.delivered, summary.deliveryTelemetryAvailable)}
                </strong>
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

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Additional campaigns</h2>
        </header>
        <p className="ops-muted">
          New campaigns start in Manual approval with dry run on and sending off. Enable Automatic only when you are
          ready. Daily limit is a maximum, not a target.
        </p>
        {campaigns.filter((c) => c.campaignId !== 'COOK-001').length > 0 && (
          <div className="acq-skip-list" style={{ marginBottom: 12 }}>
            {campaigns
              .filter((c) => c.campaignId !== 'COOK-001')
              .map((c) => (
                <div key={c.campaignId} className="acq-skip-row">
                  <span>
                    {c.campaignId} · {categoryLabel(c.category)} / {languageLabel(c.language)} / {marketLabel(c.market)}
                    <br />
                    {c.status || 'PAUSED'} · {(c.sendingMode || 'manual').toUpperCase()}
                    {c.dryRun ? ' · DRY RUN' : ''} · Daily {c.dailyLimit} · Sent today {c.sentToday ?? 0} · Remaining{' '}
                    {c.remainingToday ?? c.dailyLimit} · Ready {c.readyToSend ?? 0} · Needs approval {c.needsApproval ?? 0}
                  </span>
                  <strong>{c.sendingEnabled ? 'Sending on' : 'Sending off'}</strong>
                </div>
              ))}
          </div>
        )}
        <div className="acq-toolbar">
          <label>
            Name
            <input className="admin-crm-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="RU-TECH-001" />
          </label>
          <label>
            Category
            <select className="admin-crm-select" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {ACQ_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select className="admin-crm-select" value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)}>
              {ACQ_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Market
            <select className="admin-crm-select" value={newMarket} onChange={(e) => setNewMarket(e.target.value)}>
              {ACQ_MARKETS.map((m) => (
                <option key={m.id || 'all'} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tier
            <select className="admin-crm-select" value={newTier} onChange={(e) => setNewTier(e.target.value)}>
              <option value="">All</option>
              {ACQ_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Daily limit
            <input
              className="admin-crm-input"
              type="number"
              min={1}
              max={500}
              value={newLimit}
              onChange={(e) => setNewLimit(Number(e.target.value) || 10)}
            />
          </label>
        </div>
        <div className="acq-blocker-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  const row = await adminApi.acqCreateCampaign({
                    name: newName || undefined,
                    category: newCategory,
                    language: newLanguage,
                    market: newMarket || undefined,
                    tier: newTier || undefined,
                    dailyLimit: newLimit,
                    sendingEnabled: false,
                    sendingMode: 'manual',
                    dryRun: true
                  });
                  setNote(`Campaign ${row.campaignId} saved. Manual approval, dry run on, sending off.`);
                  await load();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not save campaign');
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Save campaign (sending off)
          </button>
        </div>
      </section>
    </AdminShell>
  );
}
