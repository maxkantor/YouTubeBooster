import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'draft_ready', label: 'Needs review / draft ready' },
  { value: 'approval_queue', label: 'Approval queue' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'contact_verified', label: 'Contact verified' },
  { value: 'discovered', label: 'Discovered' },
  { value: 'needs_inspection', label: 'Needs inspection' },
  { value: 'customer', label: 'Converted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suppressed', label: 'Suppressed' }
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

function statusBadge(row: AcqAdminProspect) {
  const p = row.public;
  const outreach = (p.outreachStatus || '').toLowerCase();
  if (outreach === 'customer') return <Badge kind="ok">CONVERTED</Badge>;
  if (outreach === 'sent' || outreach === 'delivered') return <Badge kind="info">{outreach.toUpperCase()}</Badge>;
  if (outreach === 'approved' || p.approvalStatus === 'approved') return <Badge kind="ok">APPROVED</Badge>;
  if (outreach === 'rejected') return <Badge kind="bad">SKIPPED</Badge>;
  if (p.subject && p.observation) return <Badge kind="warn">NEEDS REVIEW</Badge>;
  if (p.contactStatus === 'verified_public') return <Badge kind="info">VERIFIED</Badge>;
  if (p.priorityScore >= 50) return <Badge kind="info">QUALIFIED</Badge>;
  return <Badge kind="neutral">{outreach || 'DISCOVERED'}</Badge>;
}

function rateOrNa(numerator: number, denominator: number): string {
  if (denominator < 20) return 'Not enough sends to calculate a reliable rate.';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function CreatorAcquisitionPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [items, setItems] = useState<AcqAdminProspect[]>([]);
  const [totalAll, setTotalAll] = useState(0);
  const [view, setView] = useState('all');
  const [niche, setNiche] = useState('cooking');
  const [campaign, setCampaign] = useState('COOK-001');
  const [language, setLanguage] = useState('');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  const [showInspect, setShowInspect] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const apiView = view === 'approval_queue' ? 'draft_ready' : view;
      const [s, list, allCount] = await Promise.all([
        adminApi.acqSummary(),
        adminApi.acqProspects({
          view: apiView,
          niche: niche || undefined,
          campaign: campaign || undefined,
          language: language || undefined,
          q: searchApplied || undefined
        }),
        adminApi.acqProspects({ view: 'all', campaign: campaign || undefined })
      ]);
      setSummary(s);
      setItems(list.items || []);
      setTotalAll(allCount.totalCount || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load acquisition CRM');
    }
  }, [view, niche, campaign, language, searchApplied]);

  useEffect(() => {
    void load();
  }, [load]);

  const drawer = useMemo(
    () => (drawerId ? items.find((x) => x.public.prospectId === drawerId) || null : null),
    [drawerId, items]
  );

  const approvalQueueCount = summary?.views?.draft_ready ?? summary?.drafts ?? 0;
  const dailyLimit = summary?.dailyLimit ?? 10;
  const sentToday = summary?.sentToday ?? summary?.emailsAttemptedToday ?? 0;
  const sendPct = dailyLimit > 0 ? Math.min(100, Math.round((sentToday / dailyLimit) * 100)) : 0;

  const skipRows = useMemo(() => {
    const counts = summary?.skipReasonCounts || {};
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count, label: skipLabel(code) }));
  }, [summary]);

  const filtersActive = view !== 'all' || !!niche || !!language || !!searchApplied;

  const clearFilters = () => {
    setView('all');
    setNiche('');
    setLanguage('');
    setSearch('');
    setSearchApplied('');
  };

  const toggle = (id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 25 ? cur : [...cur, id]));
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

  const approveIds = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.acqApprove(ids, campaign);
      setNote(`Approval ${res.approvalId} stored. Weekday sender will only send approved verified contacts.`);
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
    { key: 'discovered', label: 'Discovered', value: summary?.discovered ?? 0 },
    { key: 'inspected', label: 'Inspected', value: summary?.inspected ?? 0 },
    { key: 'verified', label: 'Verified', value: summary?.contactVerified ?? 0 },
    { key: 'approved', label: 'Approved', value: summary?.approved ?? 0 },
    { key: 'sent', label: 'Sent', value: summary?.sentLifetime ?? summary?.sent ?? 0 },
    { key: 'converted', label: 'Converted', value: summary?.converted ?? 0 }
  ];

  const blocked =
    summary?.outreachBlocked ||
    (summary?.marketingSendingEnabled && (summary?.sendEligible ?? 0) === 0 && sentToday === 0);

  return (
    <AdminShell title="Creator Acquisition" subtitle="Find, qualify, approve and contact creators.">
      <div className="ops-page-head acq-campaign-head">
        <div className="acq-status-pills">
          <span className="acq-pill">
            Campaign status
            <strong className="acq-dot acq-dot-ok"> COOK-001 ACTIVE</strong>
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
        </div>
      </div>

      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="ops-muted">{note}</p>}

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Pipeline</h2>
        </header>
        <div className="acq-pipeline">
          {pipeline.map((p, i) => (
            <React.Fragment key={p.key}>
              {i > 0 && <div className="acq-pipeline-connector" aria-hidden />}
              <button
                type="button"
                className="acq-pipeline-card"
                onClick={() => {
                  if (p.key === 'discovered') setView('all');
                  else if (p.key === 'inspected') setView('needs_inspection');
                  else if (p.key === 'verified') setView('contact_verified');
                  else if (p.key === 'approved') setView('approved');
                  else if (p.key === 'sent') setView('sent');
                  else if (p.key === 'converted') setView('customer');
                }}
              >
                <span>{p.label}</span>
                <strong>{p.value}</strong>
              </button>
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
          {summary?.marketingSendingEnabled && sentToday === 0 && (summary.sendEligible ?? 0) === 0 && (
            <p className="ops-recon-warn">Sending is enabled but no emails can be sent right now — see blockers below.</p>
          )}
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
              <button
                type="button"
                className="ops-btn ops-btn-ghost"
                onClick={() => {
                  setView('needs_inspection');
                  setNiche(niche || 'cooking');
                }}
              >
                View rejected prospects
              </button>
              <Link className="ops-btn ops-btn-ghost" to="/admin/diagnostics">
                Review qualification rules
              </Link>
              {approvalQueueCount > 0 && (
                <>
                  <p className="ops-muted" style={{ margin: 0 }}>
                    {approvalQueueCount} creators are ready for review
                  </p>
                  <button
                    type="button"
                    className="ops-btn ops-btn-primary"
                    onClick={() => setView('approval_queue')}
                  >
                    Review creators
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section className="ops-panel">
        <div className="acq-toolbar">
          <label>
            Status
            <select className="admin-crm-select" value={view} onChange={(e) => setView(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
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
              onClick={() => setView('approval_queue')}
            >
              Review approval queue ({approvalQueueCount})
            </button>
          </div>
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
          <div className="acq-bulk-bar">
            <span>{selected.length} selected</span>
            <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={() => setSelected([])}>
              Clear
            </button>
            <button
              type="button"
              className="ops-btn ops-btn-primary"
              disabled={busy}
              onClick={() => void approveIds(selected)}
            >
              Approve selected ({selected.length}/25)
            </button>
          </div>
        )}

        <div className="admin-crm-table-wrap acq-table-wrap">
          {items.length === 0 ? (
            <div className="acq-empty">
              {totalAll === 0 ? (
                <>
                  <h3>No prospects yet</h3>
                  <p className="ops-muted">Inspect a public channel to start the COOK-001 pipeline.</p>
                </>
              ) : (
                <>
                  <h3>No prospects match these filters.</h3>
                  <button type="button" className="ops-btn ops-btn-primary" onClick={clearFilters}>
                    Clear filters
                  </button>
                  <p className="ops-muted" style={{ marginTop: 12 }}>
                    {totalAll} prospects exist across all statuses
                    {summary ? ` · ${summary.drafts} drafts` : ''}.
                  </p>
                  <button type="button" className="ops-btn ops-btn-ghost" onClick={() => setView('all')}>
                    View all prospects
                  </button>
                </>
              )}
            </div>
          ) : (
            <table className="admin-crm-table acq-table">
              <thead>
                <tr>
                  <th className="acq-col-check" />
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
                  const canApprove =
                    p.contactStatus === 'verified_public' && !p.previewPlaceholder && p.approvalStatus !== 'approved';
                  return (
                    <tr key={p.prospectId} className="acq-row" onClick={() => setDrawerId(p.prospectId)}>
                      <td className="acq-col-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(p.prospectId)}
                          disabled={!canApprove}
                          onChange={() => toggle(p.prospectId)}
                        />
                      </td>
                      <td>
                        <div className="acq-creator-name">{p.channelName}</div>
                        <div className="ops-muted">{p.handle}</div>
                      </td>
                      <td>
                        <a href={p.channelUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
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
                      <td>{statusBadge(row)}</td>
                      <td className="admin-crm-nowrap">{formatDt(row.lastContactedAt || p.evidenceAt)}</td>
                      <td className="acq-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="ops-btn ops-btn-ghost ops-btn-sm" onClick={() => setDrawerId(p.prospectId)}>
                          View
                        </button>
                        {canApprove && (
                          <button
                            type="button"
                            className="ops-btn ops-btn-primary ops-btn-sm"
                            disabled={busy}
                            onClick={() => void approveIds([p.prospectId])}
                          >
                            Approve
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
            Showing {items.length} of {totalAll} prospects
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
                <span>Clicked</span>
                <strong className="ops-muted">N/A</strong>
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

      {drawer && (
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
            <div className="acq-drawer-body">
              <dl className="acq-dl">
                <div>
                  <dt>YouTube</dt>
                  <dd>
                    <a href={drawer.public.channelUrl} target="_blank" rel="noreferrer">
                      {drawer.public.channelUrl}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Subscribers</dt>
                  <dd>{drawer.public.subscriberRange}</dd>
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
                  <dt>Public email</dt>
                  <dd>{drawer.publicBusinessEmail || '—'}</dd>
                </div>
                <div>
                  <dt>Email source</dt>
                  <dd>
                    {drawer.public.contactSourceUrl ? (
                      <a href={drawer.public.contactSourceUrl} target="_blank" rel="noreferrer">
                        {drawer.public.contactSourceUrl}
                      </a>
                    ) : (
                      '—'
                    )}
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
                  <dt>Draft subject</dt>
                  <dd>{drawer.public.subject || '—'}</dd>
                </div>
                <div>
                  <dt>Draft body</dt>
                  <dd className="acq-draft-body">{drawer.body || drawer.public.observation || '—'}</dd>
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
                  <dt>Last contacted</dt>
                  <dd>{formatDt(drawer.lastContactedAt)}</dd>
                </div>
              </dl>
            </div>
            <footer className="acq-drawer-actions">
              {drawer.public.contactStatus === 'verified_public' && drawer.public.approvalStatus !== 'approved' && (
                <button
                  type="button"
                  className="ops-btn ops-btn-primary"
                  disabled={busy}
                  onClick={() => void approveIds([drawer.public.prospectId])}
                >
                  Approve &amp; queue
                </button>
              )}
              <a className="ops-btn ops-btn-ghost" href={drawer.public.channelUrl} target="_blank" rel="noreferrer">
                Open YouTube
              </a>
            </footer>
          </aside>
        </div>
      )}
    </AdminShell>
  );
}
