/** Fallback when /api/public/pricing has not loaded yet (offline, local dev without API). */
export const DEFAULT_ONE_TIME_PRICE = '9.99';
export const FALLBACK_ONE_TIME_PRICE_LABEL = '$9.99';

export function formatPriceLabel(amount: string, currency: string): string {
  const normalized = (amount || DEFAULT_ONE_TIME_PRICE).trim();
  const c = (currency || 'USD').toUpperCase();
  if (c === 'USD') {
    return `$${normalized}`;
  }
  return `${normalized} ${c}`;
}
