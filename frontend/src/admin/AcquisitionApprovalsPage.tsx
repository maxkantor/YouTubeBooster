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

  const cooldownDays = summary?.cooldownDays ?? 14;
  const sendingEnabled = summary?.marketingSendingEnabled ?? true;
  const dailyLimit = summary?.dailyLimit ?? 10;
  const sentToday = summary?.sentToday ?? 0;
  const dailyRemaining = summary?.dailyRemaining ?? Math.max(0, dailyLimit - sentToday);

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

  const setTab = (next: ApprovalsTab) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', next);
    setSearchParams(p, { replace: true });
    setSelected([]);
  };

  const needsRows = useMemo(
    () => filterByWorkflowStatus(allItems, 'READY_FOR_APPROVAL', cooldownDays, Date.now(), sendingEnabled),
    [allItems, cooldownDays, sendingEnabled]
  );
  // Ready to Send = outreachStatus approved only (ApprovalId can linger after send).
  const readyRows = useMemo(
    () =>
      allItems.filter((r) => (r.public.outreachStatus || '').toLowerCase() === 'approved'),
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

  const approveIds = async (ids: string[], andSend: boolean) => {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      if (andSend) {
        // Approve all first so daily-limit leftovers stay Ready to Send.
        const approveRes = await adminApi.acqApprove(ids);
        let sent = 0;
        let failed = 0;
        let deferred = 0;
        const failReasons: string[] = [];
        let capacity = dailyRemaining;
        for (const id of ids) {
          const label =
            allItems.find((r) => r.public.prospectId === id)?.public.channelName || id;
          if (capacity <= 0) {
            deferred++;
            continue;
          }
          try {
            const res = await adminApi.acqApproveAndSend(id);
            if (res.ok && res.sent) {
              sent++;
              capacity--;
            } else {
              // Already approved above — stays Ready to Send unless hard-blocked.
              if (res.error === 'daily_limit_reached') deferred++;
              else {
                failed++;
                failReasons.push(`${label}: ${res.error || 'send failed'}`);
              }
            }
          } catch (e) {
            failed++;
            failReasons.push(`${label}: ${e instanceof Error ? e.message : 'send failed'}`);
          }
        }
        const detail = failReasons.length
          ? ` — ${failReasons.slice(0, 3).join('; ')}${failReasons.length > 3 ? '…' : ''}`
          : '';
        setNote(
          `Approve & send: ${sent} sent` +
            (deferred ? `, ${deferred} left Ready to Send (daily capacity)` : '') +
            (failed ? `, ${failed} blocked${detail}` : '') +
            `. Approval ${approveRes.approvalId}. Capacity was ${dailyRemaining}/${dailyLimit}.`
        );
        if (sent > 0) setTab('sent');
        else setTab('ready');
      } else {
        const res = await adminApi.acqApprove(ids);
        setNote(`Approval ${res.approvalId} stored. Nothing sends until Send Now / scheduled send.`);
        if (ids.length) setTab('ready');
      }
      setSelected([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const sendAllApproved = async (idsOverride?: string[]) => {
    const ids =
      idsOverride ??
      readyRows
        .filter((r) => resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSendNow)
        .map((r) => r.public.prospectId);
    const n = ids.length;
    if (n <= 0) return;
    const cooldownBypass = ids.filter((id) => {
      const row = readyRows.find((r) => r.public.prospectId === id);
      if (!row) return false;
      const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
      return !!wf.cooldownEndsAt;
    }).length;
    const hardBlocked = Math.max(0, readyRows.length - approvedEligibleNow);
    const msg = [
      `Send ${n} approved email${n === 1 ? '' : 's'} now?`,
      '',
      `${cooldownBypass} will bypass automation cooldown.`,
      `${hardBlocked} approved row${hardBlocked === 1 ? '' : 's'} remain blocked by suppression/safety rules.`,
      '',
      `Daily send capacity remaining: ${dailyRemaining} / ${dailyLimit}.`,
      n > dailyRemaining
        ? `Only ${dailyRemaining} will send now; the rest stay Ready to Send.`
        : 'All selected fit within today’s daily capacity.',
      'Suppression, bounce, and unsubscribe are never bypassed.'
    ].join('\n');
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await adminApi.acqSendApproved({ campaign: 'COOK-001', prospectIds: ids });
      setNote(`Send approved: ${res.sent} sent, ${res.skipped} skipped.`);
      if (res.sent > 0) setTab('sent');
      setSelected([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send approved failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Approvals" subtitle="Review drafts, approve, and send. Nothing external sends without your action here.">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <div className="acq-action-required-chips" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`acq-count-chip${tab === 'needs' ? ' acq-count-chip-active' : ''}`}
          onClick={() => setTab('needs')}
        >
          Needs Approval <strong>{needsRows.length}</strong>
        </button>
        <button
          type="button"
          className={`acq-count-chip${tab === 'ready' ? ' acq-count-chip-active' : ''}`}
          onClick={() => setTab('ready')}
        >
          Ready to Send <strong>{readyRows.length}</strong>
        </button>
        <button
          type="button"
          className={`acq-count-chip${tab === 'sent' ? ' acq-count-chip-active' : ''}`}
          onClick={() => setTab('sent')}
        >
          Recently Sent <strong>{sentRows.length}</strong>
          <span className="ops-muted" style={{ fontSize: 12, marginLeft: 4 }}>
            (7d)
          </span>
        </button>
      </div>

      {tab === 'ready' && (
        <section className="ops-panel" style={{ marginBottom: 16 }}>
          <header className="ops-section-head">
            <h2>Send queue</h2>
            <p className="ops-muted" style={{ margin: 0 }}>
              Approved waiting {readyRows.length} · Manual-sendable {approvedEligibleNow}
              {approvedHardBlocked > 0 ? ` · Hard-blocked ${approvedHardBlocked}` : ''}
              {' · '}
              Sent today {sentToday} / {dailyLimit} (automation)
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
                Daily capacity remaining: <strong>{dailyRemaining}</strong>/{dailyLimit}
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
                Daily capacity: <strong>{dailyRemaining}</strong>/{dailyLimit}
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
                  : selectAllEligible(needsRows, cooldownDays, Date.now(), sendingEnabled, 30)
              )
            }
          >
            {allEligibleSelected ? 'Clear selection' : `Select all (${Math.min(30, eligibleVisible.length)})`}
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
                  : selectAllEligible(needsRows, cooldownDays, Date.now(), sendingEnabled, 30);
              if (!ids.length) return;
              const willSend = Math.min(ids.length, dailyRemaining);
              const stayReady = Math.max(0, ids.length - willSend);
              if (
                !window.confirm(
                  [
                    `Approve ${ids.length} creator${ids.length === 1 ? '' : 's'}.`,
                    '',
                    `Daily send capacity remaining: ${dailyRemaining} / ${dailyLimit}`,
                    `Will attempt SES now: ${willSend}`,
                    stayReady > 0
                      ? `Remainder staying Ready to Send for scheduled send: ${stayReady}`
                      : 'All selected fit within today’s capacity.',
                    '',
                    'Nothing bypasses suppression, invalid email, or daily limit.'
                  ].join('\n')
                )
              )
                return;
              void approveIds(ids, true);
            }}
          >
            {selected.length > 0
              ? `Approve & Send Selected (${selected.length})`
              : `Approve & Send All (${Math.min(30, eligibleVisible.length)})`}
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
                                selectAllEligible(needsRows, cooldownDays, Date.now(), sendingEnabled, 30)
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
                                selectAllSendable(readyRows, cooldownDays, Date.now(), sendingEnabled, 50)
                              );
                          }}
                        />
                      )}
                    </th>
                  )}
                  <th className="acq-col-creator">Creator</th>
                  <th>Email preview</th>
                  <th>Status</th>
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
                                    30,
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
                                    50
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
