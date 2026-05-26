/**
 * Fallback when /api/public/pricing has not loaded yet (offline, local dev without API).
 * Frontend display is intentionally fixed for marketing copy.
 */
export const FRONTEND_DISPLAY_ONE_TIME_PRICE = '9.99';
export const FALLBACK_ONE_TIME_PRICE_LABEL = '$9.99';

export function formatPriceLabel(amount: string, currency: string): string {
  const c = (currency || 'USD').toUpperCase();
  if (c === 'USD') {
    return `$${FRONTEND_DISPLAY_ONE_TIME_PRICE}`;
  }
  return `${FRONTEND_DISPLAY_ONE_TIME_PRICE} ${c}`;
}
