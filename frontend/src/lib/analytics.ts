import { publicApi } from './api';

const GA4_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;

if (typeof window !== 'undefined' && GA4_ID) {
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  (window as unknown as { gtag: unknown }).gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA4_ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(s);
}

async function hashEmail(email: string): Promise<string | undefined> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || typeof crypto?.subtle?.digest !== 'function') return undefined;
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type FunnelParams = {
  route?: string;
  channel?: string;
  userId?: string;
  email?: string;
  livemode?: boolean;
};

async function trackFunnel(eventName: string, scope?: string, params?: FunnelParams) {
  const route = params?.route ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
  const meta: Record<string, string> = {
    route,
    environment: import.meta.env.MODE || 'production'
  };
  if (params?.channel) meta.channel = params.channel;
  if (params?.userId) meta.userId = params.userId;
  if (params?.email) {
    const h = await hashEmail(params.email);
    if (h) meta.email_hash = h;
  }
  if (params?.livemode != null) meta.livemode = params.livemode ? 'true' : 'false';

  if (typeof window !== 'undefined' && GA4_ID) {
    const gaParams: Record<string, string | boolean> = { ...meta };
    window.gtag?.('event', eventName, gaParams);
  }

  void publicApi.trackFunnelEvent(eventName, scope ?? route, meta);
}

export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined' || !GA4_ID) return;
  window.gtag?.('event', eventName, params as Record<string, unknown>);
}

export const analytics = {
  landingPageView: () => trackFunnel('landing_page_view', '/'),
  auditUrlEntered: (channel: string) => trackFunnel('audit_url_entered', channel, { channel }),
  channelAuditStarted: (channel?: string) => {
    void trackFunnel('demo_started', channel, { channel });
    trackEvent('channel_audit_started', channel ? { channel_input: channel } : {});
  },
  demoDashboardViewed: () => trackEvent('demo_dashboard_viewed'),
  pricingViewed: () => trackEvent('pricing_viewed'),
  signupStarted: (email?: string) => trackFunnel('signup_started', email ?? 'signup', email ? { email } : {}),
  signupCompleted: (userId?: string, email?: string) =>
    trackFunnel('signup_completed', userId ?? 'signup', { userId, email }),
  loginCompleted: (userId?: string, email?: string) =>
    trackFunnel('login_completed', userId ?? 'login', { userId, email }),
  checkoutStarted: (channel?: string) => {
    void trackFunnel('checkout_started', channel, { channel });
    trackEvent('checkout_started');
  },
  checkoutAbandoned: (channel?: string) => trackFunnel('checkout_abandoned', channel, { channel }),
  paymentSucceeded: (livemode: boolean, userId?: string) =>
    trackFunnel(livemode ? 'payment_succeeded_live' : 'payment_succeeded_test', userId, { livemode, userId }),
  paymentFailed: (userId?: string) => trackFunnel('payment_failed', userId, { userId }),
  /** GA4 legacy event; live/test payment funnel events are recorded server-side via Stripe webhooks. */
  purchaseCompleted: () => trackEvent('purchase_completed'),
  contactSubmitted: () => trackFunnel('contact_submitted', 'contact'),
  entitlementGranted: (userId?: string) => trackFunnel('entitlement_granted', userId, { userId })
};
