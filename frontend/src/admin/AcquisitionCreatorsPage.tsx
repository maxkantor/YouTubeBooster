import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqEmailDiscoveryJob, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';
import { AcqProspectDrawer } from './AcqProspectDrawer';
import {
  type AcqEmailStatusFilter,
  type AcqPrimaryAction,
  type AcqWorkflowStatus,
  countEmailStatuses,
  countWorkflowStatuses,
  filterByEmailStatus,
  filterByWorkflowStatus,
  resolveAcqWorkflow
} from './acqApprovalWorkflow';
import { EMAIL_STATUS_FILTERS, WORKFLOW_FILTERS, formatDt, workflowBadgeKind } from './acqUiShared';

type ConfirmMode = 'missing' | 'filtered' | 'selected' | null;

export function AcquisitionCreatorsPage() {
  useAdminCrm();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = (searchParams.get('status') as AcqWorkflowStatus | 'all' | null) || 'all';
  const emailParam = (searchParams.get('email') as AcqEmailStatusFilter | null) || 'all';
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [allItems, setAllItems] = useState<AcqAdminProspect[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<AcqWorkflowStatus | 'all'>(
    statusParam === 'all' || WORKFLOW_FILTERS.some((f) => f.value === statusParam) ? statusParam : 'all'
  );
  const [emailFilter, setEmailFilter] = useState<AcqEmailStatusFilter>(
    EMAIL_STATUS_FILTERS.some((f) => f.value === emailParam) ? emailParam : 'all'
  );
  const [niche, setNiche] = useState('cooking');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [inspectInput, setInspectInput] = useState('');
  const [showInspect, setShowInspect] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [discoveryJob, setDiscoveryJob] = useState<AcqEmailDiscoveryJob | null>(null);
  const [showResults, setShowResults] = useState(false);
  const tickRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (emailParam && emailParam !== emailFilter) {
      setEmailFilter(EMAIL_STATUS_FILTERS.some((f) => f.value === emailParam) ? emailParam : 'all');
    }
  }, [emailParam]);

  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearTimeout(tickRef.current);
    };
  }, []);

  const setFilter = (value: AcqWorkflowStatus | 'all') => {
    setWorkflowFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setSearchParams(next, { replace: true });
  };

  const setEmailStatus = (value: AcqEmailStatusFilter) => {
    setEmailFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'all') next.delete('email');
    else next.set('email', value);
    // Keep workflow in sync when picking email-centric chips
    if (value === 'all') {
      /* leave workflow */
    } else if (value === 'EMAIL_FOUND') {
      next.set('status', 'EMAIL_FOUND');
      setWorkflowFilter('EMAIL_FOUND');
    } else {
      next.set('status', value);
      setWorkflowFilter(value);
    }
    setSearchParams(next, { replace: true });
  };

  const emailScoped = useMemo(
    () => filterByEmailStatus(allItems, emailFilter, cooldownDays, Date.now(), sendingEnabled),
    [allItems, emailFilter, cooldownDays, sendingEnabled]
  );

  const items = useMemo(
    () =>
      emailFilter !== 'all'
        ? emailScoped
        : filterByWorkflowStatus(allItems, workflowFilter, cooldownDays, Date.now(), sendingEnabled),
    [allItems, emailFilter, emailScoped, workflowFilter, cooldownDays, sendingEnabled]
  );

  const counts = useMemo(
    () => countWorkflowStatuses(allItems, cooldownDays, Date.now(), sendingEnabled),
    [allItems, cooldownDays, sendingEnabled]
  );

  const emailCounts = useMemo(
    () => countEmailStatuses(allItems, cooldownDays, Date.now(), sendingEnabled),
    [allItems, cooldownDays, sendingEnabled]
  );

  const missingEmailCount = emailCounts.EMAIL_REQUIRED + emailCounts.NOT_FOUND;

  const drawer = drawerId ? allItems.find((x) => x.public.prospectId === drawerId) || null : null;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const ids = items.map((r) => r.public.prospectId);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const pollDiscovery = useCallback(
    async (jobId: string) => {
      try {
        let job = await adminApi.acqEmailDiscoveryJob(jobId);
        while (job.status === 'running') {
          setDiscoveryJob(job);
          job = await adminApi.acqEmailDiscoveryTick(jobId);
          setDiscoveryJob(job);
          await new Promise<void>((resolve) => {
            tickRef.current = window.setTimeout(() => resolve(), 400);
          });
        }
        setDiscoveryJob(job);
        setShowResults(true);
        setNote(
          job.dryRun
            ? `Dry-run complete: ${job.found} found, ${job.review} review, ${job.notFound} not found (no saves).`
            : `Discovery complete: ${job.found} found, ${job.review} review, ${job.notFound} not found.`
        );
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Email discovery failed');
      } finally {
        setDiscoveryBusy(false);
      }
    },
    [load]
  );

  const startDiscovery = async (mode: ConfirmMode) => {
    if (!mode) return;
    setConfirmMode(null);
    setDiscoveryBusy(true);
    setError('');
    setShowResults(false);
    try {
      const body =
        mode === 'selected'
          ? { prospectIds: [...selected], forceRetry: true }
          : mode === 'filtered'
            ? {
                filter:
                  emailFilter === 'REVIEW_EMAIL'
                    ? 'review_email'
                    : emailFilter === 'NOT_FOUND'
                      ? 'not_found'
                      : 'email_required',
                prospectIds:
                  emailFilter === 'all' && workflowFilter === 'EMAIL_REQUIRED'
                    ? undefined
                    : items
                        .filter((r) => {
                          const s = resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).status;
                          return s === 'EMAIL_REQUIRED' || s === 'NOT_FOUND' || s === 'REVIEW_EMAIL';
                        })
                        .map((r) => r.public.prospectId),
                forceRetry: emailFilter === 'NOT_FOUND' || emailFilter === 'REVIEW_EMAIL'
              }
            : { filter: 'email_required' };

      const job = await adminApi.acqEmailDiscoveryStart({
        campaign: 'COOK-001',
        dryRun: false,
        batchSize: 5,
        ...body
      });
      setDiscoveryJob(job);
      if (job.status === 'running') {
        void pollDiscovery(job.jobId);
      } else {
        setShowResults(true);
        setDiscoveryBusy(false);
        setNote(`Discovery finished immediately (${job.processed} processed).`);
        await load();
      }
    } catch (e) {
      setDiscoveryBusy(false);
      setError(e instanceof Error ? e.message : 'Failed to start email discovery');
    }
  };

  const confirmCount =
    confirmMode === 'selected'
      ? selected.size
      : confirmMode === 'filtered'
        ? items.filter((r) => {
            const s = resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).status;
            return s === 'EMAIL_REQUIRED' || s === 'NOT_FOUND' || s === 'REVIEW_EMAIL';
          }).length
        : missingEmailCount;

  const prepareDraftFor = async (id: string, row?: AcqAdminProspect) => {
    setBusy(true);
    setError('');
    try {
      let res = await adminApi.acqDraft(id);
      if (res.draftPrepared === false && row) {
        setNote('Evidence weak — re-inspecting channel, then retrying draft…');
        await adminApi.acqInspect({
          channelInput: row.public.handle || row.public.channelUrl,
          primaryNiche: row.public.primaryNiche || 'cooking',
          campaign: row.public.campaign || 'COOK-001',
          language: row.public.language || undefined,
          officialWebsite: row.public.officialWebsite || undefined,
          publicBusinessEmail: row.publicBusinessEmail || undefined,
          contactSourceUrl: row.public.contactSourceUrl || undefined,
          contactType:
            row.public.contactType && row.public.contactType !== 'none' ? row.public.contactType : 'business'
        });
        res = await adminApi.acqDraft(id);
      }
      if (res.draftPrepared === false) {
        setError(
          res.reason === 'weak_personalization'
            ? 'Still needs stronger channel evidence before a draft can be built.'
            : res.reason === 'missing_observation'
              ? 'No channel finding yet — re-inspect the channel first.'
              : `Draft not ready (${res.reason || 'unknown'}).`
        );
        setNote('');
      } else {
        setNote('Draft prepared.');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prepare draft failed');
    } finally {
      setBusy(false);
    }
  };

  const acceptReviewEmail = async (id: string, accept: boolean) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.acqEmailDiscoveryAccept(id, accept, accept ? undefined : 'admin rejected candidate');
      setNote(accept ? 'Email accepted.' : 'Candidate email rejected.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : accept ? 'Accept failed' : 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  const runPrimary = (id: string, action: AcqPrimaryAction, row: AcqAdminProspect) => {
    if (action === 'prepare_draft') {
      void prepareDraftFor(id, row);
      return;
    }
    if (action === 'find_email' || action === 'retry_email' || action === 'verify_email') {
      void (async () => {
        setBusy(true);
        setError('');
        setNote('Researching public contact…');
        try {
          const job = await adminApi.acqEmailDiscoveryStart({
            campaign: row.public.campaign || 'COOK-001',
            prospectIds: [id],
            forceRetry: true,
            batchSize: 1
          });
          let current = job;
          while (current.status === 'running') {
            current = await adminApi.acqEmailDiscoveryTick(current.jobId);
          }
          const hit = current.results[0];
          await load();
          if (hit?.outcome === 'found') setNote(`Email found: ${hit.email}`);
          else if (hit?.outcome === 'review') setNote(`Review candidate: ${hit.email}`);
          else setNote(hit?.detail || `Discovery: ${hit?.outcome || current.status}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Email research failed');
          setNote('');
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setDrawerId(id);
  };

  const remaining = discoveryJob
    ? Math.max(0, discoveryJob.prospectIds.length - discoveryJob.processed)
    : 0;
  const discoveryTotal = discoveryJob?.prospectIds.length ?? 0;
  const discoveryPct =
    discoveryTotal > 0 ? Math.min(100, Math.round((100 * (discoveryJob?.processed ?? 0)) / discoveryTotal)) : 0;

  return (
    <AdminShell title="Creators" subtitle="Master prospect database — all COOK-001 creators.">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <section className="ops-panel">
        <div className="acq-bulk-bar acq-bulk-bar-sticky">
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={discoveryBusy || missingEmailCount === 0}
            onClick={() => setConfirmMode('missing')}
          >
            Find Missing Emails ({missingEmailCount})
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={discoveryBusy || items.length === 0}
            onClick={() => setConfirmMode('filtered')}
          >
            Find Emails for Filtered
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={discoveryBusy || selected.size === 0}
            onClick={() => setConfirmMode('selected')}
          >
            Find Emails for Selected ({selected.size})
          </button>
        </div>

        {confirmMode && (
          <div className="acq-discovery-confirm" role="dialog" aria-modal="true">
            <h3>Find public business emails for {confirmCount} creators?</h3>
            <p className="ops-muted">
              This will research creators with EMAIL REQUIRED and automatically save high-confidence public
              business emails. Medium-confidence hits go to REVIEW EMAIL. Nothing is sent.
            </p>
            <div className="acq-drawer-primary-actions">
              <button type="button" className="ops-btn ops-btn-ghost" disabled={discoveryBusy} onClick={() => setConfirmMode(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ops-btn ops-btn-primary"
                disabled={discoveryBusy || confirmCount === 0}
                onClick={() => void startDiscovery(confirmMode)}
              >
                Start Discovery
              </button>
            </div>
          </div>
        )}

        {discoveryJob && (
          <div className="acq-discovery-progress">
            <div className="acq-discovery-progress-head">
              <strong>EMAIL DISCOVERY</strong>
              <span className="ops-muted">
                {discoveryJob.status} · {discoveryPct}%
              </span>
            </div>
            <p>
              {discoveryJob.processed} / {discoveryTotal} processed
            </p>
            <div
              className="acq-progress acq-discovery-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={discoveryPct}
              aria-label="Email discovery progress"
            >
              <div
                className={`acq-progress-fill${discoveryJob.status === 'running' ? ' acq-progress-fill-active' : ''}`}
                style={{ width: `${discoveryPct}%` }}
              />
            </div>
            <ul className="acq-discovery-stats">
              <li>
                Found <strong>{discoveryJob.found}</strong>
              </li>
              <li>
                Review <strong>{discoveryJob.review}</strong>
              </li>
              <li>
                Not found <strong>{discoveryJob.notFound}</strong>
              </li>
              <li>
                Remaining <strong>{remaining}</strong>
              </li>
            </ul>
            <button type="button" className="ops-btn ops-btn-ghost ops-btn-sm" onClick={() => setShowResults((v) => !v)}>
              {showResults ? 'Hide results' : 'View results'}
            </button>
            {showResults && discoveryJob.results.length > 0 && (
              <div className="acq-discovery-results">
                <table className="admin-crm-table">
                  <thead>
                    <tr>
                      <th>Handle</th>
                      <th>Outcome</th>
                      <th>Email</th>
                      <th>Confidence</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryJob.results.map((r) => (
                      <tr key={`${r.prospectId}-${r.outcome}-${r.email || ''}`}>
                        <td>{r.handle}</td>
                        <td>{r.outcome}</td>
                        <td>{r.email || '—'}</td>
                        <td>{(r.confidence || '—').toUpperCase()}</td>
                        <td>
                          {r.sourceUrl ? (
                            <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                              View source
                            </a>
                          ) : (
                            r.detail || '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="acq-toolbar">
          <label>
            Email status
            <select
              className="admin-crm-select"
              value={emailFilter}
              onChange={(e) => setEmailStatus(e.target.value as AcqEmailStatusFilter)}
            >
              {EMAIL_STATUS_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.value !== 'all' ? ` (${emailCounts[o.value]})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Workflow
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
                  <th className="acq-col-check">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && items.every((r) => selected.has(r.public.prospectId))}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible"
                    />
                  </th>
                  <th className="acq-col-creator">Creator</th>
                  <th>Audience</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Last contact</th>
                  <th className="acq-col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const p = row.public;
                  const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
                  const conf = (p.contactConfidence || '').toLowerCase();
                  return (
                    <tr
                      key={p.prospectId}
                      className={`acq-row${selected.has(p.prospectId) ? ' acq-row-selected' : ''}`}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(p.prospectId)}
                          onChange={() => toggleSelect(p.prospectId)}
                          aria-label={`Select ${p.channelName}`}
                        />
                      </td>
                      <td className="acq-col-creator">
                        <div className="acq-creator-name">{p.channelName}</div>
                        <div className="ops-muted">{p.handle}</div>
                      </td>
                      <td>{p.subscriberRange}</td>
                      <td className="acq-col-email">
                        {wf.status === 'REVIEW_EMAIL' && row.publicBusinessEmail ? (
                          <div>
                            <div>{row.publicBusinessEmail}</div>
                            <div className="ops-muted">REVIEW · {(conf || 'medium').toUpperCase()}</div>
                            {p.contactSourceUrl && (
                              <a href={p.contactSourceUrl} target="_blank" rel="noreferrer">
                                View source
                              </a>
                            )}
                          </div>
                        ) : wf.status === 'NOT_FOUND' ? (
                          <div className="ops-muted">EMAIL NOT FOUND</div>
                        ) : isVerifiedEmailRow(row) ? (
                          <div>
                            <div>{row.publicBusinessEmail}</div>
                            {conf && <div className="ops-muted">{conf.toUpperCase()} CONFIDENCE</div>}
                            {p.contactSourceUrl && (
                              <a href={p.contactSourceUrl} target="_blank" rel="noreferrer">
                                View source
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="ops-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                      </td>
                      <td className="admin-crm-nowrap">{formatDt(row.lastContactedAt)}</td>
                      <td className="acq-col-action">
                        {wf.status === 'REVIEW_EMAIL' ? (
                          <div className="acq-row-actions">
                            <button
                              type="button"
                              className="ops-btn ops-btn-primary ops-btn-sm"
                              disabled={busy}
                              onClick={() => void acceptReviewEmail(p.prospectId, true)}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              disabled={busy}
                              onClick={() => void acceptReviewEmail(p.prospectId, false)}
                            >
                              Reject
                            </button>
                            {p.contactSourceUrl && (
                              <a className="ops-btn ops-btn-ghost ops-btn-sm" href={p.contactSourceUrl} target="_blank" rel="noreferrer">
                                Source
                              </a>
                            )}
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              disabled={busy}
                              onClick={() => setDrawerId(p.prospectId)}
                            >
                              Open
                            </button>
                          </div>
                        ) : wf.status === 'READY_FOR_APPROVAL' ? (
                          <div className="acq-row-actions">
                            <button
                              type="button"
                              className="ops-btn ops-btn-primary ops-btn-sm"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Approve and send now to ${row.publicBusinessEmail || '(no email)'}?`
                                  )
                                ) {
                                  return;
                                }
                                void (async () => {
                                  setBusy(true);
                                  setError('');
                                  try {
                                    const res = await adminApi.acqApproveAndSend(p.prospectId);
                                    if (res.ok) setNote(`Approved and sent. Message ID: ${res.messageId || 'ok'}`);
                                    else setError(res.error || 'Approve & send failed');
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : 'Approve & send failed');
                                  } finally {
                                    setBusy(false);
                                  }
                                })();
                              }}
                            >
                              Approve &amp; Send
                            </button>
                            <button
                              type="button"
                              className="ops-btn ops-btn-ghost ops-btn-sm"
                              disabled={busy}
                              onClick={() => {
                                void (async () => {
                                  setBusy(true);
                                  setError('');
                                  try {
                                    const res = await adminApi.acqApprove([p.prospectId]);
                                    setNote(`Approval ${res.approvalId} stored.`);
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : 'Approve failed');
                                  } finally {
                                    setBusy(false);
                                  }
                                })();
                              }}
                            >
                              Approve
                            </button>
                          </div>
                        ) : wf.status === 'APPROVED' && wf.canSendNow ? (
                          <div className="acq-row-actions">
                            <button
                              type="button"
                              className="ops-btn ops-btn-primary ops-btn-sm"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Send now to ${row.publicBusinessEmail || '(no email)'}?`
                                  )
                                ) {
                                  return;
                                }
                                void (async () => {
                                  setBusy(true);
                                  setError('');
                                  try {
                                    const res = await adminApi.acqSendNow(p.prospectId);
                                    if (res.ok) setNote(`Sent. Message ID: ${res.messageId || 'ok'}`);
                                    else setError(res.error || 'Send failed');
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
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="ops-btn ops-btn-primary ops-btn-sm"
                            disabled={busy}
                            onClick={() => runPrimary(p.prospectId, wf.primaryAction, row)}
                          >
                            {wf.primaryActionLabel}
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

function isVerifiedEmailRow(row: AcqAdminProspect): boolean {
  const s = (row.public.contactStatus || '').toLowerCase();
  return (
    !!row.publicBusinessEmail &&
    (s === 'verified_public' || s === 'admin_attested' || row.adminAttestedContact === true)
  );
}
