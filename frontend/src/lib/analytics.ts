import type { AiGenerateAction } from '../types';
import { publicApi } from './api';

const GA4_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;

/** Only bootstrap when index.html did not already define gtag (local dev without index snippet). */
if (typeof window !== 'undefined' && GA4_ID && typeof window.gtag !== 'function') {
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA4_ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(s);
}

const GA4_PRODUCT = 'full_growth_audit';
const GA4_PRICE = 9.99;
const GA4_CURRENCY = 'USD';
const DEMO_OPENED_SESSION_KEY = 'yb_ga4_demo_opened';
const OUTREACH_ATTR_KEY = 'yb_outreach_attribution';

/** Capture COOK-001 / outreach UTMs + opaque id into session (never stores email). */
export function captureOutreachAttributionFromUrl(search = typeof window !== 'undefined' ? window.location.search : '') {
  if (typeof window === 'undefined') return null;
  try {
    const q = new URLSearchParams(search);
    const source = (q.get('utm_source') || '').toLowerCase();
    const campaign = (q.get('utm_campaign') || '').toLowerCase();
    const oid = q.get('yb_oid') || '';
    const isOutreach =
      source === 'outreach' ||
      source === 'founder_outreach' ||
      campaign === 'cook-001' ||
      campaign === 'cook_001' ||
      Boolean(oid);
    if (!isOutreach) return getOutreachAttribution();
    const attr = {
      utm_source: q.get('utm_source') || 'outreach',
      utm_medium: q.get('utm_medium') || 'email',
      utm_campaign: q.get('utm_campaign') || 'COOK-001',
      utm_content: q.get('utm_content') || '',
      utm_id: q.get('utm_id') || '',
      yb_oid: oid,
      exp: q.get('exp') || '004',
      capturedAt: new Date().toISOString()
    };
    sessionStorage.setItem(OUTREACH_ATTR_KEY, JSON.stringify(attr));
    return attr;
  } catch {
    return null;
  }
}

export function getOutreachAttribution(): Record<string, string> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(OUTREACH_ATTR_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

export type Ga4AiTool =
  | 'rewrite_titles'
  | 'improve_description'
  | 'generate_keywords'
  | 'find_winning_pattern'
  | 'generate_video_ideas';

export function mapAiToolForGa4(action: AiGenerateAction): Ga4AiTool {
  switch (action) {
    case 'rewrite_titles':
      return 'rewrite_titles';
    case 'improve_description':
      return 'improve_description';
    case 'keywords':
      return 'generate_keywords';
    case 'pattern':
      return 'find_winning_pattern';
    case 'ideas':
      return 'generate_video_ideas';
    default:
      return 'rewrite_titles';
  }
}

/** GA4 custom events via gtag.js (index.html or env bootstrap). */
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  const payload = params ?? {};
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') {
    console.warn('GA4 EVENT skipped — window.gtag is not a function', eventName, payload);
    return;
  }
  console.log('GA4 EVENT', eventName, payload);
  window.gtag('event', eventName, payload);
}

export function getAnonymousId(): string {
  if (typeof window === 'undefined') return 'anon_server';
  try {
    const key = 'yb_anonymous_id';
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = `anon_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
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
    environment: import.meta.env.MODE || 'production',
    anonymousId: getAnonymousId(),
    eventSource: 'frontend'
  };
  if (params?.channel) meta.channel = params.channel;
  if (params?.userId) meta.userId = params.userId;
  if (params?.email) {
    const h = await hashEmail(params.email);
    if (h) meta.email_hash = h;
  }
  if (params?.livemode != null) meta.livemode = params.livemode ? 'true' : 'false';

  const outreach = getOutreachAttribution();
  if (outreach?.yb_oid) meta.yb_oid = outreach.yb_oid;
  if (outreach?.utm_campaign) meta.utm_campaign = outreach.utm_campaign;
  if (outreach?.utm_id) meta.utm_id = outreach.utm_id;
  if (outreach?.utm_source) meta.utm_source = outreach.utm_source;

  void publicApi.trackFunnelEvent(eventName, scope ?? route, meta);
}

function markDemoOpenedSession() {
  try {
    sessionStorage.setItem(DEMO_OPENED_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function hasDemoOpenedSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_OPENED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export const analytics = {
  landingPageView: () => trackFunnel('landing_page_view', '/'),

  /** GA4: demo_opened */
  demoOpenedFromHomepage: () => {
    markDemoOpenedSession();
    trackEvent('demo_opened', { source: 'homepage', demo_channel: 'maxkantorcooking' });
  },

  /** GA4: demo_opened — direct /demo visit without prior homepage click in this session. */
  demoOpenedOnDemoRoute: () => {
    if (hasDemoOpenedSession()) return;
    markDemoOpenedSession();
    trackEvent('demo_opened', { source: 'homepage', demo_channel: 'maxkantorcooking' });
  },

  auditUrlEntered: (channel: string) => trackFunnel('audit_url_entered', channel, { channel }),

  /**
   * GA4: audit_started — no channel URL sent to GA4.
   * Pass audit_attempt_id when available for future unique-audit reporting.
   */
  auditStarted: (
    source = 'homepage_or_audit_form',
    opts?: { auditAttemptId?: string }
  ) => {
    trackEvent('audit_started', {
      source,
      input_type: 'url_or_handle',
      ...(opts?.auditAttemptId ? { audit_attempt_id: opts.auditAttemptId } : {})
    });
    void trackFunnel('audit_started', source);
  },

  /**
   * GA4: audit_completed — call only after claimAuditCompletion succeeds
   * and only for non-showcase user audits.
   */
  auditCompleted: (opts?: { auditAttemptId?: string; source?: string }) => {
    trackEvent('audit_completed', {
      source: opts?.source ?? 'audit_flow',
      ...(opts?.auditAttemptId ? { audit_attempt_id: opts.auditAttemptId } : {})
    });
    void trackFunnel('audit_completed', opts?.source ?? 'audit_flow');
  },

  channelAuditStarted: (channel?: string) => {
    void trackFunnel('demo_started', channel, { channel });
  },

  demoDashboardViewed: () => trackEvent('demo_dashboard_viewed'),

  pricingViewed: () => {
    void trackFunnel('pricing_viewed', '/pricing');
    trackEvent('pricing_viewed');
  },

  signupStarted: (email?: string) => trackFunnel('signup_started', email ?? 'signup', email ? { email } : {}),
  signupCompleted: (userId?: string, email?: string) =>
    trackFunnel('signup_completed', userId ?? 'signup', { userId, email }),
  loginCompleted: (userId?: string, email?: string) =>
    trackFunnel('login_completed', userId ?? 'login', { userId, email }),

  /** GA4: checkout_started */
  checkoutStarted: (channel?: string) => {
    void trackFunnel('checkout_started', channel, { channel });
    trackEvent('checkout_started', {
      price: GA4_PRICE,
      currency: GA4_CURRENCY,
      product: GA4_PRODUCT
    });
  },

  checkoutReturnSuccess: (sessionId?: string) =>
    trackFunnel('checkout_return_success', sessionId ?? 'checkout', { route: '/checkout/success' }),
  checkoutReturnCancel: () => trackFunnel('checkout_return_cancel', 'checkout', { route: '/checkout/cancel' }),
  checkoutAbandoned: (channel?: string) => trackFunnel('checkout_abandoned', channel, { channel }),

  heroAuditCtaClicked: () => {
    void trackFunnel('hero_audit_cta_clicked', '/');
    trackEvent('hero_audit_cta_clicked');
  },

  heroInstantDemoClicked: () => {
    void trackFunnel('hero_instant_demo_clicked', '/');
    trackEvent('hero_instant_demo_clicked');
  },

  paymentFailed: (userId?: string) => trackFunnel('payment_failed', userId, { userId }),

  /** GA4: purchase_completed — call only after backend confirms premium access. */
  purchaseCompleted: () => {
    trackEvent('purchase_completed', {
      value: GA4_PRICE,
      currency: GA4_CURRENCY,
      product: GA4_PRODUCT
    });
    void trackFunnel('purchase_completed', '/checkout/success');
  },

  /** GA4: report_unlocked */
  reportUnlocked: () => {
    trackEvent('report_unlocked', { product: GA4_PRODUCT });
  },

  /** GA4: ai_tool_used */
  aiToolUsed: (action: AiGenerateAction) => {
    trackEvent('ai_tool_used', { tool: mapAiToolForGa4(action) });
  },

  contactSubmitted: () => trackFunnel('contact_submitted', 'contact')
};
