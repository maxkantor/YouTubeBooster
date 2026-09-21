import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';
import { AcqProspectDrawer } from './AcqProspectDrawer';
import {
  type AcqPrimaryAction,
  type AcqWorkflowStatus,
  countWorkflowStatuses,
  filterByWorkflowStatus,
  resolveAcqWorkflow
} from './acqApprovalWorkflow';
import { WORKFLOW_FILTERS, formatDt, workflowBadgeKind } from './acqUiShared';

export function AcquisitionCreatorsPage() {
  useAdminCrm();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = (searchParams.get('status') as AcqWorkflowStatus | 'all' | null) || 'all';
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [allItems, setAllItems] = useState<AcqAdminProspect[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<AcqWorkflowStatus | 'all'>(
    statusParam === 'all' || WORKFLOW_FILTERS.some((f) => f.value === statusParam) ? statusParam : 'all'
  );
  const [niche, setNiche] = useState('cooking');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [inspectInput, setInspectInput] = useState('');
  const [showInspect, setShowInspect] = useState(false);

  const cooldownDays = summary?.cooldownDays ?? 14;
  const sendingEnabled = summary?.marketingSendingEnabled ?? true;

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, list] = await Promise.all([
        adminApi.acqSummary(),
        adminApi.acqProspects({
          view: 'all',
          niche: niche || undefined,
          campaign: 'COOK-001',
          q: searchApplied || undefined
        })
      ]);
      setSummary(s);
      setAllItems(list.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load creators');
    }
  }, [niche, searchApplied]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (statusParam && statusParam !== workflowFilter) {
      setWorkflowFilter(statusParam === 'all' || WORKFLOW_FILTERS.some((f) => f.value === statusParam) ? statusParam : 'all');
    }
  }, [statusParam]);

  const setFilter = (value: AcqWorkflowStatus | 'all') => {
    setWorkflowFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next, { replace: true });
  };

  const items = useMemo(
    () => filterByWorkflowStatus(allItems, workflowFilter, cooldownDays, Date.now(), sendingEnabled),
    [allItems, workflowFilter, cooldownDays, sendingEnabled]
  );

  const counts = useMemo(
    () => countWorkflowStatuses(allItems, cooldownDays, Date.now(), sendingEnabled),
    [allItems, cooldownDays, sendingEnabled]
  );

  const drawer = drawerId ? allItems.find((x) => x.public.prospectId === drawerId) || null : null;

  const runPrimary = (id: string, action: AcqPrimaryAction) => {
    if (action === 'prepare_draft') {
      void (async () => {
        setBusy(true);
        try {
          await adminApi.acqDraft(id);
          setNote('Draft prepared.');
          await load();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Prepare draft failed');
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setDrawerId(id);
  };

  return (
    <AdminShell title="Creators" subtitle="Master prospect database — all COOK-001 creators.">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <section className="ops-panel">
        <div className="acq-toolbar">
          <label>
            Status
            <select
              className="admin-crm-select"
              value={workflowFilter}
              onChange={(e) => setFilter(e.target.value as AcqWorkflowStatus | 'all')}
            >
              {WORKFLOW_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.value !== 'all' ? ` (${counts[o.value as AcqWorkflowStatus] ?? 0})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select className="admin-crm-select" value={niche} onChange={(e) => setNiche(e.target.value)}>
              <option value="">All</option>
              <option value="cooking">Cooking</option>
              <option value="fitness">Fitness</option>
              <option value="travel">Travel</option>
              <option value="diy">DIY / home</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="acq-search">
            Search
            <div className="acq-search-row">
              <input
                className="admin-crm-input"
                placeholder="Search creator, handle, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSearchApplied(search.trim());
                }}
              />
              <button type="button" className="ops-btn ops-btn-ghost" onClick={() => setSearchApplied(search.trim())}>
                Search
              </button>
            </div>
          </label>
          <button type="button" className="ops-btn ops-btn-ghost" onClick={() => setShowInspect((v) => !v)}>
            Inspect channel
          </button>
        </div>

        {showInspect && (
          <div className="acq-inspect-row">
            <input
              className="admin-crm-input"
              placeholder="@handle or channel URL"
              value={inspectInput}
              onChange={(e) => setInspectInput(e.target.value)}
            />
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              disabled={busy || !inspectInput.trim()}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await adminApi.acqInspect({
                      channelInput: inspectInput.trim(),
                      primaryNiche: niche || 'cooking',
                      campaign: 'COOK-001',
                      contactType: 'none'
                    });
                    setInspectInput('');
                    setShowInspect(false);
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Inspect failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Inspect (no email)
            </button>
          </div>
        )}

        <div className="admin-crm-table-wrap acq-table-wrap">
          {items.length === 0 ? (
            <div className="acq-empty">
              <h3>No creators match these filters.</h3>
              <p className="ops-muted">{allItems.length} prospects loaded.</p>
            </div>
          ) : (
            <table className="admin-crm-table acq-table">
              <thead>
                <tr>
                  <th className="acq-col-creator">Creator</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Last contact</th>
                  <th className="acq-col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const p = row.public;
                  const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
                  return (
                    <tr key={p.prospectId} className="acq-row">
                      <td className="acq-col-creator">
                        <div className="acq-creator-name">{p.channelName}</div>
                        <div className="ops-muted">{p.handle}</div>
                      </td>
                      <td>{p.subscriberRange}</td>
                      <td>
                        <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                      </td>
                      <td className="admin-crm-nowrap">{formatDt(row.lastContactedAt)}</td>
                      <td className="acq-col-action">
                        <button
                          type="button"
                          className="ops-btn ops-btn-primary ops-btn-sm"
                          disabled={busy}
                          onClick={() => runPrimary(p.prospectId, wf.primaryAction)}
                        >
                          {wf.primaryActionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="ops-muted">
          Showing {items.length} of {allItems.length}
        </p>
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
        />
      )}
    </AdminShell>
  );
}
