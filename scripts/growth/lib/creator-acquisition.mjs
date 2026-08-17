const API = 'https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com/api/public/demo';

export function subscriberRange(subs) {
  if (subs < 1000) return 'under_1k';
  if (subs <= 100000) return '1k_100k';
  if (subs <= 350000) return '100k_350k';
  return 'over_350k';
}

export function csvEscape(value) {
  const v = value == null ? '' : String(value);
  if (/[",\n]/.test(v)) return `"${v.replaceAll('"', '""')}"`;
  return v;
}

export const CSV_HEADER =
  'prospect_id,channel_name,handle,channel_url,niche,subscriber_range,recent_upload_date,fit_score,opportunity_category,contact_source_url,contact_status,approval_status';

export function csvRow(row) {
  return [
    row.prospectId,
    row.channelName,
    row.handle,
    row.channelUrl,
    row.niche,
    row.subscriberRange,
    row.recentUploadDate || '',
    row.fitScore,
    row.opportunityCategory,
    row.contactSourceUrl || '',
    row.contactStatus,
    row.approvalStatus || 'none'
  ].map(csvEscape).join(',');
}

export function csvContainsEmail(text) {
  return /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i.test(text);
}

export function isPlaceholder(findings = []) {
  return findings.some((f) => String(f).includes('placeholders'));
}

export async function probeDemo(channelInput) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channelInput }),
    signal: AbortSignal.timeout(45000)
  });
  const json = JSON.parse(await res.text());
  if (!res.ok) return { channelInput, ok: false, error: json.error || res.status };
  return {
    channelInput,
    ok: true,
    preview: isPlaceholder(json.findings),
    title: json.channelTitle,
    handle: json.channelHandle,
    subs: Number(json.subscriberCount || 0),
    videoCount: Number(json.videoCount || 0),
    findings: json.findings || [],
    top: (json.topVideos || []).slice(0, 3).map((v) => v.title)
  };
}
