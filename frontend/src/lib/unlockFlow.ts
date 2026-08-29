/** After sign-up/sign-in, return here to start Stripe checkout automatically. */
export const UNLOCK_CHECKOUT_PARAM = 'unlock=checkout';

export function buildUnlockReturnTo(pathname = '/', search = '', hash = 'pricing'): string {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  params.set('unlock', 'checkout');
  const qs = params.toString();
  const hashPart = hash ? `#${hash.replace(/^#/, '')}` : '';
  return `${pathname}${qs ? `?${qs}` : ''}${hashPart}`;
}

export function unlockReturnFromWindow(): string {
  if (typeof window === 'undefined') {
    return buildUnlockReturnTo('/', '', 'pricing');
  }
  return buildUnlockReturnTo(window.location.pathname, window.location.search, window.location.hash.replace(/^#/, '') || 'pricing');
}

export function unlockSignupPath(returnTo?: string): string {
  const rt = returnTo ?? unlockReturnFromWindow();
  return `/auth/signup?returnTo=${encodeURIComponent(rt)}`;
}

export function unlockSigninPath(returnTo?: string): string {
  const rt = returnTo ?? unlockReturnFromWindow();
  return `/auth/signin?returnTo=${encodeURIComponent(rt)}`;
}

export function shouldAutoStartUnlockCheckout(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('unlock') === 'checkout';
}

export function clearUnlockCheckoutParam(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('unlock')) return;
  params.delete('unlock');
  const qs = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
}
