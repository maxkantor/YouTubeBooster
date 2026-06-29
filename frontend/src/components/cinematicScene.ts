/** Route → cinematic scene for page-specific atmosphere (unified language, subtle shifts). */
export type CinematicScene =
  | 'studio'
  | 'analytics'
  | 'seo'
  | 'audit'
  | 'neural'
  | 'pricing'
  | 'infra';

export function resolveCinematicScene(pathname: string): CinematicScene {
  const p = pathname.toLowerCase();

  if (p.startsWith('/admin')) return 'infra';
  if (p === '/pricing') return 'pricing';
  if (p.startsWith('/dashboard') || p === '/platform' || p === '/app') return 'analytics';
  if (p.startsWith('/demo') || p.includes('channel-analyze') || p.startsWith('/audit')) return 'audit';
  if (
    p.startsWith('/solutions') ||
    p.startsWith('/guides') ||
    p.includes('seo') ||
    p.includes('keyword') ||
    p.includes('vidiq') ||
    p.includes('tubebuddy')
  ) {
    return 'seo';
  }
  if (p.includes('blog') || p.includes('ai-studio')) return 'neural';

  return 'studio';
}
