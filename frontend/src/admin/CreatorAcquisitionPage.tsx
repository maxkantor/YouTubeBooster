import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';
import { AcqActionPanel } from './AcqActionPanel';
import {
  type AcqPrimaryAction,
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
  { value: 'REPLIED', label: 'Replies' },
  { value: 'OTHER', label: 'Other / draft incomplete' }
];

const APPROVALS_FILTERS: { value: AcqWorkflowStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Ready + Approved + Rejected' },
  { value: 'READY_FOR_APPROVAL', label: 'Ready for approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' }
];

const APPROVALS_ALL_STATUSES: AcqWorkflowStatus[] = ['READY_FOR_APPROVAL', 'APPROVED', 'REJECTED'];

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
    case 'REPLIED':
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
  const [workflowFilter, setWorkflowFilter] = useState<AcqWorkflowStatus | 'all' | 'NEED_EMAIL'>(
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
  const [emailManualMode, setEmailManualMode] = useState(false);
  const [manualAttested, setManualAttested] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  const [showInspect, setShowInspect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifySourceUrl, setVerifySourceUrl] = useState('');
  const [verifyContactType, setVerifyContactType] = useState('business');

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
          q: searchApplied || undefined
        })
      ]);
      setSummary(s);
      setAllItems(list.items || []);
      const enabled = s.marketingSendingEnabled ?? true;
      setSelected((cur) =>
        cur.filter((id) => {
          const row = (list.items || []).find((x) => x.public.prospectId === id);
          return row ? resolveAcqWorkflow(row, s.cooldownDays ?? 14, Date.now(), enabled).canSelectForApproval : false;
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
    () => countWorkflowStatuses(allItems, cooldownDays, Date.now(), sendingEnabled),
    [allItems, cooldownDays, sendingEnabled]
  );

  const items = useMemo(() => {
    const now = Date.now();
    let rows: AcqAdminProspect[];
    if (workflowFilter === 'NEED_EMAIL') {
      const needEmail = new Set<AcqWorkflowStatus>(['EMAIL_REQUIRED', 'EMAIL_VERIFICATION_REQUIRED']);
      rows = allItems.filter((r) => needEmail.has(resolveAcqWorkflow(r, cooldownDays, now, sendingEnabled).status));
    } else {
      rows = filterByWorkflowStatus(allItems, workflowFilter, cooldownDays, now, sendingEnabled);
    }
    if (view === 'approvals' && workflowFilter === 'all') {
      rows = rows.filter((r) =>
        APPROVALS_ALL_STATUSES.includes(resolveAcqWorkflow(r, cooldownDays, now, sendingEnabled).status)
      );
    }
    return rows;
  }, [allItems, workflowFilter, cooldownDays, sendingEnabled, view]);

  const readyCount = workflowCounts.READY_FOR_APPROVAL;
  const needEmailCount = workflowCounts.EMAIL_REQUIRED + workflowCounts.EMAIL_VERIFICATION_REQUIRED;
  const eligibleVisible = useMemo(
    () => items.filter((r) => resolveAcqWorkflow(r, cooldownDays, Date.now(), sendingEnabled).canSelectForApproval),
    [items, cooldownDays, sendingEnabled]
  );

  const drawer = useMemo(() => {
    if (!drawerId) return null;
    return allItems.find((x) => x.public.prospectId === drawerId) || null;
  }, [drawerId, allItems]);

  const drawerWorkflow = drawer ? resolveAcqWorkflow(drawer, cooldownDays, Date.now(), sendingEnabled) : null;

  useEffect(() => {
    if (!drawer) return;
    setEditSubject(drawer.public.subject || '');
    setEditBody(drawer.body || '');
  }, [drawerId, drawer?.public.subject, drawer?.body]);

  const dailyLimit = summary?.dailyLimit ?? 10;
  const sentToday = summary?.sentToday ?? summary?.emailsAttemptedToday ?? 0;
  const sentLifetime = summary?.sentLifetime ?? summary?.sent ?? 0;
  const sendPct = dailyLimit > 0 ? Math.min(100, Math.round((sentToday / dailyLimit) * 100)) : 0;

  const skipRows = useMemo(() => {
    const counts = summary?.skipReasonCounts || {};
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count, label: skipLabel(code) }));
  }, [summary]);

  const filtersActive = workflowFilter !== 'all' || !!niche || !!language || !!searchApplied;
  const showActionChips = view === 'home' || view === 'creators' || view === 'approvals';
  const statusFilterOptions = view === 'approvals' ? APPROVALS_FILTERS : WORKFLOW_FILTERS;

  const setFilter = (value: AcqWorkflowStatus | 'all' | 'NEED_EMAIL') => setWorkflowFilter(value);

  const clearFilters = () => {
    setWorkflowFilter(view === 'approvals' ? 'READY_FOR_APPROVAL' : 'all');
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

  const openReview = (id: string, openEmail = false, manual = false) => {
    setDrawerId(id);
    setEmailPanelOpen(openEmail);
    setEmailManualMode(manual);
    setManualAttested(false);
    const row = allItems.find((x) => x.public.prospectId === id);
    if (row) {
      setVerifyEmail(row.publicBusinessEmail || '');
      setVerifySourceUrl(row.public.contactSourceUrl || row.public.officialWebsite || '');
      setVerifyContactType(row.public.contactType && row.public.contactType !== 'none' ? row.public.contactType : 'business');
      setEditSubject(row.public.subject || '');
      setEditBody(row.body || '');
    }
  };

  const runPrimaryAction = (id: string, action: AcqPrimaryAction) => {
    switch (action) {
      case 'find_email':
      case 'verify_email':
        openReview(id, true, false);
        break;
      case 'approve':
      case 'send':
      case 'scheduled':
      case 'view':
      case 'view_thread':
      case 'reply':
      case 'review':
        openReview(id, false);
        break;
      case 'prepare_draft':
        void prepareDraft(id);
        break;
      case 'reconsider':
        void setStatus(id, 'draft_ready');
        break;
      default:
        openReview(id, false);
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
      setManualAttested(false);
      await load();
      setDrawerId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email verification failed');
    } finally {
      setBusy(false);
    }
  };

  const saveManualContact = async (prospect: AcqAdminProspect) => {
    if (!verifyEmail.trim() || !verifySourceUrl.trim()) {
      setError('Email and source URL are required.');
      return;
    }
    if (!manualAttested) {
      setError('Confirm this is a legitimate public/business contact before saving.');
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    try {
      await adminApi.acqManualContact(prospect.public.prospectId, {
        email: verifyEmail.trim(),
        sourceUrl: verifySourceUrl.trim(),
        attested: true,
        notes: 'Admin attested public/business contact'
      });
      try {
        await adminApi.acqDraft(prospect.public.prospectId);
      } catch {
        // optional
      }
      setNote('Manual contact saved with attestation.');
      setEmailPanelOpen(false);
      setManualAttested(false);
      setEmailManualMode(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Manual contact failed');
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
      return row ? resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled).canApprove : false;
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

  const rejectIds = async (ids: string[]) => {
    if (!ids.length) return;
    const reason = window.prompt('Rejection reason (optional):', '') ?? null;
    if (reason === null) return;
    if (!window.confirm(`Reject ${ids.length} selected creator(s)?`)) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      for (const id of ids) {
        await adminApi.acqReject(id, reason || undefined);
      }
      setNote(`Rejected ${ids.length} creator(s).`);
      setSelected([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    if (!window.confirm(`Change status to "${status}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.acqSetStatus(id, status);
      setNote(`Status set to ${status}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status change failed');
    } finally {
      setBusy(false);
    }
  };

  const researchEmail = async (prospect: AcqAdminProspect) => {
    setBusy(true);
    setError('');
    setNote('Researching...');
    try {
      await adminApi.acqInspect({
        channelInput: prospect.public.handle || prospect.public.channelUrl,
        primaryNiche: prospect.public.primaryNiche || niche || 'cooking',
        campaign: prospect.public.campaign || campaign || 'COOK-001',
        language: prospect.public.language || undefined,
        contactType: 'none'
      });
      setEmailManualMode(false);
      setEmailPanelOpen(true);
      setManualAttested(false);
      await load();
      setNote('Research complete — review or add contact below.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email research failed');
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  const pipeline = [
    { key: 'discovered', label: 'Discovered', value: summary?.cohortFunnel?.discovered ?? summary?.discovered ?? 0 },
    { key: 'contactable', label: 'Contactable', value: summary?.cohortFunnel?.contactable ?? summary?.contactVerified ?? 0 },
    { key: 'approved', label: 'Approved', value: summary?.cohortFunnel?.approved ?? summary?.approved ?? 0 },
    { key: 'sent', label: 'Sent lifetime', value: summary?.cohortFunnel?.emailsSent ?? sentLifetime },
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
              Sent today {sentToday} / {dailyLimit}
            </span>
            <span>Sent lifetime {sentLifetime}</span>
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
        <div className="acq-approval-meta">
          <span>
            Currently approved / waiting to send <strong>{workflowCounts.APPROVED}</strong>
          </span>
          {summary?.everApproved != null && (
            <span>
              Ever approved <strong>{summary.everApproved}</strong>
            </span>
          )}
          <span>
            Sent today <strong>{sentToday}</strong>
          </span>
          <span>
            Sent lifetime <strong>{sentLifetime}</strong>
          </span>
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
        {showActionChips && (
          <div className="acq-action-required-chips" aria-label="Action required filters">
            <span className="ops-kpi-label">ACTION REQUIRED</span>
            <div className="acq-workflow-counts">
              <button
                type="button"
                className={`acq-count-chip acq-count-chip-ready${workflowFilter === 'READY_FOR_APPROVAL' ? ' acq-count-chip-active' : ''}`}
                onClick={() => setFilter('READY_FOR_APPROVAL')}
              >
                Ready for Approval <strong>{readyCount}</strong>
              </button>
              <button
                type="button"
                className={`acq-count-chip${workflowFilter === 'APPROVED' ? ' acq-count-chip-active' : ''}`}
                onClick={() => setFilter('APPROVED')}
              >
                Approved / Ready to Send <strong>{workflowCounts.APPROVED}</strong>
              </button>
              <button
                type="button"
                className={`acq-count-chip${workflowFilter === 'NEED_EMAIL' ? ' acq-count-chip-active' : ''}`}
                onClick={() => setFilter('NEED_EMAIL')}
              >
                Need Email <strong>{needEmailCount}</strong>
              </button>
              <button
                type="button"
                className={`acq-count-chip${workflowFilter === 'COOLDOWN' ? ' acq-count-chip-active' : ''}`}
                onClick={() => setFilter('COOLDOWN')}
              >
                Cooldown <strong>{workflowCounts.COOLDOWN}</strong>
              </button>
              <button
                type="button"
                className={`acq-count-chip${workflowFilter === 'REPLIED' ? ' acq-count-chip-active' : ''}`}
                onClick={() => setFilter('REPLIED')}
              >
                Replies <strong>{workflowCounts.REPLIED}</strong>
              </button>
            </div>
          </div>
        )}

        <div className="acq-toolbar">
          <label>
            Status
            <select
              className="admin-crm-select"
              value={workflowFilter === 'NEED_EMAIL' ? 'EMAIL_REQUIRED' : workflowFilter}
              onChange={(e) => setFilter(e.target.value as AcqWorkflowStatus | 'all')}
            >
              {statusFilterOptions.map((o) => (
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
            <button
              type="button"
              className="ops-btn ops-btn-ghost"
              disabled={busy}
              onClick={() => void rejectIds(selected)}
            >
              Reject Selected
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
                  <th className="acq-col-creator">Creator</th>
                  <th>Audience</th>
                  <th>Email</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Last Contact</th>
                  <th className="acq-col-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const p = row.public;
                  const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
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
                      <td className="acq-col-creator">
                        <div className="acq-creator-name">{p.channelName}</div>
                        <div className="ops-muted">{p.handle}</div>
                      </td>
                      <td>{p.subscriberRange}</td>
                      <td className="acq-email-cell">{row.publicBusinessEmail || '—'}</td>
                      <td>{p.priorityScore}</td>
                      <td>
                        <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                        {wf.status === 'COOLDOWN' && wf.cooldownEndsAt && (
                          <div className="ops-muted acq-cooldown-hint">Until {formatDt(wf.cooldownEndsAt)}</div>
                        )}
                      </td>
                      <td className="admin-crm-nowrap">{formatDt(row.lastContactedAt || p.evidenceAt)}</td>
                      <td className="acq-col-action acq-actions">
                        <button
                          type="button"
                          className="ops-btn ops-btn-primary ops-btn-sm"
                          disabled={busy}
                          onClick={() => runPrimaryAction(p.prospectId, wf.primaryAction)}
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
                <strong>{sentLifetime}</strong>
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
                  {sentLifetime < 20
                    ? 'Not enough sends to calculate a reliable rate.'
                    : rateOrNa(summary.bounced ?? 0, sentLifetime)}
                </strong>
              </div>
              <div>
                <span>Complaint</span>
                <strong className="ops-muted">
                  {sentLifetime < 20
                    ? 'Not enough sends to calculate a reliable rate.'
                    : rateOrNa(summary.complained ?? 0, sentLifetime)}
                </strong>
              </div>
              <div>
                <span>Unsubscribe</span>
                <strong className="ops-muted">
                  {sentLifetime < 20
                    ? 'Not enough sends to calculate a reliable rate.'
                    : rateOrNa(summary.unsubscribed ?? 0, sentLifetime)}
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
                <strong>Current status</strong>
                <p>{drawerWorkflow.currentStatusAnswer}</p>
              </div>
              <div className="acq-decision-q">
                <strong>What should I do next?</strong>
                <p>{drawerWorkflow.nextStep}</p>
              </div>
              {drawerWorkflow.status === 'COOLDOWN' && drawerWorkflow.cooldownEndsAt && (
                <p className="ops-recon-warn">Cooldown until {formatDt(drawerWorkflow.cooldownEndsAt)}</p>
              )}

              <AcqActionPanel
                row={drawer}
                wf={drawerWorkflow}
                busy={busy}
                sendingEnabled={sendingEnabled}
                editSubject={editSubject}
                editBody={editBody}
                onEditSubject={setEditSubject}
                onEditBody={setEditBody}
                onApprove={() => void approveIds([drawer.public.prospectId])}
                onReject={() => {
                  const reason = window.prompt('Rejection reason (optional):', '');
                  if (reason === null) return;
                  void (async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await adminApi.acqReject(drawer.public.prospectId, reason || undefined);
                      setNote('Rejected.');
                      setDrawerId(null);
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Reject failed');
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                onUnapprove={() => {
                  if (!window.confirm('Unapprove this creator? They will leave the send queue.')) return;
                  void (async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await adminApi.acqUnapprove(drawer.public.prospectId);
                      setNote('Unapproved.');
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Unapprove failed');
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                onSendNow={() => {
                  const email = drawer.publicBusinessEmail || '(no email)';
                  const subject = editSubject || drawer.public.subject || '(no subject)';
                  if (!window.confirm(`Send now to ${email}?\n\nSubject: ${subject}`)) return;
                  void (async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const res = await adminApi.acqSendNow(drawer.public.prospectId);
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
                onSaveDraft={() => {
                  void (async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await adminApi.acqDraftEdit(drawer.public.prospectId, editSubject, editBody);
                      setNote('Draft saved.');
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Save draft failed');
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                onFindEmail={() => void researchEmail(drawer)}
                onAddEmail={() => {
                  setEmailManualMode(true);
                  setEmailPanelOpen(true);
                  setManualAttested(false);
                }}
                onPrepareDraft={() => void prepareDraft(drawer.public.prospectId)}
                onOverrideCooldown={() => {
                  if (
                    !window.confirm(
                      'Override cooldown? This allows contacting the creator before the cooldown ends. Use only when necessary.'
                    )
                  ) {
                    return;
                  }
                  void (async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await adminApi.acqOverrideCooldown(drawer.public.prospectId, 'admin override from drawer');
                      setNote('Cooldown overridden.');
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Override failed');
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                onStatusChange={(status) => void setStatus(drawer.public.prospectId, status)}
              />

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
                  <label className="acq-attest-check">
                    <input
                      type="checkbox"
                      checked={manualAttested}
                      onChange={(e) => setManualAttested(e.target.checked)}
                    />
                    This is a legitimate public/business contact
                  </label>
                  <button
                    type="button"
                    className="ops-btn ops-btn-primary"
                    disabled={busy || (emailManualMode && !manualAttested)}
                    onClick={() =>
                      void (emailManualMode ? saveManualContact(drawer) : verifyAndUpsertEmail(drawer))
                    }
                  >
                    {emailManualMode ? 'Save attested contact' : 'Save verified email'}
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
