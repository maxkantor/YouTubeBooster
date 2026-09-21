import type {
  AiGenerateRequest,
  AiStudioGenerateResponse,
  AdminActivityEventRow,
  AdminDemoAuditRow,
  AdminListResponse,
  AdminDiagnosticRow,
  AdminDiagnosticsResponse,
  AdminOperationalDashboard,
  AdminOrderRow,
  AdminPurchaseRow,
  AdminSessionStatus,
  AdminSummary,
  AdminSupportTicketDetail,
  AdminSupportTicketRow,
  AdminUserDetailResponse,
  AdminUserRow,
  AcqAdminProspect,
  AcqSummary,
  CheckoutSession,
  DashboardOverview,
  DemoPreview,
  MagicLinkLoginResponse,
  PublicChannelAnalyzeResponse,
  PublicChannelSuggestionsResponse,
  PublicRunnerPingResponse,
  PublicTrafficToolsResponse,
  PublicVideo,
  PublicVideoSeoResponse,
  SaveUserYouTubeSettingsRequest,
  UserOnboardingState,
  UserSessionStatus,
  UserYouTubeSettings,
  ContactSubmitResponse
} from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

/** For identity stitching in JSON bodies only — never as a custom header (API Gateway CORS blocks it). */
function readAnonymousId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem('yb_anonymous_id') ?? undefined;
  } catch {
    return undefined;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const hasBody = init?.body !== undefined && init?.body !== null;

  const headers = new Headers(init?.headers);
  if (hasBody && method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers
  });

  const text = await response.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text.startsWith('<') ? 'The API returned HTML instead of JSON.' : 'Could not parse API response.');
    }
  }

  if (!response.ok) {
    const msg =
      (typeof data.detail === 'string' && data.detail.trim()) ||
      (typeof data.title === 'string' && data.title.trim()) ||
      (typeof data.error === 'string' && data.error.trim()) ||
      `Request failed with status ${response.status}`;
    throw new Error(msg);
  }

  return data as T;
}

async function fetchJsonAuthed<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetchJson<T>(path, { ...init, headers });
}

export const publicApi = {
  async trackFunnelEvent(
    eventName: string,
    scope?: string,
    metadata?: Record<string, string | null | undefined>
  ): Promise<void> {
    try {
      await fetchJson('/api/public/analytics/event', {
        method: 'POST',
        body: JSON.stringify({ eventName, scope: scope ?? null, metadata: metadata ?? null })
      });
    } catch {
      /* non-blocking */
    }
  },
  async runDemo(channelInput: string): Promise<DemoPreview> {
    const data = await fetchJson<DemoPreview & { gatedInsights?: string[] }>('/api/public/demo', {
      method: 'POST',
      body: JSON.stringify({ channelInput })
    });

    return {
      ...data,
      findings: data.findings ?? [],
      previewRecommendations: data.previewRecommendations ?? [],
      gatedModules: data.gatedModules ?? data.gatedInsights ?? [],
      subscriberCount: data.subscriberCount ?? 0,
      totalViews: data.totalViews ?? 0,
      videoCount: data.videoCount ?? 0,
      avgEngagement: data.avgEngagement ?? 0,
      topVideos: data.topVideos ?? []
    };
  },
  async analyzeChannel(channelInput: string, days = 30): Promise<PublicChannelAnalyzeResponse> {
    const q = new URLSearchParams({ channel: channelInput, days: String(days) });
    return fetchJson<PublicChannelAnalyzeResponse>(`/api/public/channel/analyze?${q.toString()}`);
  },
  async listVideos(channelInput: string, maxResults = 50): Promise<PublicVideo[]> {
    const q = new URLSearchParams({ channel: channelInput, max_results: String(maxResults) });
    return fetchJson<PublicVideo[]>(`/api/public/channel/videos?${q.toString()}`);
  },
  async getSuggestions(channelInput: string, topN = 10): Promise<PublicChannelSuggestionsResponse> {
    const q = new URLSearchParams({ channel: channelInput, top_n: String(topN) });
    return fetchJson<PublicChannelSuggestionsResponse>(`/api/public/channel/suggestions?${q.toString()}`);
  },
  async getTrafficTools(channelInput: string): Promise<PublicTrafficToolsResponse> {
    const q = new URLSearchParams({ channel: channelInput });
    return fetchJson<PublicTrafficToolsResponse>(`/api/public/channel/traffic_tools?${q.toString()}`);
  },
  async getVideoSeo(channelInput: string, videoId: string): Promise<PublicVideoSeoResponse> {
    const q = new URLSearchParams({ channel: channelInput });
    return fetchJson<PublicVideoSeoResponse>(`/api/public/video/seo/${encodeURIComponent(videoId)}?${q.toString()}`);
  },
  async runnerPing(): Promise<PublicRunnerPingResponse> {
    return fetchJson<PublicRunnerPingResponse>('/api/public/runner/ping');
  },
  async runnerLogIssue(payload: {
    video_id: string;
    title: string;
    desired_speed?: number | null;
    actual_speed?: number | null;
    position_seconds?: number | null;
    note: string;
  }): Promise<{ status: string }> {
    return fetchJson<{ status: string }>('/api/public/runner/log_issue', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  async createCheckoutSession(channelInput: string, email: string): Promise<CheckoutSession> {
    const outreach = typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = sessionStorage.getItem('yb_outreach_attribution');
            return raw ? (JSON.parse(raw) as Record<string, string>) : null;
          } catch {
            return null;
          }
        })()
      : null;
    return fetchJson<CheckoutSession>('/api/checkout/session', {
      method: 'POST',
      body: JSON.stringify({
        email,
        channelInput,
        successUrl: `${window.location.origin}/?checkout=success`,
        cancelUrl: `${window.location.origin}/#pricing`,
        planCode: 'premium',
        priceKey: 'premium',
        utmSource: outreach?.utm_source || undefined,
        utmMedium: outreach?.utm_medium || undefined,
        utmCampaign: outreach?.utm_campaign || undefined,
        ybOid: outreach?.yb_oid || undefined
      })
    });
  },
  async getCognitoConfig(): Promise<{ region: string; userPoolId: string; appClientId: string }> {
    return fetchJson<{ region: string; userPoolId: string; appClientId: string }>('/api/public/cognito/config');
  },
  /** Mirrors SSM /pricing/one-time-price + /pricing/currency */
  async getPricing(): Promise<{ oneTimePrice: string; currency: string }> {
    return fetchJson<{ oneTimePrice: string; currency: string }>('/api/public/pricing');
  },
  /** Public contact form — creates support thread + admin email (credentials: include for signed-in linking). */
  async submitContact(body: {
    email: string;
    name?: string | null;
    subject: string;
    message: string;
    productArea?: string;
    channelUrl?: string | null;
    orderReference?: string | null;
    accountEmail?: string | null;
  }): Promise<ContactSubmitResponse> {
    return fetchJson<ContactSubmitResponse>('/api/contact', {
      method: 'POST',
      body: JSON.stringify({
        email: body.email.trim(),
        name: body.name?.trim() ?? null,
        subject: body.subject.trim(),
        message: body.message.trim(),
        productArea: body.productArea?.trim() || 'general',
        channelUrl: body.channelUrl?.trim() || null,
        orderReference: body.orderReference?.trim() || null,
        accountEmail: body.accountEmail?.trim() || null
      })
    });
  }
};

export const meApi = {
  async getMe(idToken: string) {
    return fetchJsonAuthed<{ userId: string; email: string; purchased: boolean; onboardingCompleted: boolean; channelUrl: string | null; accessStatus: string }>(
      '/api/me',
      idToken
    );
  },
  async getAccessStatus(idToken: string) {
    return fetchJsonAuthed<{ userId: string; premium: boolean; accessStatus: string }>('/api/me/access-status', idToken);
  },
  async getEntitlements(idToken: string) {
    return fetchJsonAuthed<{ userId: string; entitlements: any[] }>('/api/me/entitlements', idToken);
  }
};

export const billingApi = {
  async createCheckoutSession(idToken: string, channelInput: string, planCode = 'premium'): Promise<CheckoutSession> {
    const outreach = typeof window !== 'undefined'
      ? (() => {
          try {
            const raw = sessionStorage.getItem('yb_outreach_attribution');
            return raw ? (JSON.parse(raw) as Record<string, string>) : null;
          } catch {
            return null;
          }
        })()
      : null;
    return fetchJsonAuthed<CheckoutSession>('/api/billing/create-checkout-session', idToken, {
      method: 'POST',
      body: JSON.stringify({
        email: 'account', // server overrides; included for backward compat shape
        channelInput,
        priceKey: planCode,
        planCode,
        successUrl: `${window.location.origin}/?checkout=success`,
        cancelUrl: `${window.location.origin}/#pricing`,
        utmSource: outreach?.utm_source || undefined,
        utmMedium: outreach?.utm_medium || undefined,
        utmCampaign: outreach?.utm_campaign || undefined,
        ybOid: outreach?.yb_oid || undefined
      })
    });
  },
  async reconcileCheckoutSession(idToken: string, sessionId: string): Promise<{ reconciled: boolean }> {
    return fetchJsonAuthed<{ reconciled: boolean }>('/api/billing/reconcile-checkout-session', idToken, {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  }
};

export const premiumApi = {
  async loadDashboardOverview(idToken: string): Promise<DashboardOverview> {
    return fetchJsonAuthed<DashboardOverview>('/api/premium/dashboard/overview', idToken);
  }
};

export const aiApi = {
  /** AI Growth Studio — backend enforces premium (Bedrock) vs preview (no Bedrock). */
  async generateStudio(idToken: string, payload: AiGenerateRequest, signal?: AbortSignal): Promise<AiStudioGenerateResponse> {
    return fetchJsonAuthed<AiStudioGenerateResponse>('/api/ai/generate', idToken, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal
    });
  }
};

export const authApi = {
  async requestMagicLink(email: string, redirectPath = '/'): Promise<MagicLinkLoginResponse> {
    return fetchJson<MagicLinkLoginResponse>('/api/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email, redirectPath })
    });
  },
  async verifyMagicLink(token: string): Promise<UserSessionStatus> {
    return fetchJson<UserSessionStatus>('/api/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },
  async getSession(): Promise<UserSessionStatus> {
    return fetchJson<UserSessionStatus>('/api/auth/session');
  },
  async logout(): Promise<UserSessionStatus> {
    return fetchJson<UserSessionStatus>('/api/auth/logout', {
      method: 'POST'
    });
  },
  async cognitoLogin(idToken: string): Promise<UserSessionStatus> {
    const anonymousId = readAnonymousId();
    return fetchJson<UserSessionStatus>('/api/auth/cognito/login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(anonymousId ? { anonymousId } : {})
    });
  },
  async cognitoEnsureUser(email: string, password: string): Promise<{ ok: boolean; created: boolean }> {
    return fetchJson<{ ok: boolean; created: boolean }>('/api/auth/cognito/ensure', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }
};

export const userApi = {
  async loadDashboardOverview(): Promise<DashboardOverview> {
    return fetchJson<DashboardOverview>('/api/user/dashboard/overview');
  },
  async loadOnboarding(): Promise<UserOnboardingState> {
    return fetchJson<UserOnboardingState>('/api/user/onboarding');
  },
  async saveOnboarding(channelUrl: string, growthGoal: string): Promise<UserOnboardingState> {
    return fetchJson<UserOnboardingState>('/api/user/onboarding', {
      method: 'POST',
      body: JSON.stringify({ channelUrl, growthGoal })
    });
  },
  async completeOnboarding(): Promise<UserOnboardingState> {
    return fetchJson<UserOnboardingState>('/api/user/onboarding/complete', {
      method: 'POST'
    });
  },
  async loadYouTubeSettings(): Promise<UserYouTubeSettings> {
    return fetchJson<UserYouTubeSettings>('/api/user/integrations/youtube/settings');
  },
  async saveYouTubeSettings(payload: SaveUserYouTubeSettingsRequest): Promise<UserYouTubeSettings> {
    return fetchJson<UserYouTubeSettings>('/api/user/integrations/youtube/settings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};

export const adminApi = {
  async login(email: string, password: string): Promise<AdminSessionStatus> {
    return fetchJson<AdminSessionStatus>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },
  async getSession(): Promise<AdminSessionStatus> {
    return fetchJson<AdminSessionStatus>('/api/admin/session');
  },
  async logout(): Promise<AdminSessionStatus> {
    return fetchJson<AdminSessionStatus>('/api/admin/logout', {
      method: 'POST'
    });
  },
  async loadSummary(): Promise<AdminSummary> {
    return fetchJson<AdminSummary>('/api/admin/dashboard/summary');
  },
  async crmUsers(limit = 50, cursor?: string | null): Promise<AdminListResponse<AdminUserRow>> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return fetchJson<AdminListResponse<AdminUserRow>>(`/api/admin/crm/users?${q}`);
  },
  async crmUser(userId: string): Promise<AdminUserDetailResponse> {
    return fetchJson<AdminUserDetailResponse>(`/api/admin/crm/users/${encodeURIComponent(userId)}`);
  },
  async crmPayments(limit = 50, cursor?: string | null): Promise<AdminListResponse<AdminPurchaseRow>> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return fetchJson<AdminListResponse<AdminPurchaseRow>>(`/api/admin/crm/payments?${q}`);
  },
  async crmAudits(limit = 50, cursor?: string | null): Promise<AdminListResponse<AdminDemoAuditRow>> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return fetchJson<AdminListResponse<AdminDemoAuditRow>>(`/api/admin/crm/audits?${q}`);
  },
  async crmSupportTickets(limit = 50, cursor?: string | null): Promise<AdminListResponse<AdminSupportTicketRow>> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return fetchJson<AdminListResponse<AdminSupportTicketRow>>(`/api/admin/crm/support/tickets?${q}`);
  },
  async crmSupportTicket(ticketId: string): Promise<AdminSupportTicketDetail> {
    return fetchJson<AdminSupportTicketDetail>(
      `/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}`
    );
  },
  async crmSupportReply(ticketId: string, subject: string, body: string): Promise<{ status?: string; ok?: boolean; sesMessageId?: string }> {
    return fetchJson(`/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ subject, body })
    });
  },
  async crmSupportInbound(ticketId: string, subject: string, body: string): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}/inbound`, {
      method: 'POST',
      body: JSON.stringify({ subject, body })
    });
  },
  async crmComposeOutreach(payload: {
    email: string;
    subject: string;
    body: string;
    name?: string;
    channelUrl?: string;
    prospectId?: string;
    sendNow?: boolean;
  }): Promise<{ ok: boolean; ticketId: string; sent: boolean; sesMessageId?: string }> {
    return fetchJson('/api/admin/crm/support/tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  async crmSupportNote(ticketId: string, body: string): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}/note`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  },
  async crmSupportLinkUser(ticketId: string, userId: string | null): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}/link-user`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  },
  async crmDashboard(range = '30d'): Promise<AdminOperationalDashboard> {
    const q = new URLSearchParams({ range });
    return fetchJson<AdminOperationalDashboard>(`/api/admin/crm/dashboard?${q}`);
  },
  async crmDiagnostics(range = '30d'): Promise<AdminDiagnosticsResponse> {
    const q = new URLSearchParams({ range });
    return fetchJson<AdminDiagnosticsResponse>(`/api/admin/crm/diagnostics?${q}`);
  },
  async crmBackfillPaymentLivemode(): Promise<{
    scanned: number;
    updated: number;
    assumedTest: number;
    confirmedLive: number;
    confirmedTest: number;
    notes: string[];
  }> {
    return fetchJson('/api/admin/crm/migrations/backfill-payment-livemode', { method: 'POST' });
  },
  async crmOrders(limit = 50, cursor?: string | null): Promise<AdminListResponse<AdminOrderRow>> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return fetchJson<AdminListResponse<AdminOrderRow>>(`/api/admin/crm/orders?${q}`);
  },
  async crmActivity(limit = 100, cursor?: string | null): Promise<AdminListResponse<AdminActivityEventRow>> {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return fetchJson<AdminListResponse<AdminActivityEventRow>>(`/api/admin/crm/activity?${q}`);
  },
  async crmPatchUser(
    userId: string,
    body: { userStatus?: string; adminNotes?: string; tags?: string }
  ): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },
  async crmGrantEntitlement(
    userId: string,
    body: { accessType: string; reason?: string | null; expiresAt?: string | null }
  ): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/users/${encodeURIComponent(userId)}/entitlements`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  async crmRevokeEntitlement(userId: string, entitlementId: string, reason?: string): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/users/${encodeURIComponent(userId)}/entitlements/${encodeURIComponent(entitlementId)}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null })
    });
  },
  async crmLinkOrder(stripeCheckoutSessionId: string, userId: string): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/orders/link`, {
      method: 'POST',
      body: JSON.stringify({ stripeCheckoutSessionId, userId })
    });
  },
  async crmPatchSupportTicket(
    ticketId: string,
    body: { status?: string; priority?: string }
  ): Promise<{ ok: boolean }> {
    return fetchJson(`/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },
  async acqSummary(): Promise<AcqSummary> {
    return fetchJson<AcqSummary>('/api/admin/crm/acquisition/summary');
  },
  async acqProspects(params: {
    view?: string;
    niche?: string;
    campaign?: string;
    language?: string;
    q?: string;
  } = {}): Promise<{
    items: AcqAdminProspect[];
    totalCount: number;
  }> {
    const q = new URLSearchParams();
    if (params.view) q.set('view', params.view);
    if (params.niche) q.set('niche', params.niche);
    if (params.campaign) q.set('campaign', params.campaign);
    if (params.language) q.set('language', params.language);
    if (params.q) q.set('q', params.q);
    const qs = q.toString();
    return fetchJson(`/api/admin/crm/acquisition/prospects${qs ? `?${qs}` : ''}`);
  },
  async acqInspect(body: {
    channelInput: string;
    primaryNiche: string;
    campaign: string;
    language?: string;
    officialWebsite?: string;
    publicBusinessEmail?: string;
    contactSourceUrl?: string;
    contactType: string;
    notes?: string;
  }): Promise<AcqAdminProspect> {
    return fetchJson('/api/admin/crm/acquisition/inspect', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  async acqDraft(id: string): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/draft`, { method: 'POST' });
  },
  async acqPreview(prospectIds: string[], campaign = 'COOK-001'): Promise<{ preview: boolean; sent: boolean; items: unknown[] }> {
    return fetchJson('/api/admin/crm/acquisition/preview', {
      method: 'POST',
      body: JSON.stringify({ campaign, prospectIds, maximumSends: 5, audienceQueryVersion: 'v1' })
    });
  },
  async acqApprove(prospectIds: string[], campaign = 'COOK-001'): Promise<{ approvalId: string }> {
    return fetchJson('/api/admin/crm/acquisition/approvals', {
      method: 'POST',
      body: JSON.stringify({ campaign, prospectIds, maximumSends: 5, audienceQueryVersion: 'v1' })
    });
  },
  async acqMigrateRescore(limit = 15): Promise<{
    inspected: number;
    failed: number;
    contactVerified: number;
    considered: number;
  }> {
    return fetchJson(`/api/admin/crm/acquisition/migrate-rescore?limit=${limit}`, { method: 'POST' });
  },
  async acqReject(id: string, reason?: string): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || null })
    });
  },
  async acqUnapprove(id: string): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/unapprove`, { method: 'POST' });
  },
  async acqOverrideCooldown(id: string, reason?: string): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/override-cooldown`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'admin override' })
    });
  },
  async acqDraftEdit(id: string, subject: string, body: string): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/draft-edit`, {
      method: 'POST',
      body: JSON.stringify({ subject, body })
    });
  },
  async acqManualContact(
    id: string,
    payload: { email: string; sourceUrl: string; attested: boolean; contactName?: string; notes?: string }
  ): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/manual-contact`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  async acqSetStatus(id: string, status: string, reason?: string): Promise<AcqAdminProspect> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason: reason || null })
    });
  },
  async acqSendNow(id: string): Promise<{ ok: boolean; messageId?: string; prospect?: AcqAdminProspect; error?: string }> {
    return fetchJson(`/api/admin/crm/acquisition/prospects/${encodeURIComponent(id)}/send-now`, { method: 'POST' });
  }
};
