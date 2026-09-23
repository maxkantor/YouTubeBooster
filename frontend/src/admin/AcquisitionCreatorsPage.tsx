import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { draftPrepareErrorMessage, supportThreadPath } from './acqVisibleActions';
import {
  censusDiscovery,
  formatDiscoveryRetryEt,
  hoursUntil,
  isDiscoveryBackoff,
  outcomeLabel,
  parseBackoffUntil,
  summarizeDiscoveryJob
} from './acqEmailDiscoveryStats';
import {
  ACQ_CATEGORIES,
  ACQ_DEFAULT_CAMPAIGN,
  ACQ_DEFAULT_CATEGORY,
  ACQ_FORMATS,
  ACQ_LANGUAGES,
  ACQ_MARKETS,
  ACQ_TIERS,
  categoryLabel,
  formatLabel,
  languageLabel,
  marketLabel,
  tierLabel
} from './acqTaxonomy';

type ConfirmMode = 'missing' | 'filtered' | 'selected' | 'force_retry' | null;

export function AcquisitionCreatorsPage() {
  useAdminCrm();
  const navigate = useNavigate();
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
  const [niche, setNiche] = useState(searchParams.get('category') || ACQ_DEFAULT_CATEGORY);
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [market, setMarket] = useState(searchParams.get('market') || '');
  const [tier, setTier] = useState(searchParams.get('tier') || '');
  const [format, setFormat] = useState(searchParams.get('format') || '');
  const [campaign, setCampaign] = useState(searchParams.get('campaign') || ACQ_DEFAULT_CAMPAIGN);
  const [strategicOnly, setStrategicOnly] = useState(searchParams.get('strategic') === '1');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [findingEmailId, setFindingEmailId] = useState<string | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [draftBatch, setDraftBatch] = useState<{
    attempted: number;
    prepared: number;
    failed: number;
    skipped: number;
    results: { prospectId: string; handle: string; draftPrepared: boolean; reason?: string | null }[];
  } | null>(null);
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
          campaign: campaign || undefined,
          language: language || undefined,
          market: market || undefined,
          tier: tier || undefined,
          format: format || undefined,
          strategic: strategicOnly ? true : undefined,
          q: searchApplied || undefined
        })
      ]);
      setSummary(s);
      setAllItems(list.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load creators');
    }
  }, [niche, campaign, language, market, tier, format, strategicOnly, searchApplied]);

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

  const discoveryCensus = useMemo(
    () => censusDiscovery(allItems, cooldownDays, Date.now(), sendingEnabled),
    [allItems, cooldownDays, sendingEnabled]
  );
  const nextRetryLabel = formatDiscoveryRetryEt(discoveryCensus.earliestBackoffAt);
  const backoffSpreadHours = hoursUntil(discoveryCensus.latestBackoffAt);

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
        const tally = summarizeDiscoveryJob(job);
        setNote(
          job.dryRun
            ? `Dry-run complete: ${tally?.searched ?? 0} searched, ${job.found} found, ${job.review} review, ${job.notFound} not found, ${tally?.skippedBackoff ?? 0} skipped (backoff).`
            : `Discovery complete: ${tally?.searched ?? 0} searched, ${job.found} found, ${job.review} review, ${job.notFound} not found, ${tally?.skippedBackoff ?? 0} skipped (backoff).`
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
        mode === 'force_retry'
          ? { prospectIds: [...selected], forceRetry: true }
          : mode === 'selected'
            ? { prospectIds: [...selected], forceRetry: false }
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
                  forceRetry: false
                }
              : {
                  prospectIds: discoveryCensus.eligibleIds,
                  forceRetry: false
                };

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
        const tally = summarizeDiscoveryJob(job);
        setNote(
          `Discovery finished: ${tally?.evaluated ?? job.processed} candidates evaluated, ${tally?.searched ?? 0} searched, ${tally?.skippedBackoff ?? 0} skipped (backoff).`
        );
        await load();
      }
    } catch (e) {
      setDiscoveryBusy(false);
      setError(e instanceof Error ? e.message : 'Failed to start email discovery');
    }
  };

  const selectedBackoffCount = useMemo(
    () =>
      [...selected].filter((id) => {
        const row = allItems.find((r) => r.public.prospectId === id);
        return row ? isDiscoveryBackoff(row) : false;
      }).length,
    [selected, allItems]
  );

  const confirmCount =
    confirmMode === 'force_retry' || confirmMode === 'selected'
      ? selected.size
      : confirmMode === 'filtered'
        ? items.filter((r) => {
            const s = resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).status;
            return s === 'EMAIL_REQUIRED' || s === 'NOT_FOUND' || s === 'REVIEW_EMAIL';
          }).length
        : discoveryCensus.eligibleNow;

  const incompleteDraftRows = useMemo(
    () =>
      allItems.filter((r) => {
        const wf = resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled);
        return (
          !!r.publicBusinessEmail &&
          (wf.status === 'OTHER' || wf.status === 'NEEDS_REVIEW') &&
          (wf.primaryAction === 'prepare_draft' || wf.label === 'DRAFT INCOMPLETE')
        );
      }),
    [allItems, cooldownDays, sendingEnabled]
  );

  const prepareDraftFor = async (id: string, row?: AcqAdminProspect) => {
    setPreparingId(id);
    setBusy(true);
    setError('');
    setNote('Preparing draft…');
    try {
      const res = await adminApi.acqDraft(id);
      if (res.draftPrepared !== true) {
        setError(draftPrepareErrorMessage(res.reason));
        setNote('');
        await load();
        return;
      }
      setNote('Draft prepared — ready for approval.');
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not prepare draft. Reason: ${e.message}`
          : 'Could not prepare draft. Reason: Backend request failed.'
      );
      setNote('');
    } finally {
      setPreparingId(null);
      setBusy(false);
    }
  };

  const prepareDraftBatch = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    setNote(`Preparing drafts… 0 / ${ids.length}`);
    setDraftBatch(null);
    try {
      const res = await adminApi.acqPrepareDraftBatch({
        campaign: 'COOK-001',
        prospectIds: ids
      });
      setDraftBatch(res);
      const failBits = res.results
        .filter((r) => !r.draftPrepared)
        .slice(0, 5)
        .map((r) => `${r.handle}: ${r.reason || 'failed'}`);
      setNote(
        `Draft batch done: ${res.prepared} prepared, ${res.failed} failed, ${res.skipped} skipped.` +
          (failBits.length ? ` Failures — ${failBits.join('; ')}` : '')
      );
      if (res.failed > 0 && res.prepared === 0) {
        setError(`Could not prepare drafts. ${failBits[0] || 'See batch results.'}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk prepare drafts failed');
      setNote('');
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

  const openSupportThread = (row: AcqAdminProspect) => {
    const path = supportThreadPath(row);
    if (!path) {
      setError(
        'Could not open thread. Reason: No support ticket is linked to this outreach yet. Open Support from Inbox after a reply arrives, or re-send to create a ticket.'
      );
      setNote('');
      return;
    }
    setError('');
    navigate(path);
  };

  const findEmailFor = async (id: string, row: AcqAdminProspect) => {
    setFindingEmailId(id);
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
      let ticks = 0;
      while (current.status === 'running' && ticks < 40) {
        current = await adminApi.acqEmailDiscoveryTick(current.jobId);
        ticks += 1;
      }
      if (current.status === 'running') {
        setError('Could not find email. Reason: Discovery is still running — try again in a moment.');
        setNote('');
        await load();
        return;
      }
      const hit = current.results?.find((r) => r.prospectId === id) || current.results?.[0];
      await load();
      if (hit?.outcome === 'found') setNote(`Email found: ${hit.email}`);
      else if (hit?.outcome === 'review') setNote(`Review candidate: ${hit.email}`);
      else if (hit?.outcome === 'not_found') {
        setError(`Could not find email. Reason: ${hit.detail || 'No public business email found.'}`);
        setNote('');
      } else if (hit?.outcome === 'failed') {
        setError(`Could not find email. Reason: ${hit.detail || 'Discovery failed.'}`);
        setNote('');
      } else {
        setNote(hit?.detail || `Discovery: ${hit?.outcome || current.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? `Could not find email. Reason: ${e.message}` : 'Could not find email. Reason: Backend request failed.');
      setNote('');
    } finally {
      setFindingEmailId(null);
      setBusy(false);
    }
  };

  const runPrimary = (id: string, action: AcqPrimaryAction, row: AcqAdminProspect) => {
    if (action === 'prepare_draft') {
      void prepareDraftFor(id, row);
      return;
    }
    if (action === 'find_email' || action === 'retry_email' || action === 'verify_email') {
      void findEmailFor(id, row);
      return;
    }
    if (action === 'view_thread' || action === 'reply') {
      openSupportThread(row);
      return;
    }
    setDrawerId(id);
  };

  const discoveryTally = summarizeDiscoveryJob(discoveryJob);
  const remaining = discoveryTally?.remaining ?? 0;
  const discoveryTotal = discoveryTally?.candidates ?? 0;
  const discoveryPct =
    discoveryTotal > 0
      ? Math.min(100, Math.round((100 * (discoveryTally?.evaluated ?? 0)) / discoveryTotal))
      : 0;
  const lastResult = discoveryJob?.results?.[discoveryJob.results.length - 1];
  const lastWasSearch = lastResult
    ? !String(lastResult.outcome || '').toLowerCase().startsWith('skipped')
    : false;

  return (
    <AdminShell title="Creators" subtitle="Master prospect database — all COOK-001 creators.">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <section className="ops-panel">
        <div className="acq-scope-banner ops-muted" style={{ marginBottom: 12, fontSize: 13 }}>
          <strong>CURRENT SCOPE</strong>
          {' · '}
          Category: {niche ? categoryLabel(niche) : 'All'}
          {' · '}
          Language: {language ? languageLabel(language) : 'All'}
          {' · '}
          Market: {market ? marketLabel(market) : 'All'}
          {' · '}
          Tier: {tier ? tierLabel(tier) : 'All'}
          {' · '}
          Format: {format ? formatLabel(format) : 'All'}
          {' · '}
          Campaign: {campaign || 'All'}
          {strategicOnly ? ' · Strategic only' : ''}
          <div style={{ marginTop: 4 }}>
            Creators: <strong>{allItems.length}</strong>
            {' · '}
            Missing email: <strong>{discoveryCensus.missingEmail}</strong>
            {' · '}
            Eligible now: <strong>{discoveryCensus.eligibleNow}</strong>
            {' · '}
            Backoff: <strong>{discoveryCensus.inBackoff}</strong>
          </div>
        </div>
        <div className="acq-discovery-census ops-muted" style={{ marginBottom: 10, fontSize: 13 }}>
          Missing email <strong>{discoveryCensus.missingEmail}</strong>
          {' · '}
          Eligible now <strong>{discoveryCensus.eligibleNow}</strong>
          {' · '}
          In backoff <strong>{discoveryCensus.inBackoff}</strong>
          {' · '}
          Needs review <strong>{discoveryCensus.needsReview}</strong>
          {' · '}
          No email found <strong>{discoveryCensus.noEmailFound}</strong>
          {' · '}
          Already attempted <strong>{discoveryCensus.alreadyAttempted}</strong>
          {discoveryCensus.extraJobOnly > 0 && (
            <>
              {' · '}
              Backend job filter would also include {discoveryCensus.extraJobOnly} extra row
              {discoveryCensus.extraJobOnly === 1 ? '' : 's'} (review / unverified, not EMAIL REQUIRED or NOT FOUND)
            </>
          )}
        </div>
        <div className="acq-bulk-bar acq-bulk-bar-sticky">
          <div>
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              disabled={discoveryBusy || discoveryCensus.eligibleNow === 0}
              onClick={() => setConfirmMode('missing')}
              title={
                discoveryCensus.eligibleNow === 0
                  ? 'No creators are eligible for discovery now. Backoff is still active.'
                  : `Search ${discoveryCensus.eligibleNow} creators eligible now`
              }
            >
              Find Missing Emails ({discoveryCensus.missingEmail})
            </button>
            <div className="ops-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {discoveryCensus.eligibleNow === 0
                ? `No creators eligible for discovery now · ${discoveryCensus.inBackoff} in backoff`
                : `${discoveryCensus.eligibleNow} eligible now · ${discoveryCensus.inBackoff} in backoff`}
              {nextRetryLabel ? ` · Next retry ${nextRetryLabel}` : ''}
            </div>
          </div>
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
            disabled={discoveryBusy || busy || selected.size === 0}
            onClick={() => setConfirmMode('selected')}
          >
            Find Emails for Selected ({selected.size})
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={discoveryBusy || busy || selectedBackoffCount === 0}
            onClick={() => setConfirmMode('force_retry')}
          >
            Force Retry Selected ({selectedBackoffCount})
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy || selected.size === 0}
            onClick={() =>
              void prepareDraftBatch(
                [...selected].filter((id) => {
                  const row = allItems.find((r) => r.public.prospectId === id);
                  if (!row?.publicBusinessEmail) return false;
                  const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
                  return wf.primaryAction === 'prepare_draft' || wf.label === 'DRAFT INCOMPLETE';
                })
              )
            }
          >
            Prepare Drafts for Selected (
            {
              [...selected].filter((id) => {
                const row = allItems.find((r) => r.public.prospectId === id);
                if (!row?.publicBusinessEmail) return false;
                const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
                return wf.primaryAction === 'prepare_draft' || wf.label === 'DRAFT INCOMPLETE';
              }).length
            }
            )
          </button>
          <button
            type="button"
            className="ops-btn ops-btn-ghost"
            disabled={busy || incompleteDraftRows.length === 0}
            onClick={() => void prepareDraftBatch(incompleteDraftRows.map((r) => r.public.prospectId))}
          >
            Prepare All Incomplete Drafts ({incompleteDraftRows.length})
          </button>
        </div>

        {confirmMode && (
          <div className="acq-discovery-confirm" role="dialog" aria-modal="true">
            {confirmMode === 'force_retry' ? (
              <>
                <h3>These creators are currently in discovery backoff.</h3>
                <p className="ops-muted">
                  Retrying may repeat external lookups. Force retry {selectedBackoffCount} selected creator
                  {selectedBackoffCount === 1 ? '' : 's'}?
                </p>
              </>
            ) : (
              <>
                <h3>
                  Find public business emails for {confirmCount} creator{confirmCount === 1 ? '' : 's'}?
                </h3>
                <p className="ops-muted">
                  {confirmMode === 'missing' && (
                    <>
                      {discoveryCensus.missingEmail} missing emails · {discoveryCensus.eligibleNow} eligible now ·{' '}
                      {discoveryCensus.inBackoff} in backoff. Only eligible-now records will be searched. Backoff is
                      respected. Nothing is sent.
                    </>
                  )}
                  {confirmMode !== 'missing' && (
                    <>
                      High-confidence public business emails are saved automatically. Medium-confidence hits go to
                      REVIEW EMAIL. Records in backoff are skipped, not searched. Nothing is sent.
                    </>
                  )}
                </p>
              </>
            )}
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
                {confirmMode === 'force_retry' ? 'Force Retry' : 'Start Discovery'}
              </button>
            </div>
          </div>
        )}

        {discoveryJob && discoveryTally && (
          <div className="acq-discovery-progress">
            <div className="acq-discovery-progress-head">
              <strong>
                {discoveryJob.status === 'completed' ? 'EMAIL DISCOVERY COMPLETE' : 'EMAIL DISCOVERY'}
              </strong>
              <span className="ops-muted">
                {discoveryJob.status === 'completed' ? 'Candidate evaluation complete' : discoveryJob.status} ·{' '}
                {discoveryPct}%
              </span>
            </div>
            <p>
              {discoveryJob.status === 'running'
                ? `Evaluating creator ${discoveryTally.evaluated} / ${discoveryTally.candidates}`
                : `${discoveryTally.evaluated} / ${discoveryTally.candidates} candidate records evaluated`}
            </p>
            {discoveryJob.status === 'running' && lastWasSearch && (
              <p className="ops-muted">Searching public contact sources…</p>
            )}
            <div
              className="acq-progress acq-discovery-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={discoveryPct}
              aria-label="Candidate evaluation progress"
            >
              <div
                className={`acq-progress-fill${discoveryJob.status === 'running' ? ' acq-progress-fill-active' : ''}`}
                style={{ width: `${discoveryPct}%` }}
              />
            </div>
            <p className="ops-muted" style={{ marginTop: 8 }}>
              Actual discovery attempts: <strong>{discoveryTally.searched}</strong>
              {discoveryJob.status === 'completed' && discoveryTally.searched === 0 && discoveryTally.evaluated > 0
                ? ' — no public-source lookups ran; records were skipped.'
                : ''}
            </p>
            <ul className="acq-discovery-stats">
              <li>
                Found <strong>{discoveryTally.found}</strong>
              </li>
              <li>
                Needs review <strong>{discoveryTally.review}</strong>
              </li>
              <li>
                Not found <strong>{discoveryTally.notFound}</strong>
              </li>
              <li>
                Skipped — backoff <strong>{discoveryTally.skippedBackoff}</strong>
              </li>
              <li>
                Skipped — other <strong>{discoveryTally.skippedOther}</strong>
              </li>
              <li>
                Remaining <strong>{remaining}</strong>
              </li>
            </ul>
            {discoveryJob.status === 'completed' && (
              <p className="ops-muted">
                {discoveryTally.candidates} candidate records evaluated · {discoveryTally.searched} actual discovery
                attempts · {discoveryTally.found} emails found · {discoveryTally.review} need review ·{' '}
                {discoveryTally.notFound} confirmed not found · {discoveryTally.skippedBackoff} skipped due to backoff
                {nextRetryLabel ? `. Next eligible retry: ${nextRetryLabel}` : '.'}
                {discoveryCensus.inBackoff > 1 && backoffSpreadHours
                  ? ` ${discoveryCensus.inBackoff} records become eligible over the next ${backoffSpreadHours} hours.`
                  : ''}
              </p>
            )}
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
                      <th>Retry after</th>
                      <th>Email</th>
                      <th>Confidence</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryJob.results.map((r) => {
                      const retry =
                        parseBackoffUntil(r.detail) ||
                        formatDiscoveryRetryEt(
                          allItems.find((x) => x.public.prospectId === r.prospectId)?.public.contactResearchNextAt
                        );
                      return (
                        <tr key={`${r.prospectId}-${r.outcome}-${r.email || ''}`}>
                          <td>{r.handle}</td>
                          <td>{outcomeLabel(r.outcome)}</td>
                          <td>{r.outcome === 'skipped_backoff' ? retry || '—' : '—'}</td>
                          <td>{r.email || '—'}</td>
                          <td>{(r.confidence || '—').toUpperCase()}</td>
                          <td>
                            {r.sourceUrl ? (
                              <a href={r.sourceUrl} target="_blank" rel="noreferrer">
                                View source
                              </a>
                            ) : (
                              r.detail && r.outcome !== 'skipped_backoff' ? r.detail : '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
              <option value="">All categories</option>
              {ACQ_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select className="admin-crm-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">All</option>
              {ACQ_LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Market
            <select className="admin-crm-select" value={market} onChange={(e) => setMarket(e.target.value)}>
              {ACQ_MARKETS.map((m) => (
                <option key={m.id || 'all'} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Audience tier
            <select className="admin-crm-select" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="">All</option>
              {ACQ_TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select className="admin-crm-select" value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="">All</option>
              {ACQ_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Campaign
            <select className="admin-crm-select" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value={ACQ_DEFAULT_CAMPAIGN}>{ACQ_DEFAULT_CAMPAIGN}</option>
              <option value="">All campaigns</option>
            </select>
          </label>
          <label className="ops-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={strategicOnly} onChange={(e) => setStrategicOnly(e.target.checked)} />
            Strategic only
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
                      primaryNiche: niche || ACQ_DEFAULT_CATEGORY,
                      campaign: campaign || ACQ_DEFAULT_CAMPAIGN,
                      language: language || undefined,
                      market: market || undefined,
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
                  <th>Lang / market</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Campaign</th>
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
                        {p.channelUrl && (
                          <a href={p.channelUrl} target="_blank" rel="noreferrer" className="ops-muted">
                            Channel
                          </a>
                        )}
                      </td>
                      <td>
                        {p.subscriberRange}
                        <div className="ops-muted" style={{ fontSize: 12 }}>
                          {tierLabel(p.creatorTier)}
                          {p.contentFormat && p.contentFormat !== 'unknown' ? ` · ${formatLabel(p.contentFormat)}` : ''}
                          {p.strategic ? ' · STRATEGIC' : ''}
                        </div>
                      </td>
                      <td className="ops-muted">
                        {languageLabel(p.language)}
                        <div>{marketLabel(p.market || p.country)}</div>
                      </td>
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
                            <div className="ops-muted">
                              {[conf ? `${conf.toUpperCase()} CONFIDENCE` : null, 'VERIFIED']
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            {p.contactSourceUrl && (
                              <a href={p.contactSourceUrl} target="_blank" rel="noreferrer">
                                View source
                              </a>
                            )}
                          </div>
                        ) : row.publicBusinessEmail ? (
                          <div>
                            <div>{row.publicBusinessEmail}</div>
                            <div className="ops-muted">UNVERIFIED</div>
                          </div>
                        ) : (
                          <span className="ops-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                        <div className="ops-muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {(p.outreachStatus || '—').toLowerCase()}
                        </div>
                      </td>
                      <td className="ops-muted">{p.campaign || '—'}</td>
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
                            disabled={busy || preparingId === p.prospectId || findingEmailId === p.prospectId}
                            onClick={() => runPrimary(p.prospectId, wf.primaryAction, row)}
                          >
                            {preparingId === p.prospectId && wf.primaryAction === 'prepare_draft'
                              ? 'Preparing…'
                              : findingEmailId === p.prospectId &&
                                  (wf.primaryAction === 'find_email' ||
                                    wf.primaryAction === 'retry_email' ||
                                    wf.primaryAction === 'verify_email')
                                ? 'Finding…'
                                : wf.primaryActionLabel}
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
