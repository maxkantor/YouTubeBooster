import React, { useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect } from '../types';
import { Badge } from './AdminCrmComponents';
import { AcqActionPanel } from './AcqActionPanel';
import { resolveAcqWorkflow } from './acqApprovalWorkflow';
import { formatDt, whySelected, workflowBadgeKind } from './acqUiShared';
import { draftPrepareErrorMessage } from './acqVisibleActions';

export function AcqProspectDrawer({
  row,
  cooldownDays,
  sendingEnabled,
  busy,
  setBusy,
  onClose,
  onReload,
  setError,
  setNote,
  showEmailPreview = false
}: {
  row: AcqAdminProspect;
  cooldownDays: number;
  sendingEnabled: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onClose: () => void;
  onReload: () => Promise<void>;
  setError: (v: string) => void;
  setNote: (v: string) => void;
  showEmailPreview?: boolean;
}) {
  const wf = resolveAcqWorkflow(row, cooldownDays, Date.now(), sendingEnabled);
  const [editSubject, setEditSubject] = useState(row.public.subject || '');
  const [editBody, setEditBody] = useState(row.body || '');
  const [emailPanelOpen, setEmailPanelOpen] = useState(false);
  const [emailManualMode, setEmailManualMode] = useState(false);
  const [manualAttested, setManualAttested] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(row.publicBusinessEmail || '');
  const [verifySourceUrl, setVerifySourceUrl] = useState(
    row.public.contactSourceUrl || row.public.officialWebsite || ''
  );
  const [verifyContactType, setVerifyContactType] = useState(
    row.public.contactType && row.public.contactType !== 'none' ? row.public.contactType : 'business'
  );
  const [drawerError, setDrawerError] = useState('');
  const [drawerNote, setDrawerNote] = useState('');

  const showError = (msg: string) => {
    setDrawerError(msg);
    setError(msg);
  };
  const showNote = (msg: string) => {
    setDrawerNote(msg);
    setNote(msg);
  };

  useEffect(() => {
    setEditSubject(row.public.subject || '');
    setEditBody(row.body || '');
    setVerifyEmail(row.publicBusinessEmail || '');
    setVerifySourceUrl(row.public.contactSourceUrl || row.public.officialWebsite || '');
    setDrawerError('');
    setDrawerNote('');
  }, [row.public.prospectId, row.public.subject, row.body, row.publicBusinessEmail]);

  return (
    <div className="acq-drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="acq-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Prospect detail">
        <header className="acq-drawer-head">
          <div>
            <h2>{row.public.channelName}</h2>
            <p className="ops-muted">{row.public.handle}</p>
          </div>
          <button type="button" className="ops-btn ops-btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="acq-drawer-decision">
          <div className="acq-drawer-status-row">
            <Badge kind={workflowBadgeKind(wf.status)}>{wf.label}</Badge>
            {wf.nextStep ? <span className="acq-drawer-status-hint ops-muted">{wf.nextStep}</span> : null}
          </div>

          {drawerError ? <p className="admin-crm-error">{drawerError}</p> : null}
          {drawerNote ? <p className="ops-muted">{drawerNote}</p> : null}

          <div className="acq-drawer-actions-sticky">
            <AcqActionPanel
              row={row}
              wf={wf}
              busy={busy}
              sendingEnabled={sendingEnabled}
              editSubject={editSubject}
              editBody={editBody}
              onEditSubject={setEditSubject}
              onEditBody={setEditBody}
              onApprove={() => {
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    const res = await adminApi.acqApprove([row.public.prospectId]);
                    showNote(`Approval ${res.approvalId} stored.`);
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Approve failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onApproveAndSend={() => {
                if (!window.confirm(`Approve and send now to ${row.publicBusinessEmail || '(no email)'}?`)) return;
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    const res = await adminApi.acqApproveAndSend(row.public.prospectId);
                    if (res.ok) showNote(`Approved and sent. Message ID: ${res.messageId || 'ok'}`);
                    else showError(res.error || 'Approve & send failed');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Approve & send failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onReject={() => {
                const reason = window.prompt('Rejection reason (optional):', '');
                if (reason === null) return;
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    await adminApi.acqReject(row.public.prospectId, reason || undefined);
                    showNote('Rejected.');
                    onClose();
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Reject failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onUnapprove={() => {
                if (!window.confirm('Unapprove this creator? They will leave the send queue.')) return;
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    await adminApi.acqUnapprove(row.public.prospectId);
                    showNote('Unapproved.');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Unapprove failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onSendNow={() => {
                if (wf.status === 'COOLDOWN') return;
                const email = row.publicBusinessEmail || '(no email)';
                const subject = editSubject || row.public.subject || '(no subject)';
                if (!window.confirm(`Send now to ${email}?\n\nSubject: ${subject}`)) return;
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    const res = await adminApi.acqSendNow(row.public.prospectId);
                    if (res.ok) showNote(`Sent. Message ID: ${res.messageId || 'ok'}`);
                    else showError(res.error || 'Send failed');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Send failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onSaveDraft={() => {
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    await adminApi.acqDraftEdit(row.public.prospectId, editSubject, editBody);
                    showNote('Draft saved.');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Save draft failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onFindEmail={() => {
                void (async () => {
                  setBusy(true);
                  showError('');
                  showNote('Researching public contact…');
                  try {
                    const job = await adminApi.acqEmailDiscoveryStart({
                      campaign: row.public.campaign || 'COOK-001',
                      prospectIds: [row.public.prospectId],
                      forceRetry: true,
                      batchSize: 1
                    });
                    let current = job;
                    while (current.status === 'running') {
                      current = await adminApi.acqEmailDiscoveryTick(current.jobId);
                    }
                    const hit = current.results[0];
                    setEmailManualMode(false);
                    setEmailPanelOpen(true);
                    await onReload();
                    if (hit?.outcome === 'found') {
                      showNote(`Email found (${(hit.confidence || 'high').toUpperCase()}): ${hit.email}`);
                    } else if (hit?.outcome === 'review') {
                      showNote(`Review candidate: ${hit.email}`);
                    } else {
                      showNote(hit?.detail || `Discovery: ${hit?.outcome || current.status}`);
                    }
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Email research failed');
                    showNote('');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onAcceptEmail={() => {
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    await adminApi.acqEmailDiscoveryAccept(row.public.prospectId, true);
                    showNote('Email accepted.');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Accept failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onRejectEmail={() => {
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    await adminApi.acqEmailDiscoveryAccept(row.public.prospectId, false, 'admin rejected candidate');
                    showNote('Candidate email rejected.');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Reject failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onAddEmail={() => {
                setEmailManualMode(true);
                setEmailPanelOpen(true);
                setManualAttested(false);
              }}
              onPrepareDraft={() => {
                void (async () => {
                  setBusy(true);
                  showError('');
                  showNote('Preparing draft…');
                  try {
                    const res = await adminApi.acqDraft(row.public.prospectId);
                    if (res.draftPrepared !== true) {
                      showError(draftPrepareErrorMessage(res.reason));
                      showNote('');
                    } else {
                      showNote('Draft prepared — ready for approval.');
                    }
                    await onReload();
                  } catch (e) {
                    showError(
                      e instanceof Error
                        ? `Could not prepare draft. Reason: ${e.message}`
                        : 'Could not prepare draft. Reason: Backend request failed.'
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
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
                  showError('');
                  try {
                    await adminApi.acqOverrideCooldown(row.public.prospectId, 'admin override from drawer');
                    showNote('Cooldown overridden.');
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Override failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              onStatusChange={(status) => {
                if (!window.confirm(`Change status to "${status}"?`)) return;
                void (async () => {
                  setBusy(true);
                  showError('');
                  try {
                    await adminApi.acqSetStatus(row.public.prospectId, status);
                    showNote(`Status set to ${status}.`);
                    await onReload();
                  } catch (e) {
                    showError(e instanceof Error ? e.message : 'Status change failed');
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
          </div>

          {(showEmailPreview || wf.status === 'READY_FOR_APPROVAL' || wf.status === 'APPROVED' || wf.status === 'NEEDS_REVIEW') && (
            <details className="acq-email-preview-details">
              <summary>EMAIL PREVIEW (click to expand)</summary>
              <div className="acq-email-preview">
                <span className="ops-kpi-label">EMAIL PREVIEW (exact recipient view)</span>
                <p>
                  <strong>From:</strong> {row.fromDisplay || 'YouTubeBooster AI'}
                </p>
                <p>
                  <strong>To:</strong> {row.publicBusinessEmail || '—'}
                </p>
                <p>
                  <strong>Subject:</strong> {editSubject || row.public.subject || '—'}
                </p>
                <p>
                  <strong>Primary finding:</strong> {row.public.observation || '—'}
                </p>
                <p>
                  <strong>Source data:</strong> {row.findingSource || '—'}
                </p>
                <p>
                  <strong>CTA destination:</strong>{' '}
                  {row.ctaDestination ? (
                    <a href={row.ctaDestination} target="_blank" rel="noreferrer">
                      {row.ctaDestination}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
                {row.htmlPreview ? (
                  <div className="acq-html-preview" dangerouslySetInnerHTML={{ __html: row.htmlPreview }} />
                ) : null}
                <span className="ops-kpi-label">PLAIN TEXT</span>
                <pre className="acq-draft-body">{row.textPreview || editBody || row.body || '—'}</pre>
              </div>
            </details>
          )}

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
                <input type="checkbox" checked={manualAttested} onChange={(e) => setManualAttested(e.target.checked)} />
                This is a legitimate public/business contact
              </label>
              <button
                type="button"
                className="ops-btn ops-btn-primary"
                disabled={busy || (emailManualMode && !manualAttested)}
                onClick={() => {
                  void (async () => {
                    if (!verifyEmail.trim() || !verifySourceUrl.trim()) {
                      showError('Public email and source URL are required.');
                      return;
                    }
                    if (emailManualMode && !manualAttested) {
                      showError('Confirm this is a legitimate public/business contact before saving.');
                      return;
                    }
                    setBusy(true);
                    showError('');
                    try {
                      if (emailManualMode) {
                        await adminApi.acqManualContact(row.public.prospectId, {
                          email: verifyEmail.trim(),
                          sourceUrl: verifySourceUrl.trim(),
                          attested: true,
                          notes: 'Admin attested public/business contact'
                        });
                      } else {
                        await adminApi.acqInspect({
                          channelInput: row.public.handle || row.public.channelUrl,
                          primaryNiche: row.public.primaryNiche || 'cooking',
                          campaign: row.public.campaign || 'COOK-001',
                          language: row.public.language || undefined,
                          officialWebsite: verifySourceUrl.trim(),
                          publicBusinessEmail: verifyEmail.trim(),
                          contactSourceUrl: verifySourceUrl.trim(),
                          contactType: verifyContactType,
                          notes: 'Admin verified public mailto'
                        });
                      }
                      try {
                        await adminApi.acqDraft(row.public.prospectId);
                      } catch {
                        /* optional */
                      }
                      showNote(emailManualMode ? 'Manual contact saved.' : 'Contact saved.');
                      setEmailPanelOpen(false);
                      await onReload();
                    } catch (e) {
                      showError(e instanceof Error ? e.message : 'Contact save failed');
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
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
                <a href={row.public.channelUrl} target="_blank" rel="noreferrer">
                  {row.public.handle || row.public.channelUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{row.public.subscriberRange}</dd>
            </div>
            <div>
              <dt>Why selected</dt>
              <dd>{whySelected(row.public)}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{row.publicBusinessEmail || 'CONTACT NEEDED'}</dd>
            </div>
            <div>
              <dt>Last contacted</dt>
              <dd>{formatDt(row.lastContactedAt)}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
