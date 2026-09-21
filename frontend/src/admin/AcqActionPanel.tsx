import React from 'react';
import type { AcqAdminProspect } from '../types';
import type { AcqWorkflowInfo } from './acqApprovalWorkflow';

export function AcqActionPanel({
  row,
  wf,
  busy,
  sendingEnabled,
  editSubject,
  editBody,
  onEditSubject,
  onEditBody,
  onApprove,
  onReject,
  onUnapprove,
  onSendNow,
  onSaveDraft,
  onFindEmail,
  onAddEmail,
  onPrepareDraft,
  onOverrideCooldown,
  onStatusChange
}: {
  row: AcqAdminProspect;
  wf: AcqWorkflowInfo;
  busy: boolean;
  sendingEnabled: boolean;
  editSubject: string;
  editBody: string;
  onEditSubject: (v: string) => void;
  onEditBody: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onUnapprove: () => void;
  onSendNow: () => void;
  onSaveDraft: () => void;
  onFindEmail: () => void;
  onAddEmail: () => void;
  onPrepareDraft: () => void;
  onOverrideCooldown: () => void;
  onStatusChange: (status: string) => void;
}) {
  const p = row.public;
  return (
    <div className="acq-action-panel">
      <div className="acq-action-meta">
        <div>
          <span className="ops-kpi-label">CURRENT STATUS</span>
          <strong>{wf.label}</strong>
        </div>
        <div>
          <span className="ops-kpi-label">NEXT ACTION</span>
          <p>{wf.nextStep}</p>
        </div>
        <div>
          <span className="ops-kpi-label">WHAT YOU CAN DO</span>
          <p>{wf.whatICanDo}</p>
        </div>
        {wf.status === 'APPROVED' && (
          <div className="acq-approved-meta">
            <p>
              <strong>APPROVED ✓</strong>
            </p>
            <p className="ops-muted">
              By {row.approvedBy || 'admin'} · {row.approvedAt ? new Date(row.approvedAt).toLocaleString() : '—'}
            </p>
            <p>
              {sendingEnabled ? (
                <strong>READY TO SEND NOW</strong>
              ) : (
                <span className="ops-muted">Sending disabled — enable campaign sending first</span>
              )}
            </p>
          </div>
        )}
        {wf.status === 'COOLDOWN' && wf.cooldownEndsAt && (
          <div className="acq-cooldown-meta">
            <p>
              <span className="ops-kpi-label">LAST CONTACT</span>{' '}
              {row.lastContactedAt ? new Date(row.lastContactedAt).toLocaleString() : '—'}
            </p>
            <p>
              <span className="ops-kpi-label">COOLDOWN ENDS</span> {new Date(wf.cooldownEndsAt).toLocaleString()}
            </p>
            <p className="ops-muted">NEXT ELIGIBLE ACTION — Automatic re-evaluation after cooldown</p>
          </div>
        )}
      </div>

      {(wf.status === 'READY_FOR_APPROVAL' || wf.status === 'APPROVED' || wf.status === 'OTHER') && (
        <div className="acq-message-edit">
          <label>
            Subject
            <input className="admin-crm-input" value={editSubject} onChange={(e) => onEditSubject(e.target.value)} />
          </label>
          <label>
            Body
            <textarea className="admin-crm-textarea" rows={8} value={editBody} onChange={(e) => onEditBody(e.target.value)} />
          </label>
        </div>
      )}

      <div className="acq-drawer-primary-actions">
        {wf.canApprove && (
          <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={onApprove}>
            Approve &amp; Queue
          </button>
        )}
        {wf.canSendNow && (
          <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={onSendNow}>
            Send Now
          </button>
        )}
        {wf.primaryAction === 'find_email' && (
          <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={onFindEmail}>
            Find Email
          </button>
        )}
        {(wf.primaryAction === 'find_email' || wf.primaryAction === 'verify_email') && (
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={onAddEmail}>
            Add Email Manually
          </button>
        )}
        {wf.primaryAction === 'verify_email' && (
          <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={onFindEmail}>
            Verify Email
          </button>
        )}
        {wf.primaryAction === 'prepare_draft' && (
          <button type="button" className="ops-btn ops-btn-primary" disabled={busy} onClick={onPrepareDraft}>
            Prepare Draft
          </button>
        )}
        {(wf.status === 'READY_FOR_APPROVAL' || wf.status === 'APPROVED' || wf.status === 'OTHER') && (
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={onSaveDraft}>
            Save Draft
          </button>
        )}
        {wf.canUnapprove && (
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={onUnapprove}>
            Unapprove
          </button>
        )}
        {wf.canOverrideCooldown && (
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={onOverrideCooldown}>
            Override Cooldown
          </button>
        )}
        {wf.canReject && (
          <button type="button" className="ops-btn ops-btn-ghost" disabled={busy} onClick={onReject}>
            Reject
          </button>
        )}
        {wf.primaryAction === 'reconsider' && (
          <button
            type="button"
            className="ops-btn ops-btn-primary"
            disabled={busy}
            onClick={() => onStatusChange('draft_ready')}
          >
            Reconsider
          </button>
        )}
        <a className="ops-btn ops-btn-ghost" href={p.channelUrl} target="_blank" rel="noreferrer">
          Open YouTube
        </a>
      </div>

      <div className="acq-status-change">
        <label>
          Change status
          <select
            className="admin-crm-select"
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = '';
              if (v) onStatusChange(v);
            }}
          >
            <option value="">Select…</option>
            <option value="discovered">discovered</option>
            <option value="contact_needed">contact_needed</option>
            <option value="draft_ready">draft_ready</option>
            <option value="rejected">rejected</option>
            <option value="not_qualified">not_qualified</option>
          </select>
        </label>
      </div>
    </div>
  );
}
