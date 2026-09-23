/** Mirrors backend AcquisitionTaxonomy. Cooking remains the default/primary cohort. */
export const ACQ_DEFAULT_CATEGORY = 'cooking';
export const ACQ_DEFAULT_CAMPAIGN = 'COOK-001';
export const ACQ_DEFAULT_LANGUAGE = 'en';

export const ACQ_CATEGORIES = [
  { id: 'cooking', label: 'Cooking & Food' },
  { id: 'technology', label: 'Technology & AI' },
  { id: 'fitness', label: 'Fitness & Sports' },
  { id: 'education', label: 'Education' },
  { id: 'business', label: 'Business / Entrepreneurship' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'travel', label: 'Travel' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'health', label: 'Health & Wellness' },
  { id: 'podcasts', label: 'Podcasts / Interviews' },
  { id: 'diy', label: 'DIY / Home' },
  { id: 'beauty', label: 'Beauty / Fashion' },
  { id: 'automotive', label: 'Automotive' },
  { id: 'finance', label: 'Finance' },
  { id: 'other', label: 'Other' }
] as const;

export const ACQ_LANGUAGES = [
  { id: 'en', label: 'English', phase: 'active' },
  { id: 'ru', label: 'Russian', phase: 'active' },
  { id: 'hi', label: 'Hindi', phase: 'active' },
  { id: 'es', label: 'Spanish', phase: 'expansion' },
  { id: 'pt', label: 'Portuguese', phase: 'expansion' },
  { id: 'uk', label: 'Ukrainian', phase: 'observed' }
] as const;

export const ACQ_MARKETS = [
  { id: '', label: 'All / unspecified' },
  { id: 'IN', label: 'India' },
  { id: 'US', label: 'United States' },
  { id: 'GB', label: 'United Kingdom' },
  { id: 'DE', label: 'Germany' },
  { id: 'RU', label: 'Russia' },
  { id: 'UA', label: 'Ukraine' },
  { id: 'BR', label: 'Brazil' },
  { id: 'MX', label: 'Mexico' },
  { id: 'ES', label: 'Spain' },
  { id: 'OTHER', label: 'Other' }
] as const;

export const ACQ_TIERS = [
  { id: 'emerging', label: 'Emerging (1K–10K)' },
  { id: 'growing', label: 'Growing (10K–100K)' },
  { id: 'established', label: 'Established (100K–1M)' },
  { id: 'major', label: 'Major (1M+)' },
  { id: 'strategic', label: 'Strategic' },
  { id: 'unknown', label: 'Unknown' }
] as const;

export const ACQ_FORMATS = [
  { id: 'long_form', label: 'Long form' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'unknown', label: 'Unknown' }
] as const;

export function deriveCreatorTier(subscribers: number, strategic = false): string {
  if (strategic) return 'strategic';
  if (subscribers >= 1_000_000) return 'major';
  if (subscribers >= 100_000) return 'established';
  if (subscribers >= 10_000) return 'growing';
  if (subscribers >= 1_000) return 'emerging';
  return 'unknown';
}

export function categoryLabel(id: string | null | undefined): string {
  return ACQ_CATEGORIES.find((c) => c.id === id)?.label || id || '—';
}

export function languageLabel(id: string | null | undefined): string {
  return ACQ_LANGUAGES.find((l) => l.id === id)?.label || id || '—';
}

export function marketLabel(id: string | null | undefined): string {
  if (!id) return 'Unspecified';
  return ACQ_MARKETS.find((m) => m.id === id)?.label || id;
}

export function tierLabel(id: string | null | undefined): string {
  return ACQ_TIERS.find((t) => t.id === id)?.label || id || 'Unknown';
}

export function formatLabel(id: string | null | undefined): string {
  return ACQ_FORMATS.find((f) => f.id === id)?.label || 'Unknown';
}
