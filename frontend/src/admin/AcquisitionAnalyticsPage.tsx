import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api';
import type { AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminShell';
import { rateOrNa, skipLabel } from './acqUiShared';

export function AcquisitionAnalyticsPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setSummary(await adminApi.acqSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sent = summary?.sentLifetime ?? summary?.sent ?? 0;
  const funnel = [
    { label: 'Discovered', value: summary?.discovered ?? 0 },
    { label: 'Needs approval', value: summary?.needsApproval ?? 0 },
    { label: 'Approved', value: summary?.approvedWaiting ?? summary?.approved ?? 0 },
    { label: 'Sent', value: sent },
    { label: 'Delivered', value: summary?.delivered ?? 0 },
    { label: 'Clicked', value: summary?.clicked ?? 0 },
    { label: 'Audit started', value: summary?.auditStarted ?? 0 },
    { label: 'Paid', value: summary?.converted ?? 0 }
  ];

  const skipRows = Object.entries(summary?.skipReasonCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <AdminShell title="Acquisition analytics" subtitle="Funnel and skip reasons — not a second CRM table.">
      {error && <p className="admin-crm-error">{error}</p>}

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Funnel</h2>
        </header>
        <div className="acq-pipeline">
          {funnel.map((p) => (
            <div key={p.label} className="acq-pipeline-card acq-pipeline-card-static">
              <span>{p.label}</span>
              <strong>{p.value}</strong>
            </div>
          ))}
        </div>
        <p className="ops-muted" style={{ marginTop: 12 }}>
          Click rate {rateOrNa(summary?.clicked ?? 0, sent)} · Conversion {rateOrNa(summary?.converted ?? 0, sent)}
        </p>
        <Link className="ops-btn ops-btn-ghost" to="/admin/acquisition/approvals?tab=needs">
          Open Approvals
        </Link>
      </section>

      <section className="ops-panel">
        <header className="ops-section-head">
          <h2>Skip reasons</h2>
        </header>
        {skipRows.length === 0 ? (
          <p className="ops-muted">No skip reasons recorded.</p>
        ) : (
          <div className="acq-skip-list">
            {skipRows.map(([code, count]) => (
              <div key={code} className="acq-skip-row">
                <span>{skipLabel(code)}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
