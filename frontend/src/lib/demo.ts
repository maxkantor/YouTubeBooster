/** Default channel used for the full product demo (no blur). Must match backend and landing. */
export const DEFAULT_DEMO_CHANNEL = 'https://www.youtube.com/@maxkantorUSA';

/** Normalizes channel input for comparison (lowercase, trim, optional trailing slash). */
export function normalizeChannelForComparison(input: string): string {
  return (input || '').trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Parses YouTube channel URL or handle and returns a clean display identity (e.g. @KeyWestWaterman).
 */
/** Canonical YouTube channel page URL for trust UI (link-out). */
export function buildYoutubeChannelCanonicalUrl(input: string): string {
  const t = (input || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      return u.toString().split('#')[0].split('?')[0];
    } catch {
      return t;
    }
  }
  if (t.startsWith('@')) return `https://www.youtube.com/${t}`;
  return `https://www.youtube.com/@${t.replace(/^@/, '')}`;
}

export function getDisplayHandle(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '@channel';
  const atMatch = trimmed.match(/@[\w.-]+/);
  if (atMatch) return atMatch[0];
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const path = url.pathname.replace(/\/$/, '');
    const handleFromPath = path.split('/').find((s) => s.startsWith('@'));
    if (handleFromPath) return handleFromPath;
    if (path.includes('/channel/') || path.includes('/c/') || path.includes('/user/')) {
      const slug = path.split('/').filter(Boolean).pop();
      return slug ? `@${slug}` : '@channel';
    }
  } catch {
    /* ignore */
  }
  return trimmed.length > 20 ? `@${trimmed.slice(-15)}` : trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

export const DEMO_STORAGE_KEY = 'yb_demo_channel';

export function getStoredDemoChannel(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(DEMO_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredDemoChannel(value: string): void {
  try {
    sessionStorage.setItem(DEMO_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
