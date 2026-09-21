import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';
import {
  type AcqWorkflowStatus,
  countWorkflowStatuses,
  filterByWorkflowStatus,
  resolveAcqWorkflow,
  selectAllEligible,
  selectEligibleIds
} from './acqApprovalWorkflow';

function acquisitionViewFromPath(pathname: string): 'home' | 'approvals' | 'creators' | 'analytics' | 'campaigns' | 'inbox' {
  if (pathname.includes('/approvals')) return 'approvals';
  if (pathname.includes('/creators')) return 'creators';
  if (pathname.includes('/analytics')) return 'analytics';
  if (pathname.includes('/campaigns')) return 'campaigns';
  if (pathname.includes('/inbox')) return 'inbox';
  return 'home';
}

function whySelected(p: AcqAdminProspect['public']): string {
  const bits: string[] = [];
  if (p.recentUploadAt) bits.push('Active creator');
  if (p.subscriberRange && p.subscriberRange !== 'unknown') bits.push(`Audience ${p.subscriberRange}`);
  if (p.observation) bits.push(p.observation);
  if (p.contactStatus === 'verified_public') bits.push('Public business contact found');
  else if (!p.contactSourceUrl) bits.push('CONTACT NEEDED');
  return bits.join(' · ') || '—';
}

const WORKFLOW_FILTERS: { value: AcqWorkflowStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'EMAIL_REQUIRED', label: 'Email required' },
  { value: 'EMAIL_VERIFICATION_REQUIRED', label: 'Email verification required' },
  { value: 'READY_FOR_APPROVAL', label: 'Ready for approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'COOLDOWN', label: 'Cooldown' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SENT', label: 'Sent' },
  { value: 'OTHER', label: 'Other / draft incomplete' }
];

const SKIP_LABELS: Record<string, string> = {
  NOT_QUALIFIED: 'Not qualified',
  INVALID_EMAIL: 'No verified email',
  ALREADY_CONTACTED: 'Already contacted',
  NOT_APPROVED: 'Awaiting approval',
  DAILY_LIMIT_REACHED: 'Daily limit',
  COOLDOWN: 'Cooldown',
  SUPPRESSED: 'Suppressed',
  MISSING_CONFIG: 'Config / sending gate',
  SES_REJECTED: 'SES rejected',
  SES_ERROR: 'SES error'
};

function skipLabel(code: string) {
  return SKIP_LABELS[code] || code.replace(/_/g, ' ');
}

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function workflowBadgeKind(status: AcqWorkflowStatus): 'ok' | 'warn' | 'bad' | 'info' | 'neutral' {
  switch (status) {
    case 'READY_FOR_APPROVAL':
      return 'ok';
    case 'APPROVED':
    case 'SENT':
    case 'CONVERTED':
      return 'info';
    case 'EMAIL_REQUIRED':
    case 'EMAIL_VERIFICATION_REQUIRED':
    case 'COOLDOWN':
      return 'warn';
    case 'REJECTED':
      return 'bad';
    default:
      return 'neutral';
  }
}

function rateOrNa(numerator: number, denominator: number): string {
  if (denominator < 20) return 'Not enough sends to calculate a reliable rate.';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function CreatorAcquisitionPage() {
  useAdminCrm();
  const location = useLocation();
  const view = acquisitionViewFromPath(location.pathname);
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [allItems, setAllItems] = useState<AcqAdminProspect[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<AcqWorkflowStatus | 'all'>(
    view === 'approvals' ? 'READY_FOR_APPROVAL' : 'all'
  );
  const [niche, setNiche] = useState('cooking');
  const [campaign, setCampaign] = useState('COOK-001');
  const [language, setLanguage] = useState('');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  const [showInspect, setShowInspect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifySourceUrl, setVerifySourceUrl] = useState('');
  const [verifyContactType, setVerifyContactType] = useState('business');

  const cooldownDays = summary?.cooldownDays ?? 14;

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
          q: searchApplied || undefined
        })
      ]);
      setSummary(s);
      setAllItems(list.items || []);
      setSelected((cur) =>
        cur.filter((id) => {
          const row = (list.items || []).find((x) => x.public.prospectId === id);
          return row ? resolveAcqWorkflow(row, s.cooldownDays ?? 14).canSelectForApproval : false;
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load acquisition CRM');
    }
  }, [niche, campaign, language, searchApplied]);

  useEffect(() => {
    if (view === 'approvals') setWorkflowFilter('READY_FOR_APPROVAL');
    if (view === 'creators') setWorkflowFilter('all');
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  const workflowCounts = useMemo(
    () => countWorkflowStatuses(allItems, cooldownDays),
    [allItems, cooldownDays]
  );

  const items = useMemo(
    () => filterByWorkflowStatus(allItems, workflowFilter, cooldownDays),
    [allItems, workflowFilter, cooldownDays]
  );

  const readyCount = workflowCounts.READY_FOR_APPROVAL;
  const eligibleVisible = useMemo(
    () => items.filter((r) => resolveAcqWorkflow(r, cooldownDays).canSelectForApproval),
    [items, cooldownDays]
  );

  const drawer = useMemo(() => {
    if (!drawerId) return null;
    return allItems.find((x) => x.public.prospectId === drawerId) || null;
  }, [drawerId, allItems]);

  const drawerWorkflow = drawer ? resolveAcqWorkflow(drawer, cooldownDays) : null;

  const dailyLimit = summary?.dailyLimit ?? 10;
  const sentToday = summary?.sentToday ?? summary?.emailsAttemptedToday ?? 0;
  const sendPct = dailyLimit > 0 ? Math.min(100, Math.round((sentToday / dailyLimit) * 100)) : 0;

  const skipRows = useMemo(() => {
    const counts = summary?.skipReasonCounts || {};
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count, label: skipLabel(code) }));
  }, [summary]);

  const filtersActive = workflowFilter !== 'all' || !!niche || !!language || !!searchApplied;

  const clearFilters = () => {
    setWorkflowFilter('all');
    setNiche('');
    setLanguage('');
    setSearch('');
    setSearchApplied('');
  };

  const toggle = (id: string) => {
    setSelected((cur) => selectEligibleIds(allItems, cur, id, 25));
  };

  const selectAllVisibleEligible = () => {
    setSelected(selectAllEligible(items, 25));
  };

  const openReview = (id: string, openEmail = false) => {
    setDrawerId(id);
    setEmailPanelOpen(openEmail);
    const row = allItems.find((x) => x.public.prospectId === id);
    if (row) {
      setVerifyEmail(row.publicBusinessEmail || '');
      setVerifySourceUrl(row.public.contactSourceUrl || row.public.officialWebsite || '');
      setVerifyContactType(row.public.contactType && row.public.contactType !== 'none' ? row.public.contactType : 'business');
    }
  };

  const inspect = async () => {
    if (!inspectInput.trim()) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.acqInspect({
        channelInput: inspectInput.trim(),
        primaryNiche: niche || 'cooking',
        campaign: campaign || 'COOK-001',
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
  };

  const verifyAndUpsertEmail = async (prospect: AcqAdminProspect) => {
    if (!verifyEmail.trim() || !verifySourceUrl.trim()) {
      setError('Public email and source URL are required to verify.');
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    try {
      const updated = await adminApi.acqInspect({
        channelInput: prospect.public.handle || prospect.public.channelUrl,
        primaryNiche: prospect.public.primaryNiche || niche || 'cooking',
        campaign: prospect.public.campaign || campaign || 'COOK-001',
        language: prospect.public.language || undefined,
        officialWebsite: verifySourceUrl.trim(),
        publicBusinessEmail: verifyEmail.trim(),
        contactSourceUrl: verifySourceUrl.trim(),
        contactType: verifyContactType,
        notes: 'Admin verified public mailto'
      });
      const id = updated.public?.prospectId || prospect.public.prospectId;
      try {
        await adminApi.acqDraft(id);
      } catch {
        // Draft prep may fail if observation missing; approval still blocked until ready.
      }
      setNote('Contact saved. Refreshing workflow status…');
      setEmailPanelOpen(false);
      await load();
      setDrawerId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email verification failed');
    } finally {
      setBusy(false);
    }
  };

  const prepareDraft = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.acqDraft(id);
      setNote('Draft prepared.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prepare draft failed');
    } finally {
      setBusy(false);
    }
  };

  const approveIds = async (ids: string[]) => {
    if (!ids.length) return;
    const eligible = ids.filter((id) => {
      const row = allItems.find((x) => x.public.prospectId === id);
      return row ? resolveAcqWorkflow(row, cooldownDays).canApprove : false;
    });
    if (!eligible.length) {
      setError('No eligible creators selected for approval.');
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res = await adminApi.acqApprove(eligible, campaign);
      setNote(`Approval ${res.approvalId} stored. Scheduled sending still applies all existing send gates.`);
      setSelected([]);
      setDrawerId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const pipeline = [
    { key: 'discovered', label: 'Discovered', value: summary?.cohortFunnel?.discovered ?? summary?.discovered ?? 0 },
    { key: 'contactable', label: 'Contactable', value: summary?.cohortFunnel?.contactable ?? summary?.contactVerified ?? 0 },
    { key: 'approved', label: 'Approved', value: summary?.cohortFunnel?.approved ?? summary?.approved ?? 0 },
    { key: 'sent', label: 'Sent', value: summary?.cohortFunnel?.emailsSent ?? summary?.sentLifetime ?? summary?.sent ?? 0 },
    { key: 'clicked', label: 'Clicked', value: summary?.cohortFunnel?.clicked ?? summary?.clicked ?? 0 },
    { key: 'audit', label: 'Audit started', value: summary?.cohortFunnel?.auditStarts ?? summary?.auditStarted ?? 0 },
    { key: 'account', label: 'Account created', value: summary?.cohortFunnel?.accountsCreated ?? summary?.pricingViewed ?? 0 },
    { key: 'paid', label: 'Paid', value: summary?.cohortFunnel?.paid ?? summary?.converted ?? 0 }
  ];

  const northStar = [
    { label: 'Paid customers', value: summary?.northStar?.paidCustomers ?? summary?.converted ?? 0 },
    { label: 'Revenue', value: summary?.northStar?.revenue != null ? `$${summary.northStar.revenue}` : '—' },
    { label: 'Audits started', value: summary?.northStar?.auditsStarted ?? summary?.auditStarted ?? 0 },
    { label: 'Accounts created', value: summary?.northStar?.accountsCreated ?? summary?.pricingViewed ?? 0 }
  ];

  const pageTitle =
    view === 'approvals'
      ? 'Approvals'
      : view === 'creators'
        ? 'Creators'
        : view === 'analytics'
          ? 'Acquisition analytics'
          : view === 'campaigns'
            ? 'Campaigns'
            : view === 'inbox'
              ? 'Inbox'
              : 'Acquisition';
  const pageSubtitle =
    view === 'approvals'
      ? 'Daily work queue — review personalized drafts, then approve & send.'
      : 'Paid customers first. Pipeline metrics only explain where conversion fails.';

  const blocked =
    summary?.outreachBlocked ||
    (summary?.marketingSendingEnabled && (summary?.sendEligible ?? 0) === 0 && sentToday === 0);

  const allEligibleSelected =
    eligibleVisible.length > 0 && eligibleVisible.every((r) => selected.includes(r.public.prospectId));

  return (
    <AdminShell title={pageTitle} subtitle={pageSubtitle}>
      <div className="ops-page-head acq-campaign-head">
        <div className="acq-status-pills">
          <span className="acq-pill">
            Campaign
            <strong className="acq-dot acq-dot-ok"> COOK-001</strong>
          </span>
          <span className="acq-pill">
            Sending
            <strong className={summary?.marketingSendingEnabled ? 'acq-dot acq-dot-ok' : 'acq-dot acq-dot-bad'}>
              {summary?.marketingSendingEnabled ? ' ENABLED' : ' DISABLED'}
            </strong>
          </span>
          <span className="acq-pill">
            Daily limit
            <strong>
              {' '}
              {dailyLimit}/day
            </strong>
          </span>
          <span className="acq-pill">
            Initial send
            <strong className="acq-dot acq-dot-ok"> APPROVAL REQUIRED</strong>
          </span>
        </div>
      </div>

      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>North star</h2>
        </header>
        <div className="acq-pipeline">
          {northStar.map((p) => (
            <div key={p.label} className="acq-pipeline-card acq-pipeline-card-static">
              <span>{p.label}</span>
              <strong>{p.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Conversion funnel</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            From CRM prospect records — find the drop-off, not vanity discovery counts.
          </p>
        </header>
        <div className="acq-pipeline">
          {pipeline.map((p, i) => (
            <React.Fragment key={p.key}>
              {i > 0 && <div className="acq-pipeline-connector" aria-hidden />}
              <div className="acq-pipeline-card acq-pipeline-card-static">
                <span>{p.label}</span>
                <strong>{p.value}</strong>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className="acq-today-bar">
          <div className="acq-today-meta">
            <span>
              Today {sentToday} / {dailyLimit} sent
            </span>
            <span>{sendPct}%</span>
          </div>
          <div className="acq-progress" role="progressbar" aria-valuenow={sendPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="acq-progress-fill" style={{ width: `${sendPct}%` }} />
          </div>
        </div>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Approval workflow</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            Counts reflect creators that can actually take that next step.
          </p>
        </header>
        <div className="acq-workflow-counts">
          <button type="button" className="acq-count-chip" onClick={() => setWorkflowFilter('EMAIL_REQUIRED')}>
            Needs contact info <strong>{workflowCounts.EMAIL_REQUIRED}</strong>
          </button>
          <button type="button" className="acq-count-chip" onClick={() => setWorkflowFilter('EMAIL_VERIFICATION_REQUIRED')}>
            Needs email verification <strong>{workflowCounts.EMAIL_VERIFICATION_REQUIRED}</strong>
          </button>
          <button
            type="button"
            className="acq-count-chip acq-count-chip-ready"
            onClick={() => setWorkflowFilter('READY_FOR_APPROVAL')}
          >
            Ready for approval <strong>{readyCount}</strong>
          </button>
          <button type="button" className="acq-count-chip" onClick={() => setWorkflowFilter('APPROVED')}>
            Approved <strong>{workflowCounts.APPROVED}</strong>
          </button>
          <button type="button" className="acq-count-chip" onClick={() => setWorkflowFilter('COOLDOWN')}>
            Cooldown <strong>{workflowCounts.COOLDOWN}</strong>
          </button>
          <button type="button" className="acq-count-chip" onClick={() => setWorkflowFilter('REJECTED')}>
            Rejected <strong>{workflowCounts.REJECTED}</strong>
          </button>
        </div>
      </section>

      <section className={`ops-panel acq-blocker ${blocked ? 'acq-blocker-hot' : ''}`}>
        <header className="ops-section-head">
          <h2>{blocked ? 'Why aren’t we sending?' : 'Outreach status'}</h2>
        </header>
        {summary && (
          <>
            <div className="acq-blocker-hero">
              <div>
                <span className="ops-kpi-label">{blocked ? 'OUTREACH BLOCKED' : 'OUTREACH READY'}</span>
                <p className="ops-muted" style={{ margin: '6px 0 0' }}>
                  {summary.prospectsEvaluated ?? summary.discovered} prospects evaluated · {sentToday} emails attempted
                  today
                </p>
              </div>
              {summary.primaryBlocker && (
                <div className="acq-primary-blocker">
                  <span>Primary blocker</span>
                  <strong>
                    {summary.primaryBlocker.count} {summary.primaryBlocker.code}
                  </strong>
                </div>
              )}
            </div>
            {skipRows.length > 0 && (
              <div className="acq-skip-list">
                {skipRows.map((r) => (
                  <div key={r.code} className="acq-skip-row">
                    <span>{r.label}</span>
                    <strong>{r.count}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="acq-blocker-actions">
              <Link className="ops-btn ops-btn-ghost" to="/admin/diagnostics">
                Review qualification rules
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="ops-panel">
        <div className="acq-toolbar">
          <label>
            Status
            <select
              className="admin-crm-select"
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value as AcqWorkflowStatus | 'all')}
            >
              {WORKFLOW_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
          <label>
            Campaign
            <select className="admin-crm-select" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="COOK-001">COOK-001</option>
              <option value="OTHER-001">OTHER-001</option>
            </select>
          </label>
          <label>
            Language
            <select className="admin-crm-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">All</option>
              <option value="en">English</option>
              <option value="ru">Russian</option>
              <option value="uk">Ukrainian</option>
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
          <div className="acq-toolbar-actions">
            <button type="button" className="ops-btn ops-btn-ghost" onClick={() => setShowInspect((v) => !v)}>
              Inspect channel
            </button>
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              disabled={readyCount === 0}
              title={readyCount === 0 ? 'No creators currently ready for approval' : undefined}
              onClick={() => setWorkflowFilter('READY_FOR_APPROVAL')}
            >
              Review Ready for Approval ({readyCount})
            </button>
          </div>
          {readyCount === 0 && (
            <p className="ops-muted acq-ready-empty">No creators currently ready for approval</p>
          )}
        </div>

        {showInspect && (
          <div className="acq-inspect-row">
            <input
              className="admin-crm-input"
              placeholder="@handle or channel URL"
              value={inspectInput}
              onChange={(e) => setInspectInput(e.target.value)}
            />
            <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={() => void inspect()}>
              Inspect (no email)
            </button>
          </div>
        )}

        {selected.length > 0 && (
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
              onClick={() => void approveIds(selected)}
            >
              Approve &amp; Queue Selected
            </button>
          </div>
        )}

        <div className="admin-crm-table-wrap acq-table-wrap">
          {items.length === 0 ? (
            <div className="acq-empty">
              {allItems.length === 0 ? (
                <>
                  <h3>No prospects yet</h3>
                  <p className="ops-muted">Inspect a public channel to start the COOK-001 pipeline.</p>
                </>
              ) : (
                <>
                  <h3>No creators match these filters.</h3>
                  <button type="button" className="ops-btn ops-btn-primary" onClick={clearFilters}>
                    Clear filters
                  </button>
                  <p className="ops-muted" style={{ marginTop: 12 }}>
                    {allItems.length} prospects in current campaign filters · {readyCount} ready for approval.
                  </p>
                </>
              )}
            </div>
          ) : (
            <table className="admin-crm-table acq-table">
              <thead>
                <tr>
                  <th className="acq-col-check">
                    {eligibleVisible.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allEligibleSelected}
                        title="Select all eligible rows in this view"
                        aria-label="Select all eligible"
                        onChange={() => {
                          if (allEligibleSelected) setSelected([]);
                          else selectAllVisibleEligible();
                        }}
                      />
                    )}
                  </th>
                  <th>Creator</th>
                  <th>Channel</th>
                  <th>Subscribers</th>
                  <th>Language</th>
                  <th>Email</th>
                  <th>Qualification</th>
                  <th>Status</th>
                  <th>Last action</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const p = row.public;
                  const wf = resolveAcqWorkflow(row, cooldownDays);
                  const selectedRow = selected.includes(p.prospectId);
                  return (
                    <tr
                      key={p.prospectId}
                      className={`acq-row ${selectedRow ? 'acq-row-selected' : ''}`}
                    >
                      <td className="acq-col-check">
                        {wf.canSelectForApproval ? (
                          <input
                            type="checkbox"
                            checked={selectedRow}
                            aria-label={`Select ${p.channelName}`}
                            onChange={() => toggle(p.prospectId)}
                          />
                        ) : (
                          <span className="acq-check-placeholder" title={wf.checkboxDisabledReason || undefined} />
                        )}
                      </td>
                      <td>
                        <div className="acq-creator-name">{p.channelName}</div>
                        <div className="ops-muted">{p.handle}</div>
                      </td>
                      <td>
                        <a href={p.channelUrl} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </td>
                      <td>{p.subscriberRange}</td>
                      <td>{p.language || '—'}</td>
                      <td className="acq-email-cell">{row.publicBusinessEmail || '—'}</td>
                      <td>
                        <div>{p.priorityScore}</div>
                        <div className="ops-muted">{p.opportunityCategory.replace(/_/g, ' ')}</div>
                      </td>
                      <td>
                        <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                        {wf.status === 'COOLDOWN' && wf.cooldownEndsAt && (
                          <div className="ops-muted acq-cooldown-hint">Until {formatDt(wf.cooldownEndsAt)}</div>
                        )}
                      </td>
                      <td className="admin-crm-nowrap">{formatDt(row.lastContactedAt || p.evidenceAt)}</td>
                      <td className="acq-actions">
                        <button
                          type="button"
                          className="ops-btn ops-btn-ghost ops-btn-sm"
                          onClick={() => openReview(p.prospectId, false)}
                        >
                          {wf.status === 'APPROVED' || wf.status === 'SENT' || wf.status === 'COOLDOWN' ? 'View' : 'Review'}
                        </button>
                        {wf.primaryAction === 'find_email' && (
                          <button
                            type="button"
                            className="ops-btn ops-btn-primary ops-btn-sm"
                            onClick={() => openReview(p.prospectId, true)}
                          >
                            Find Email
                          </button>
                        )}
                        {wf.primaryAction === 'verify_email' && (
                          <button
                            type="button"
                            className="ops-btn ops-btn-primary ops-btn-sm"
                            onClick={() => openReview(p.prospectId, true)}
                          >
                            Verify Email
                          </button>
                        )}
                        {wf.canApprove && (
                          <button
                            type="button"
                            className="ops-btn ops-btn-primary ops-btn-sm"
                            disabled={busy}
                            onClick={() => void approveIds([p.prospectId])}
                          >
                            Approve &amp; Queue
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
        {filtersActive && items.length > 0 && (
          <p className="ops-muted">
            Showing {items.length} of {allItems.length} prospects
          </p>
        )}
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>COOK-001 Campaign Health</h2>
        </header>
        {summary && (
          <>
            <div className="acq-health-grid">
              <div>
                <span>Sending enabled</span>
                <strong className={summary.marketingSendingEnabled ? 'acq-ok' : 'acq-bad'}>
                  {summary.marketingSendingEnabled ? '✓' : '✗'}
                </strong>
              </div>
              <div>
                <span>SES configured</span>
                <strong className={summary.sesConfigured ? 'acq-ok' : 'acq-bad'}>{summary.sesConfigured ? '✓' : '✗'}</strong>
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
                <span>Sent lifetime</span>
                <strong>{summary.sentLifetime ?? summary.sent}</strong>
              </div>
              <div>
                <span>Delivered</span>
                <strong>{summary.delivered ?? 0}</strong>
              </div>
              <div>
                <span>Converted</span>
                <strong>{summary.converted ?? 0}</strong>
              </div>
            </div>
            <h3 className="acq-health-sub">Deliverability</h3>
            <div className="acq-health-grid">
              <div>
                <span>Bounce</span>
                <strong className="ops-muted">
                  {(summary.sentLifetime ?? summary.sent) < 20
                    ? 'Not enough sends to calculate a reliable rate.'
                    : rateOrNa(summary.bounced ?? 0, summary.sentLifetime ?? summary.sent)}
                </strong>
              </div>
              <div>
                <span>Complaint</span>
                <strong className="ops-muted">
                  {(summary.sentLifetime ?? summary.sent) < 20
                    ? 'Not enough sends to calculate a reliable rate.'
                    : rateOrNa(summary.complained ?? 0, summary.sentLifetime ?? summary.sent)}
                </strong>
              </div>
              <div>
                <span>Unsubscribe</span>
                <strong className="ops-muted">
                  {(summary.sentLifetime ?? summary.sent) < 20
                    ? 'Not enough sends to calculate a reliable rate.'
                    : rateOrNa(summary.unsubscribed ?? 0, summary.sentLifetime ?? summary.sent)}
                </strong>
              </div>
            </div>
          </>
        )}
      </section>

      {drawer && drawerWorkflow && (
        <div className="acq-drawer-backdrop" onClick={() => setDrawerId(null)} role="presentation">
          <aside className="acq-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Prospect detail">
            <header className="acq-drawer-head">
              <div>
                <h2>{drawer.public.channelName}</h2>
                <p className="ops-muted">{drawer.public.handle}</p>
              </div>
              <button type="button" className="ops-btn ops-btn-ghost" onClick={() => setDrawerId(null)}>
                Close
              </button>
            </header>

            <div className="acq-drawer-decision">
              <Badge kind={workflowBadgeKind(drawerWorkflow.status)}>{drawerWorkflow.label}</Badge>
              <div className="acq-decision-q">
                <strong>Why is this creator here?</strong>
                <p>{drawerWorkflow.whyHere}</p>
              </div>
              <div className="acq-decision-q">
                <strong>Can I approve them?</strong>
                <p>{drawerWorkflow.canApproveAnswer}</p>
              </div>
              <div className="acq-decision-q">
                <strong>What should I do next?</strong>
                <p>{drawerWorkflow.nextStep}</p>
              </div>
              {drawerWorkflow.status === 'COOLDOWN' && drawerWorkflow.cooldownEndsAt && (
                <p className="ops-recon-warn">Cooldown until {formatDt(drawerWorkflow.cooldownEndsAt)}</p>
              )}

              <div className="acq-drawer-primary-actions">
                {drawerWorkflow.canApprove && (
                  <button
                    type="button"
                    className="ops-btn ops-btn-primary"
                    disabled={busy}
                    onClick={() => void approveIds([drawer.public.prospectId])}
                  >
                    Approve &amp; Queue
                  </button>
                )}
                {(drawerWorkflow.primaryAction === 'find_email' ||
                  drawerWorkflow.primaryAction === 'verify_email' ||
                  emailPanelOpen) && (
                  <button
                    type="button"
                    className="ops-btn ops-btn-primary"
                    onClick={() => setEmailPanelOpen(true)}
                  >
                    {drawerWorkflow.primaryAction === 'find_email' ? 'Find / Verify Email' : 'Verify Email'}
                  </button>
                )}
                {drawerWorkflow.label === 'DRAFT INCOMPLETE' && (
                  <button
                    type="button"
                    className="ops-btn ops-btn-primary"
                    disabled={busy}
                    onClick={() => void prepareDraft(drawer.public.prospectId)}
                  >
                    Prepare draft
                  </button>
                )}
                <a className="ops-btn ops-btn-ghost" href={drawer.public.channelUrl} target="_blank" rel="noreferrer">
                  Open YouTube
                </a>
              </div>

              {emailPanelOpen && (
                <div className="acq-verify-panel">
                  <label>
                    Public email
                    <input
                      className="admin-crm-input"
                      value={verifyEmail}
                      onChange={(e) => setVerifyEmail(e.target.value)}
                      placeholder="hello@creator.com"
                    />
                  </label>
                  <label>
                    Source URL (official page with mailto)
                    <input
                      className="admin-crm-input"
                      value={verifySourceUrl}
                      onChange={(e) => setVerifySourceUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                  <label>
                    Contact type
                    <select
                      className="admin-crm-select"
                      value={verifyContactType}
                      onChange={(e) => setVerifyContactType(e.target.value)}
                    >
                      <option value="business">business</option>
                      <option value="partnership">partnership</option>
                      <option value="media">media</option>
                      <option value="general">general</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ops-btn ops-btn-primary"
                    disabled={busy}
                    onClick={() => void verifyAndUpsertEmail(drawer)}
                  >
                    Save verified email
                  </button>
                </div>
              )}
            </div>

            <div className="acq-drawer-body">
              <dl className="acq-dl">
                <div>
                  <dt>YouTube</dt>
                  <dd>
                    <a href={drawer.public.channelUrl} target="_blank" rel="noreferrer">
                      {drawer.public.handle || drawer.public.channelUrl}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Subscribers</dt>
                  <dd>{drawer.public.subscriberRange}</dd>
                </div>
                <div>
                  <dt>Acquisition score</dt>
                  <dd>
                    <strong>{drawer.public.acquisitionScore ?? drawer.public.priorityScore}</strong>
                    {drawer.public.scoreBreakdownJson ? (
                      <div className="ops-muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {drawer.public.scoreBreakdownJson}
                      </div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Why selected</dt>
                  <dd>{whySelected(drawer.public)}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{drawer.public.primaryNiche}</dd>
                </div>
                <div>
                  <dt>Language</dt>
                  <dd>{drawer.public.language || '—'}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{drawer.publicBusinessEmail || 'CONTACT NEEDED'}</dd>
                </div>
                <div>
                  <dt>Contact source</dt>
                  <dd>
                    {drawer.public.contactSourceUrl ? (
                      <a href={drawer.public.contactSourceUrl} target="_blank" rel="noreferrer">
                        {drawer.public.contactSourceUrl}
                      </a>
                    ) : (
                      '—'
                    )}
                    {drawer.public.contactResearchStatus ? (
                      <div className="ops-muted">{drawer.public.contactResearchStatus}</div>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Qualification</dt>
                  <dd>
                    Score {drawer.public.priorityScore} · {drawer.public.opportunityCategory.replace(/_/g, ' ')} ·{' '}
                    {drawer.public.contactStatus}
                  </dd>
                </div>
                <div>
                  <dt>Campaign</dt>
                  <dd>{drawer.public.campaign}</dd>
                </div>
                <div>
                  <dt>Personalized message</dt>
                  <dd>{drawer.public.subject || '—'}</dd>
                </div>
                <div>
                  <dt>Body</dt>
                  <dd className="acq-draft-body">{drawer.body || '—'}</dd>
                </div>
                <div>
                  <dt>Observation</dt>
                  <dd>{drawer.public.observation || '—'}</dd>
                </div>
                <div>
                  <dt>Suggested improvement</dt>
                  <dd>{drawer.public.suggestedImprovement || '—'}</dd>
                </div>
                <div>
                  <dt>Tracked audit path</dt>
                  <dd>
                    <code>{drawer.public.trackedPath || '—'}</code>
                  </dd>
                </div>
                <div>
                  <dt>Last contacted</dt>
                  <dd>{formatDt(drawer.lastContactedAt)}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
