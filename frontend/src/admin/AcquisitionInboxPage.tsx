import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { Badge } from './AdminCrmComponents';
import { filterByWorkflowStatus, resolveAcqWorkflow } from './acqApprovalWorkflow';
import { formatDt, workflowBadgeKind } from './acqUiShared';

export function AcquisitionInboxPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [items, setItems] = useState<AcqAdminProspect[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, list] = await Promise.all([
        adminApi.acqSummary(),
        adminApi.acqProspects({ view: 'all', campaign: 'COOK-001' })
      ]);
      setSummary(s);
      setItems(list.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cooldownDays = summary?.cooldownDays ?? 14;
  const sendingEnabled = summary?.marketingSendingEnabled ?? true;
  const replies = useMemo(
    () => filterByWorkflowStatus(items, 'REPLIED', cooldownDays, Date.now(), sendingEnabled),
    [items, cooldownDays, sendingEnabled]
  );

  return (
    <AdminShell title="Inbox" subtitle="Creator replies that need a human response.">
      {error && <p className="admin-crm-error">{error}</p>}
      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Replies needing action</h2>
          <p className="ops-muted" style={{ margin: 0 }}>
            {summary?.repliesNeedingAction ?? replies.length} open · Open Support for full threads when linked.
          </p>
        </header>
        {replies.length === 0 ? (
          <div className="acq-empty">
            <h3>No replies waiting</h3>
            <p className="ops-muted">When creators reply to COOK-001, they appear here.</p>
          </div>
        ) : (
          <table className="admin-crm-table acq-table">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Status</th>
                <th>Last contact</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {replies.map((row) => {
                const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
                return (
                  <tr key={row.public.prospectId}>
                    <td>
                      <div className="acq-creator-name">{row.public.channelName}</div>
                      <div className="ops-muted">{row.publicBusinessEmail || row.public.handle}</div>
                    </td>
                    <td>
                      <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
                    </td>
                    <td>{formatDt(row.lastContactedAt)}</td>
                    <td>
                      {row.public.ticketId ? (
                        <Link
                          className="ops-btn ops-btn-ghost ops-btn-sm"
                          to={`/admin/contacts/${encodeURIComponent(row.public.ticketId)}`}
                        >
                          View Thread
                        </Link>
                      ) : (
                        <Link className="ops-btn ops-btn-ghost ops-btn-sm" to="/admin/contacts">
                          Open Support
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </AdminShell>
  );
}
