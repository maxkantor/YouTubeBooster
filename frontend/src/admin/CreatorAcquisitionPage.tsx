import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api';
import type { AcqAdminProspect, AcqSummary } from '../types';
import { useAdminCrm } from './useAdminCrm';
import { AdminShell } from './AdminCrmApp';
import { Badge } from './AdminCrmComponents';

const VIEWS = [
  'discovered', 'needs_inspection', 'qualified', 'contact_verified', 'draft_ready',
  'approval_queue', 'approved', 'scheduled', 'sent', 'delivered', 'replied', 'interested',
  'audit_started', 'audit_completed', 'pricing_viewed', 'checkout_started', 'customer',
  'unsubscribed', 'bounced', 'complained', 'suppressed', 'rejected'
];

export function CreatorAcquisitionPage() {
  useAdminCrm();
  const [summary, setSummary] = useState<AcqSummary | null>(null);
  const [items, setItems] = useState<AcqAdminProspect[]>([]);
  const [view, setView] = useState('qualified');
  const [niche, setNiche] = useState('cooking');
  const [campaign, setCampaign] = useState('COOK-001');
  const [language, setLanguage] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [inspectInput, setInspectInput] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, list] = await Promise.all([
        adminApi.acqSummary(),
        adminApi.acqProspects({
          view: view === 'approval_queue' ? 'draft_ready' : view,
          niche: niche || undefined,
          campaign: campaign || undefined,
          language: language || undefined
        })
      ]);
      setSummary(s);
      setItems(list.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load acquisition CRM');
    }
  }, [view, niche, campaign, language]);

  useEffect(() => { void load(); }, [load]);

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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inspect failed');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const res = await adminApi.acqPreview(selected, campaign);
      setNote(res.sent ? 'Unexpected send' : `Preview only. ${res.items.length} recipients. Nothing sent.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const res = await adminApi.acqApprove(selected, campaign);
      setNote(`Approval ${res.approvalId} stored. Marketing sending is still disabled until SES identity + postal address + sending flag are set.`);
      setSelected([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const sendingOff = summary && !summary.marketingSendingEnabled;

  const filtered = useMemo(() => items, [items]);

  return (
    <AdminShell title="Creator acquisition">
      {error && <p className="admin-crm-error">{error}</p>}
      {note && <p className="admin-crm-muted">{note}</p>}
      <div className="admin-crm-panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>COOK-001 — Independent cooking creator mini-review</h2>
        <p className="admin-crm-muted">
          Customer #1 target. Verified external paying customers: <strong>{summary?.verifiedCustomers ?? 0}</strong>.
          Marketing sending: <Badge kind={sendingOff ? 'warn' : 'ok'}>{sendingOff ? 'disabled' : 'enabled'}</Badge>
          {' '}Preferred From: Max from YouTubeBooster &lt;hello@youtubeboosterai.com&gt;. Do not send until SES identity, MAIL FROM, postal address, and inbound receiving are configured.
        </p>
        {summary && (
          <p className="admin-crm-muted">
            Discovered {summary.discovered} · Inspected {summary.inspected} · Verified contacts {summary.contactVerified} ·
            Drafts {summary.drafts} · Approved {summary.approved} · Sent {summary.sent}
          </p>
        )}
      </div>

      <div className="admin-crm-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <select className="admin-crm-select" value={view} onChange={(e) => setView(e.target.value)}>
          {VIEWS.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="admin-crm-select" value={niche} onChange={(e) => setNiche(e.target.value)}>
          <option value="">All niches</option>
          <option value="cooking">Cooking</option>
          <option value="fitness">Fitness</option>
          <option value="travel">Travel</option>
          <option value="diy">DIY / home</option>
          <option value="education">Education</option>
          <option value="other">Other</option>
        </select>
        <select className="admin-crm-select" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="COOK-001">COOK-001</option>
          <option value="OTHER-001">OTHER-001</option>
        </select>
        <select className="admin-crm-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="ru">Russian</option>
          <option value="uk">Ukrainian</option>
        </select>
        <input
          className="admin-crm-input"
          placeholder="Inspect @handle or channel URL"
          value={inspectInput}
          onChange={(e) => setInspectInput(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <button type="button" className="admin-crm-btn" disabled={busy} onClick={() => void inspect()}>Inspect (no email)</button>
        <button type="button" className="admin-crm-btn" disabled={busy || !selected.length} onClick={() => void preview()}>Preview batch</button>
        <button type="button" className="admin-crm-btn admin-crm-btn-primary" disabled={busy || !selected.length} onClick={() => void approve()}>
          Approve selected ({selected.length}/25)
        </button>
      </div>

      <div className="admin-crm-panel">
        {filtered.length === 0 ? (
          <p className="admin-crm-empty">No prospects in this view. Inspect a public channel, or import the sanitized COOK-001 CSV via inspect. Sending stays off.</p>
        ) : (
          <table className="admin-crm-table">
            <thead>
              <tr>
                <th />
                <th>Channel</th>
                <th>Subs</th>
                <th>Score</th>
                <th>Contact</th>
                <th>Observation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const p = row.public;
                return (
                  <tr key={p.prospectId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.prospectId)}
                        onChange={() => toggle(p.prospectId)}
                        disabled={p.previewPlaceholder || p.contactStatus !== 'verified_public'}
                      />
                    </td>
                    <td>
                      <a href={p.channelUrl} target="_blank" rel="noreferrer">{p.channelName}</a>
                      <div className="admin-crm-muted">{p.handle} · {p.primaryNiche} · {p.language}</div>
                    </td>
                    <td>{p.subscriberRange}</td>
                    <td>{p.priorityScore}</td>
                    <td>
                      <div>{p.contactStatus}</div>
                      {p.contactSourceUrl && (
                        <a href={p.contactSourceUrl} target="_blank" rel="noreferrer">source</a>
                      )}
                      {row.publicBusinessEmail && (
                        <div className="admin-crm-muted">{row.publicBusinessEmail}</div>
                      )}
                    </td>
                    <td style={{ maxWidth: 360 }}>{p.observation || '—'}</td>
                    <td>{p.outreachStatus}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
