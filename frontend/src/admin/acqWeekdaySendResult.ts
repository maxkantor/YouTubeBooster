export type AcqWeekdaySendApiResult = {
  marketingSendingEnabled?: boolean;
  attempted?: number;
  sent?: number;
  skipped?: number;
  reasons?: string[];
  reasonCounts?: Record<string, number>;
  dailyLimit?: number;
  evaluated?: number;
  sesAttempted?: number;
  rampBlockReason?: string | null;
};

export type AcqWeekdaySendContext = {
  approvedWaiting?: number;
  eligibleNow?: number;
  needsApproval?: number;
};

export type AcqWeekdaySendView = {
  sent: number;
  skipped: number;
  evaluated: number;
  attempted: number;
  headline: string;
  explanation: string;
  skipLines: string[];
  openApprovals: boolean;
};

const SKIP_LABELS: Record<string, string> = {
  NOT_APPROVED: 'Not approved',
  COOLDOWN: 'In cooldown',
  ALREADY_CONTACTED: 'Already contacted',
  INVALID_EMAIL: 'Invalid email',
  SUPPRESSED: 'Suppressed',
  DAILY_LIMIT_REACHED: 'Daily limit reached',
  STRATEGIC_MANUAL: 'Strategic (manual only)',
  NOT_QUALIFIED: 'Not qualified',
  MISSING_CONFIG: 'Missing config',
  SES_REJECTED: 'SES rejected',
  SES_ERROR: 'SES error'
};

function labelForSkip(code: string): string {
  return SKIP_LABELS[code] || code.replace(/_/g, ' ').toLowerCase();
}

export function tallySkipReasons(res: AcqWeekdaySendApiResult): Array<{ code: string; count: number }> {
  const fromCounts = res.reasonCounts;
  if (fromCounts && Object.keys(fromCounts).length > 0) {
    return Object.entries(fromCounts)
      .map(([code, count]) => ({ code, count: Number(count) || 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }

  const tallied = new Map<string, number>();
  for (const line of res.reasons ?? []) {
    const raw = String(line || '');
    const sesIdx = raw.toLowerCase().indexOf(':ses:');
    const codePart =
      sesIdx >= 0 ? raw.slice(sesIdx + 1) : raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw;
    const code = (codePart || 'NOT_QUALIFIED').trim().toUpperCase().replace(/\s+/g, '_');
    tallied.set(code, (tallied.get(code) ?? 0) + 1);
  }
  return [...tallied.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function explainWeekdaySendResult(
  res: AcqWeekdaySendApiResult,
  ctx: AcqWeekdaySendContext = {}
): AcqWeekdaySendView {
  const sent = res.sent ?? 0;
  const skipped = res.skipped ?? 0;
  const attempted = res.attempted ?? res.sesAttempted ?? 0;
  const evaluated = res.evaluated ?? skipped + attempted;
  const skips = tallySkipReasons(res);
  const skipLines = skips.map((row) => `${labelForSkip(row.code)}: ${row.count}`);
  const top = skips[0]?.code ?? '';
  const approvedWaiting = ctx.approvedWaiting ?? 0;
  const eligibleNow = ctx.eligibleNow ?? 0;
  const needsApproval = ctx.needsApproval ?? 0;
  const emptyReady = eligibleNow <= 0 && approvedWaiting <= 0;
  const notApproved = top === 'NOT_APPROVED' || emptyReady;

  if (sent > 0) {
    return {
      sent,
      skipped,
      evaluated,
      attempted,
      headline: `Sent ${sent} · skipped ${skipped}`,
      explanation:
        skipped > 0
          ? 'Weekday send finished. Remaining skips used the same gates as the 8:00 AM ET job.'
          : 'Weekday send finished.',
      skipLines,
      openApprovals: false
    };
  }

  if (res.marketingSendingEnabled === false) {
    return {
      sent,
      skipped,
      evaluated,
      attempted,
      headline: 'Sending is paused — 0 sent',
      explanation: 'COOK-001 sending is off. Enable sending, then run again.',
      skipLines,
      openApprovals: false
    };
  }

  if (top === 'DAILY_LIMIT_REACHED') {
    return {
      sent,
      skipped,
      evaluated,
      attempted,
      headline: 'Daily limit reached — 0 sent',
      explanation: 'The weekday job ran. No more SES sends are allowed today.',
      skipLines,
      openApprovals: false
    };
  }

  if (notApproved) {
    return {
      sent,
      skipped,
      evaluated,
      attempted,
      headline: 'Ran — 0 sent (nothing ready)',
      explanation:
        needsApproval > 0
          ? `Approved / ready to send is 0. ${needsApproval} still need approval before SES can go out.`
          : 'Approved waiting and eligible now are both 0. Approve drafts on Approvals, then run again. The job evaluated the cohort and skipped everyone.',
      skipLines,
      openApprovals: true
    };
  }

  return {
    sent,
    skipped,
    evaluated,
    attempted,
    headline: `Ran — 0 sent · ${skipped} skipped`,
    explanation: 'The weekday job ran with the same gates as cron. Nobody passed send eligibility.',
    skipLines,
    openApprovals: false
  };
}
