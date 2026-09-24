import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';
import { AcqProspectDrawer } from './AcqProspectDrawer';
import {
  filterByWorkflowStatus,
  manualSendHardBlockReason,
  resolveAcqWorkflow,
  selectAllEligible,
  selectAllSendable,
  selectEligibleIds,
  selectSendableIds
} from './acqApprovalWorkflow';
import { formatDt, workflowBadgeKind } from './acqUiShared';
import { AdminConfirmDialog } from './AdminConfirmDialog';
import type { AcqBulkSendJob, AcqSendPreview } from '../types';

type ApprovalsTab = 'needs' | 'ready' | 'sent';

function tabFromParam(raw: string | null): ApprovalsTab {
  if (raw === 'ready' || raw === 'sent') return raw;
  return 'needs';
}

export function AcquisitionApprovalsPage() {
  useAdminCrm();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(searchParams.get('tab'));
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [allItems, setAllItems] = useState<AcqAdminProspect[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendPreview, setSendPreview] = useState<AcqSendPreview | null>(null);
  const [pendingSendIds, setPendingSendIds] = useState<string[]>([]);
  const [approveFirst, setApproveFirst] = useState(false);
  const [bulkJob, setBulkJob] = useState<AcqBulkSendJob | null>(null);

  const cooldownDays = summary?.cooldownDays ?? 14;
  const sendingEnabled = summary?.marketingSendingEnabled ?? true;
  const dailyLimit = summary?.dailyLimit ?? 100;
  const sentToday = summary?.sentToday ?? 0;
  const dailyRemaining = summary?.dailyRemaining ?? Math.max(0, dailyLimit - sentToday);
  const automaticSending = summary?.automaticSending === true;
  const pauseReason = summary?.automaticPauseReason || '';
  const sesRemaining = summary?.sesRemaining ?? null;
  const needsCount = summary?.needsApproval ?? summary?.pipeline?.needsApproval;
  const readyCount = summary?.pipeline?.readyToSend ?? summary?.approvedReadyToSend;

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, list] = await Promise.all([
        adminApi.acqSummary(),
        adminApi.acqProspects({ view: 'all', campaign: 'COOK-001', niche: 'cooking' })
      ]);
      setSummary(s);
      setAllItems(list.items || []);
      const enabled = s.marketingSendingEnabled ?? true;
      setSelected((cur) =>
        cur.filter((id) => {
          const row = (list.items || []).find((x) => x.public.prospectId === id);
          if (!row) return false;
          const wf = resolveAcqWorkflow(row, s.cooldownDays ?? 14, Date.now(), enabled);
          return wf.canSelectForApproval || wf.canSendNow;
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!bulkJob || bulkJob.status !== 'running') return;
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const job = await adminApi.acqBulkSendTick(bulkJob.jobId);
          setBulkJob(job);
          if (job.status !== 'running') await load();
        } catch {
          /* keep last known job */
        }
      })();
    }, 1500);
    return () => window.clearInterval(t);
  }, [bulkJob, load]);

  const setTab = (next: ApprovalsTab) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', next);
    setSearchParams(p, { replace: true });
    setSelected([]);
  };

  const needsRows = useMemo(
    () =>
      allItems.filter((r) => {
        if ((r.sendLane || '').toLowerCase() === 'needs_approval') return true;
        if (r.sendLane) return false;
        return filterByWorkflowStatus([r], 'READY_FOR_APPROVAL', cooldownDays, Date.now(), sendingEnabled).length > 0;
      }),
    [allItems, cooldownDays, sendingEnabled]
  );
  const readyRows = useMemo(
    () =>
      allItems.filter((r) => {
        if ((r.sendLane || '').toLowerCase() === 'ready_to_send') return true;
        if (r.sendLane) return false;
        return (r.public.outreachStatus || '').toLowerCase() === 'approved';
      }),
    [allItems]
  );
  const sentRows = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    return allItems
      .filter((r) => {
        const wf = resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled);
        if (wf.status !== 'SENT' && wf.status !== 'REPLIED' && wf.status !== 'CONVERTED') return false;
        if (!r.lastContactedAt) return false;
        return new Date(r.lastContactedAt).getTime() >= cutoff;
      })
      .sort((a, b) => {
        const ta = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0;
        const tb = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0;
        return tb - ta;
      });
  }, [allItems, cooldownDays, sendingEnabled]);

  const rows = tab === 'needs' ? needsRows : tab === 'ready' ? readyRows : sentRows;
  const eligibleVisible = needsRows.filter((r) =>
    resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSelectForApproval
  );
  const allEligibleSelected =
    eligibleVisible.length > 0 && eligibleVisible.every((r) => selected.includes(r.public.prospectId));

  const sendableReady = useMemo(
    () =>
      readyRows.filter((r) =>
        resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSendNow
      ),
    [readyRows, cooldownDays, sendingEnabled]
  );
  const approvedEligibleNow = sendableReady.length;
  const allSendableSelected =
    sendableReady.length > 0 && sendableReady.every((r) => selected.includes(r.public.prospectId));

  const approvedAutomationEligible = readyRows.filter((r) => {
    const wf = resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled);
    return wf.canSendNow && !wf.cooldownEndsAt;
  }).length;

  const approvedHardBlocked = readyRows.filter((r) => !!manualSendHardBlockReason(r)).length;
  const selectedSendable = selected.filter((id) => sendableReady.some((r) => r.public.prospectId === id));

  const drawer = drawerId ? allItems.find((x) => x.public.prospectId === drawerId) || null : null;

  const pollBulk = async (jobId: string) => {
    let job = await adminApi.acqBulkSendJob(jobId);
    setBulkJob(job);
    while (job.status === 'running' && job.remaining > 0) {
      await new Promise((r) => setTimeout(r, 400));
      job = await adminApi.acqBulkSendTick(jobId);
      setBulkJob(job);
    }
    return job;
  };

  const approveIds = async (ids: string[], andSend: boolean) => {
    if (!ids.length) return;
    if (andSend) {
      setBusy(true);
      setError('');
      setNote('');
      try {
        const preview = await adminApi.acqPreviewSend({
          campaign: 'COOK-001',
          prospectIds: ids,
          approveFirst: true
        });
        setSendPreview(preview);
        setPendingSendIds(ids);
        setApproveFirst(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not validate selection');
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await adminApi.acqApprove(ids);
      setNote(
        `Approved ${ids.length} creator${ids.length === 1 ? '' : 's'}. Nothing sends until you choose Approve & Send or scheduled send.`
      );
      if (ids.length) setTab('ready');
      setSelected([]);
      await load();
      void res;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmBulkSend = async () => {
    const ids = pendingSendIds;
    const preview = sendPreview;
    setSendPreview(null);
    if (!ids.length || !preview) return;
    setBusy(true);
    setError('');
    setNote(`Starting send of ${preview.willSend}…`);
    try {
      const started = await adminApi.acqBulkSendStart({
        campaign: preview.campaign || 'COOK-001',
        prospectIds: ids,
        approveFirst,
        dryRun: false
      });
      const done = await pollBulk(started.jobId);
      setNote(
        `Send finished. Sent ${done.sent} · Skipped ${done.skipped} · Failed ${done.failed}. Closing this page does not resend.`
      );
      if (done.sent > 0) setTab('sent');
      else if (approveFirst) setTab('ready');
      setSelected([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk send failed');
    } finally {
      setBusy(false);
      setPendingSendIds([]);
    }
  };

  const sendAllApproved = async (idsOverride?: string[]) => {
    const ids =
      idsOverride ??
      readyRows
        .filter((r) => resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSendNow)
        .map((r) => r.public.prospectId);
    if (ids.length <= 0) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const preview = await adminApi.acqPreviewSend({
        campaign: 'COOK-001',
        prospectIds: ids,
        approveFirst: false
      });
      setSendPreview(preview);
      setPendingSendIds(ids);
      setApproveFirst(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not validate selection');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Approvals" subtitle="Manual review stays here. COOK-001 automatic sending does not wait for this screen.">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}
      <section
        className="ops-panel"
        style={{
          marginBottom: 16,
          borderColor: automaticSending ? '#34d399' : '#f59e0b'
        }}
      >
        <p style={{ margin: 0, fontWeight: 700, letterSpacing: 0.4 }}>
          {automaticSending ? 'AUTOMATIC SENDING ACTIVE' : `AUTOMATIC SENDING PAUSED${pauseReason ? ` — ${pauseReason}` : ''}`}
        </p>
        <p className="ops-muted" style={{ margin: '8px 0 0' }}>
          Campaign: COOK-001 · Daily limit {dailyLimit} · Sent today {sentToday} · Remaining {dailyRemaining}
          {summary?.sesQuotaAvailable
            ? ` · SES remaining ${sesRemaining ?? '—'}/${summary.sesMax24HourSend ?? '—'}`
            : ' · SES quota unavailable'}
          {' · '}Dry run: {summary?.dryRun ? 'ON' : 'OFF'}
        </p>
        <div style={{ marginTop: 10 }}>
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => void load()}>
            Refresh status
          </button>
        </div>
      </section>
      {bulkJob && (bulkJob.status === 'running' || bulkJob.remaining > 0) && (
        <section className="ops-panel" style={{ marginBottom: 16 }}>
          <h2>Bulk send</h2>
          <p className="ops-muted">
            Preparing {bulkJob.eligible}/{dailyLimit} · Sending {bulkJob.sent + bulkJob.skipped + bulkJob.failed}/{bulkJob.eligible} · Accepted {bulkJob.sent} · Skipped {bulkJob.skipped} · Remaining {bulkJob.remaining}
          </p>
          <progress
            max={Math.max(1, bulkJob.sent + bulkJob.skipped + bulkJob.failed + bulkJob.remaining)}
            value={bulkJob.sent + bulkJob.skipped + bulkJob.failed}
          />
          <p className="ops-muted">You can close this page. Emails continue on the server and will not send twice.</p>
        </section>
      )}
      {sendPreview && (
        <AdminConfirmDialog
          title="Send outreach"
          confirmLabel={`Approve & Send ${sendPreview.willSend}`}
          confirmDisabled={sendPreview.willSend <= 0}
          onCancel={() => {
            setSendPreview(null);
            setPendingSendIds([]);
          }}
          onConfirm={() => void confirmBulkSend()}
        >
          <p>
            Selected: {sendPreview.selected}
            <br />
            Eligible now: {sendPreview.eligible}
            <br />
            Already contacted: {sendPreview.alreadyContacted}
            <br />
            Unsubscribed/suppressed: {sendPreview.unsubscribed}
            <br />
            Cooldown/follow-up blocked: {sendPreview.cooldown}
            <br />
            Invalid/unverified: {sendPreview.invalid}
          </p>
          <p>
            <strong>WILL SEND: {sendPreview.willSend}</strong>
          </p>
          <p>
            Campaign: {sendPreview.campaign}
            <br />
            Daily remaining: {sendPreview.remainingCapacity} / {sendPreview.dailyLimit}
          </p>
          <p>Nothing will be sent to suppressed or ineligible contacts. Counts come from the server right now.</p>
        </AdminConfirmDialog>
      )}

      <div className="acq-action-required-chips" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`acq-count-chip${tab === 'needs' ? ' acq-count-chip-active' : ''}`}
          onClick={() => setTab('needs')}
        >
          Needs Approval <strong>{needsCount ?? needsRows.length}</strong>
        </button>
        <button
          type="button"
          className={`acq-count-chip${tab === 'ready' ? ' acq-count-chip-active' : ''}`}
          onClick={() => setTab('ready')}
        >
          Ready to Send <strong>{readyCount ?? readyRows.length}</strong>
        </button>
        <button
          type="button"
          className={`acq-count-chip${tab === 'sent' ? ' acq-count-chip-active' : ''}`}
          onClick={() => setTab('sent')}
        >
          Recently Sent <strong>{summary?.sentLast7Days ?? sentRows.length}</strong>
          <span className="ops-muted" style={{ fontSize: 12, marginLeft: 4 }}>
            (7d)
          </span>
        </button>
        <span className="acq-count-chip">
          Sent today <strong>{sentToday}</strong>
        </span>
        <span className="acq-count-chip">
          Daily limit <strong>{dailyLimit}</strong>
        </span>
        <span className="acq-count-chip">
          Remaining <strong>{dailyRemaining}</strong>
        </span>
      </div>

      {tab === 'ready' && (
        <section className="ops-panel" style={{ marginBottom: 16 }}>
          <header className="ops-section-head">
            <h2>Send queue</h2>
            <p className="ops-muted" style={{ margin: 0 }}>
              Approved waiting {readyRows.length} · Manual-sendable {approvedEligibleNow}
              {approvedHardBlocked > 0 ? ` · Hard-blocked ${approvedHardBlocked}` : ''}
              {' · '}
              Daily limit {dailyLimit} · Sent today {sentToday} · Remaining {dailyRemaining}
              {approvedAutomationEligible !== approvedEligibleNow
                ? ` · Automation-eligible ${approvedAutomationEligible}`
                : ''}
            </p>
          </header>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              disabled={busy || approvedEligibleNow <= 0}
              title="Manual admin send. Bypasses automation cooldown; never bypasses unsubscribe, bounce, or suppression."
              onClick={() => void sendAllApproved()}
            >
              {approvedHardBlocked > 0 && approvedEligibleNow > 0
                ? `SEND ALL ELIGIBLE (${approvedEligibleNow})`
                : `SEND ALL APPROVED (${approvedEligibleNow})`}
            </button>
            {selectedSendable.length > 0 && (
              <button
                type="button"
                className="ops-btn ops-btn-primary"
                disabled={busy}
                onClick={() => void sendAllApproved(selectedSendable)}
              >
                SEND SELECTED ({selectedSendable.length})
              </button>
            )}
          </div>
        </section>
      )}

      {tab === 'ready' && selectedSendable.length > 0 && (
        <div className="acq-bulk-bar acq-bulk-bar-sticky">
          <span>
            <strong>{selectedSendable.length}</strong> selected
          </span>
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => setSelected([])}>
            Clear
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy}
            onClick={() => void sendAllApproved(selectedSendable)}
          >
            Send Selected ({selectedSendable.length})
          </button>
        </div>
      )}

      {tab === 'needs' && (
        <div className="acq-bulk-bar acq-bulk-bar-sticky">
          <span>
            {selected.length > 0 ? (
              <>
                <strong>{selected.length}</strong> selected
                {' · '}
                Daily remaining: <strong>{dailyRemaining}</strong> of {dailyLimit}
                {' · '}
                Will send now: <strong>{Math.min(selected.length, dailyRemaining)}</strong>
                {selected.length > dailyRemaining
                  ? ` · ${selected.length - dailyRemaining} stay Ready to Send`
                  : ''}
              </>
            ) : (
              <>
                <strong>{eligibleVisible.length}</strong> ready for approval
                {' · '}
                Daily limit: <strong>{dailyLimit}</strong> · Sent today {sentToday} · Remaining <strong>{dailyRemaining}</strong>
              </>
            )}
          </span>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy || eligibleVisible.length === 0}
            onClick={() =>
              setSelected(
                allEligibleSelected
                  ? []
                  : selectAllEligible(needsRows, cooldownDays, Date.now(), sendingEnabled)
              )
            }
          >
            {allEligibleSelected
              ? 'Clear selection'
              : `Select all ${eligibleVisible.length} eligible`}
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy || rows.length === 0}
            onClick={() =>
              setSelected(
                selectAllEligible(rows, cooldownDays, Date.now(), sendingEnabled)
              )
            }
          >
            Select page
          </button>
          {selected.length > 0 && (
            <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => setSelected([])}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy || selected.length === 0}
            onClick={() => void approveIds(selected, false)}
          >
            Approve Selected
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy || (selected.length === 0 && eligibleVisible.length === 0)}
            onClick={() => {
              const ids =
                selected.length > 0
                  ? selected
                  : selectAllEligible(needsRows, cooldownDays, Date.now(), sendingEnabled);
              if (!ids.length) return;
              void approveIds(ids, true);
            }}
          >
            {selected.length > 0
              ? `Approve & Send ${selected.length}`
              : `Approve & Send ${eligibleVisible.length}`}
          </button>
        </div>
      )}

      <section className="ops-panel">
        <div className="admin-crm-table-wrap acq-table-wrap">
          {rows.length === 0 ? (
            <div className="acq-empty">
              <h3>
                {tab === 'needs'
                  ? 'No creators need approval'
                  : tab === 'ready'
                    ? 'No approved creators waiting'
                    : 'No recent sends'}
              </h3>
            </div>
          ) : (
            <table className="admin-crm-table acq-table">
              <thead>
                <tr>
                  {(tab === 'needs' || tab === 'ready') && (
                    <th className="acq-col-check">
                      {tab === 'needs' && (
                        <input
                          type="checkbox"
                          checked={allEligibleSelected}
                          aria-label="Select all eligible"
                          disabled={eligibleVisible.length === 0}
                          onChange={() => {
                            if (allEligibleSelected) setSelected([]);
                            else
                              setSelected(
                                selectAllEligible(needsRows, cooldownDays, Date.now(), sendingEnabled)
                              );
                          }}
                        />
                      )}
                      {tab === 'ready' && sendableReady.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allSendableSelected}
                          aria-label="Select all sendable"
                          onChange={() => {
                            if (allSendableSelected) setSelected([]);
                            else
                              setSelected(
                                selectAllSendable(readyRows, cooldownDays, Date.now(), sendingEnabled, 500)
                              );
                          }}
                        />
                      )}
                    </th>
                  )}
                  <th className="acq-col-creator">Creator</th>
                  <th>Email preview</th>
                  <th>Status</th>
                  <th>Why not sent?</th>
                  <th className="acq-col-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const p = row.public;
                  const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
                  const selectedRow = selected.includes(p.prospectId);
                  return (
                    <tr key={p.prospectId} className={`acq-row ${selectedRow ? 'acq-row-selected' : ''}`}>
                      {tab === 'needs' && (
                        <td className="acq-col-check">
                          {wf.canSelectForApproval ? (
                            <input
                              type="checkbox"
                              checked={selectedRow}
                              aria-label={`Select ${p.channelName}`}
                              onChange={() =>
                                setSelected((cur) =>
                                  selectEligibleIds(
                                    allItems,
                                    cur,
                                    p.prospectId,
                                    500,
                                    cooldownDays,
                                    Date.now(),
                                    sendingEnabled
                                  )
                                )
                              }
                            />
                          ) : (
                            <span
                              className="acq-check-placeholder"
                              title={wf.checkboxDisabledReason || 'Not selectable'}
                            />
                          )}
                        </td>
                      )}
                      {tab === 'ready' && (
                        <td className="acq-col-check">
                          {wf.canSendNow ? (
                            <input
                              type="checkbox"
                              checked={selectedRow}
                              aria-label={`Select ${p.channelName}`}
                              onChange={() =>
                                setSelected((cur) =>
                                  selectSendableIds(
                                    readyRows,
                                    cur,
                                    p.prospectId,
                                    cooldownDays,
                                    Date.now(),
                                    sendingEnabled,
                                    500
                                  )
                                )
                              }
                            />
                          ) : (
                            <span className="acq-check-placeholder" />
                          )}
                        </td>
                      )}
                      <td className="acq-col-creator">
                        <div className="acq-creator-name">{p.channelName}</div>
                        <div className="ops-muted">{p.handle}</div>
                        <div className="ops-muted">{row.publicBusinessEmail || '—'}</div>
                      </td>
                      <td>
                        <div>
                          <strong>{p.subject || '—'}</strong>
                        </div>
                        <div className="ops-muted" style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>
                          {(row.body || '').slice(0, 180)}
                          {(row.body || '').length > 180 ? '…' : ''}
                        </div>
                      </td>
                      <td>
                        <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                        {tab === 'ready' && (
                          <div className="ops-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {wf.canSendNow
                              ? dailyRemaining <= 0
                                ? 'DAILY LIMIT'
                                : 'READY'
                              : manualSendHardBlockReason(row)?.toUpperCase() || wf.currentStatusAnswer}
                          </div>
                        )}
                        {tab === 'sent' && (
                          <div className="ops-muted admin-crm-nowrap">{formatDt(row.lastContactedAt)}</div>
                        )}
                      </td>
                      <td>
                        {tab === 'sent' ? (
                          <span className="ops-muted">Sent</span>
                        ) : (
                          <button
                            type="button"
                            className="ops-btn ops-btn-ghost ops-btn-sm"
                            title={row.whyNotSentHuman || row.whyNotSent || 'Server reason'}
                            onClick={() =>
                              window.alert(
                                `Why not sent?\n\n${row.whyNotSent || 'UNKNOWN'}\n${row.whyNotSentHuman || ''}`
                              )
                            }
                          >
                            {row.whyNotSent || 'UNKNOWN'}
                          </button>
                        )}
                      </td>
                      <td className="acq-col-action acq-actions">
                        {tab === 'needs' && (
                          <>
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              disabled={busy}
                              onClick={() => setDrawerId(p.prospectId)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('Rejection reason (optional):', '');
                                if (reason === null) return;
                                void (async () => {
                                  setBusy(true);
                                  try {
                                    await adminApi.acqReject(p.prospectId, reason || undefined);
                                    setNote('Rejected.');
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : 'Reject failed');
                                  } finally {
                                    setBusy(false);
                                  }
                                })();
                              }}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              className="ops-btn ops-btn-primary ops-btn-sm"
                              disabled={busy || !wf.canApprove}
                              onClick={() => void approveIds([p.prospectId], false)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="ops-btn ops-btn-primary ops-btn-sm"
                              disabled={busy || !wf.canApprove}
                              title="Approve and send immediately via SES (manual admin; bypasses automation cooldown)."
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Approve & send to ${row.publicBusinessEmail} now?\n\nThis sends immediately (manual admin). Automation cooldown does not block this.`
                                  )
                                )
                                  return;
                                void approveIds([p.prospectId], true);
                              }}
                            >
                              Approve &amp; Send
                            </button>
                          </>
                        )}
                        {tab === 'ready' && (
                          <>
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              onClick={() => setDrawerId(p.prospectId)}
                            >
                              View
                            </button>
                            {wf.cooldownEndsAt && (
                              <div className="acq-cooldown-hint" style={{ marginBottom: 6 }}>
                                <div className="ops-muted">
                                  Automation cooldown until: {formatDt(wf.cooldownEndsAt)}
                                </div>
                              </div>
                            )}
                            {wf.canSendNow ? (
                              <button
                                type="button"
                                className="ops-btn ops-btn-primary ops-btn-sm"
                                disabled={busy}
                                title="Manual send overrides the automation cooldown."
                                onClick={() => {
                                  const cooldownNote = wf.cooldownEndsAt
                                    ? '\n\nThis will bypass automation cooldown (manual admin send).'
                                    : '';
                                  if (
                                    !window.confirm(
                                      `Send now to ${row.publicBusinessEmail}?${cooldownNote}\n\nSubject: ${p.subject || '(none)'}`
                                    )
                                  )
                                    return;
                                  void (async () => {
                                    setBusy(true);
                                    try {
                                      const res = await adminApi.acqSendNow(p.prospectId);
                                      if (res.ok) {
                                        setNote(`Sent. Message ID: ${res.messageId || 'ok'}`);
                                        setTab('sent');
                                      } else setError(res.error || 'Send failed');
                                      await load();
                                    } catch (e) {
                                      setError(e instanceof Error ? e.message : 'Send failed');
                                    } finally {
                                      setBusy(false);
                                    }
                                  })();
                                }}
                              >
                                Send Now
                              </button>
                            ) : (
                              <span className="ops-muted">
                                {wf.currentStatusAnswer || 'Blocked by safety rules'}
                              </span>
                            )}
                          </>
                        )}
                        {tab === 'sent' && (
                          <button
                            type="button"
                            className="ops-btn ops-btn-ghost ops-btn-sm"
                            onClick={() => setDrawerId(p.prospectId)}
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {drawer && (
        <AcqProspectDrawer
          row={drawer}
          cooldownDays={cooldownDays}
          sendingEnabled={sendingEnabled}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setDrawerId(null)}
          onReload={load}
          setError={setError}
          setNote={setNote}
          showEmailPreview
        />
      )}
    </AdminShell>
  );
}
