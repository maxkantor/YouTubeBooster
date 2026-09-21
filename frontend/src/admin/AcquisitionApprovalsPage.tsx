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
  resolveAcqWorkflow,
  selectAllEligible,
  selectEligibleIds
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
          return row
            ? resolveAcqWorkflow(row, s.cooldownDays ?? 14, Date.now(), enabled).canSelectForApproval
            : false;
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
  // Ready to Send = all currently APPROVED prospects (including cooldown/score-blocked).
  // Send Now / Send All only enable for canSendNow.
  const readyRows = useMemo(
    () =>
      allItems.filter((r) => {
        const st = (r.public.outreachStatus || '').toLowerCase();
        return st === 'approved' || (r.public.approvalStatus || '').toLowerCase() === 'approved';
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

  const approvedEligibleNow =
    summary?.approvedReadyToSend ??
    summary?.pipeline?.approvedEligibleNow ??
    readyRows.filter((r) => resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSendNow).length;

  const drawer = drawerId ? allItems.find((x) => x.public.prospectId === drawerId) || null : null;

  const approveIds = async (ids: string[], andSend: boolean) => {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      if (andSend) {
        let sent = 0;
        let failed = 0;
        const failReasons: string[] = [];
        for (const id of ids) {
          const label =
            allItems.find((r) => r.public.prospectId === id)?.public.channelName || id;
          try {
            const res = await adminApi.acqApproveAndSend(id);
            if (res.ok && res.sent) sent++;
            else {
              failed++;
              failReasons.push(`${label}: ${res.error || 'send failed'}`);
            }
          } catch (e) {
            failed++;
            failReasons.push(`${label}: ${e instanceof Error ? e.message : 'send failed'}`);
          }
        }
        const detail = failReasons.length ? ` — ${failReasons.slice(0, 3).join('; ')}${failReasons.length > 3 ? '…' : ''}` : '';
        setNote(`Approve & send: ${sent} sent${failed ? `, ${failed} failed${detail}` : ''}.`);
        if (sent > 0) setTab('sent');
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

  const sendAllApproved = async () => {
    const n = approvedEligibleNow;
    const msg = [
      `Send all ${n} approved eligible creator(s)?`,
      '',
      `Daily limit: ${dailyLimit}`,
      `Sent today: ${sentToday}`,
      `Remaining: ${dailyRemaining}`,
      '',
      'Uses the same SES path as Send Now. Ineligible rows are skipped.'
    ].join('\n');
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const ids = readyRows
        .filter((r) => resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSendNow)
        .map((r) => r.public.prospectId);
      const res = await adminApi.acqSendApproved({ campaign: 'COOK-001', prospectIds: ids });
      setNote(`Send all approved: ${res.sent} sent, ${res.skipped} skipped.`);
      if (res.sent > 0) setTab('sent');
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
        </button>
      </div>

      {tab === 'ready' && (
        <section className="ops-panel" style={{ marginBottom: 16 }}>
          <header className="ops-section-head">
            <h2>Send queue</h2>
            <p className="ops-muted" style={{ margin: 0 }}>
              Sent today {sentToday} / {dailyLimit} · Remaining {dailyRemaining} · Eligible now {approvedEligibleNow}
            </p>
          </header>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy || approvedEligibleNow <= 0}
            onClick={() => void sendAllApproved()}
          >
            SEND ALL APPROVED ({approvedEligibleNow})
          </button>
        </section>
      )}

      {tab === 'needs' && selected.length > 0 && (
        <div className="acq-bulk-bar acq-bulk-bar-sticky">
          <span>
            <strong>{selected.length}</strong> selected
          </span>
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => setSelected([])}>
            Clear
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy}
            onClick={() => void approveIds(selected, false)}
          >
            Approve Selected
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Approve & send ${selected.length} selected?`)) return;
              void approveIds(selected, true);
            }}
          >
            Approve &amp; Send Selected
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
                  {tab === 'needs' && (
                    <th className="acq-col-check">
                      {eligibleVisible.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allEligibleSelected}
                          aria-label="Select all eligible"
                          onChange={() => {
                            if (allEligibleSelected) setSelected([]);
                            else setSelected(selectAllEligible(needsRows, 25));
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
                              onChange={() => setSelected((cur) => selectEligibleIds(allItems, cur, p.prospectId, 25))}
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
                              Edit
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
                              onClick={() => {
                                if (!window.confirm(`Approve & send to ${row.publicBusinessEmail}?`)) return;
                                void approveIds([p.prospectId], true);
                              }}
                            >
                              Approve &amp; Send
                            </button>
                          </>
                        )}
                        {tab === 'ready' && (
                          <>
                            {wf.canSendNow ? (
                              <button
                                type="button"
                                className="ops-btn ops-btn-primary ops-btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Send now to ${row.publicBusinessEmail}?\n\nSubject: ${p.subject || '(none)'}`
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
                                {wf.status === 'COOLDOWN'
                                  ? `Cooldown${wf.cooldownEndsAt ? ` → ${formatDt(wf.cooldownEndsAt)}` : ''}`
                                  : 'Blocked by send gates'}
                              </span>
                            )}
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              onClick={() => setDrawerId(p.prospectId)}
                            >
                              View
                            </button>
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
