/**
 * Fallback when /api/public/pricing has not loaded yet (offline, local dev without API).
 * Live price always comes from SSM via the API.
 */
export const FALLBACK_ONE_TIME_PRICE_LABEL = '$19.99';

export function formatPriceLabel(amount: string, currency: string): string {
  const c = (currency || 'USD').toUpperCase();
  if (c === 'USD') {
    return `$${amount}`;
  }
  return `${amount} ${c}`;
}
