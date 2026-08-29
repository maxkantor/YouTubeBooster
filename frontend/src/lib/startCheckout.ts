import { billingApi, publicApi } from './api';
import type { CheckoutSession } from '../types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isCheckoutEmailValid(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function resolveCheckoutUrl(session: CheckoutSession | Record<string, unknown> | null | undefined): string {
  if (!session || typeof session !== 'object') return '';
  const record = session as Record<string, unknown>;
  const url = record.checkoutUrl ?? record.CheckoutUrl;
  return typeof url === 'string' ? url.trim() : '';
}

export async function startPremiumCheckout(opts: {
  channelInput: string;
  email?: string;
  idToken?: string | null;
}): Promise<CheckoutSession> {
  const channel = opts.channelInput.trim() || 'account';

  if (opts.idToken) {
    return billingApi.createCheckoutSession(opts.idToken, channel, 'premium');
  }

  const email = opts.email?.trim() ?? '';
  if (!isCheckoutEmailValid(email)) {
    throw new Error('Enter a valid email to continue to secure checkout.');
  }

  return publicApi.createCheckoutSession(channel, email);
}
