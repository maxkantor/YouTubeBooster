declare global {
  interface Window {
    gtag?: (command: string, targetId: string, params?: Record<string, unknown>) => void;
    dataLayer?: unknown[];
  }
}

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

export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined' || !GA4_ID) return;
  window.gtag?.('event', eventName, params as Record<string, unknown>);
}

export const analytics = {
  channelAuditStarted: (channel?: string) => trackEvent('channel_audit_started', channel ? { channel_input: channel } : {}),
  demoDashboardViewed: () => trackEvent('demo_dashboard_viewed'),
  pricingViewed: () => trackEvent('pricing_viewed'),
  checkoutStarted: () => trackEvent('checkout_started'),
  purchaseCompleted: () => trackEvent('purchase_completed')
};
