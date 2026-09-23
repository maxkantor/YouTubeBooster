export type CreatorDiscoveryPhase = 'running' | 'complete' | 'partial' | 'failed';

export function creatorDiscoveryProgress(added: number, target: number): { pct: number | null; remaining: number } {
  const remaining = Math.max(0, target - added);
  if (!Number.isFinite(target) || target <= 0) return { pct: null, remaining };
  return { pct: Math.min(100, Math.round((100 * Math.max(0, added)) / target)), remaining };
}

export function creatorDiscoveryPhase(
  status: string | undefined,
  added: number,
  target: number,
  clientInterrupted = false
): CreatorDiscoveryPhase {
  if (clientInterrupted && added > 0) return 'partial';
  if (clientInterrupted && added <= 0) return 'failed';
  const s = (status || '').toLowerCase();
  if (s === 'running' || s === 'starting' || !s) return 'running';
  if (s === 'failed') return added > 0 ? 'partial' : 'failed';
  if (s === 'interrupted' || s === 'partial') return added > 0 ? 'partial' : 'failed';
  if (s === 'completed' && added >= target && target > 0) return 'complete';
  if (s === 'completed') return added > 0 ? 'partial' : 'failed';
  return 'running';
}

export function isTransientDiscoveryError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /503|502|504|429|500|timeout|timed out|unavailable|network/i.test(msg);
}

export function discoveryInterruptMessage(added: number, target: number, httpHint?: string): string {
  const remaining = Math.max(0, target - added);
  void httpHint;
  if (added > 0) {
    return `Creator discovery was interrupted. ${added} of ${target} creators were successfully added. ${remaining} remain. A discovery service temporarily became unavailable.`;
  }
  return 'Creator discovery could not start or continue. A discovery service temporarily became unavailable.';
}

export function creatorDiscoveryTitle(phase: CreatorDiscoveryPhase): string {
  if (phase === 'complete') return '✓ Creator discovery complete';
  if (phase === 'partial') return '⚠ Discovery partially completed';
  if (phase === 'failed') return '⚠ Creator discovery could not continue';
  return 'DISCOVERING CREATORS';
}

export function creatorDiscoveryBadge(phase: CreatorDiscoveryPhase): string {
  if (phase === 'complete') return 'COMPLETE';
  if (phase === 'partial') return 'PARTIAL';
  if (phase === 'failed') return 'FAILED';
  return 'RUNNING';
}

export function discoveryHttpHint(err: unknown): string | undefined {
  const msg = err instanceof Error ? err.message : String(err || '');
  const match = msg.match(/\b(429|500|502|503|504)\b/);
  return match ? `HTTP ${match[1]}` : undefined;
}
