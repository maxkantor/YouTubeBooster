import type {
  AdminDemoAuditRow,
  AdminListResponse,
  AdminPurchaseRow,
  AdminSessionStatus,
  AdminSummary,
  AdminSupportTicketDetail,
  AdminSupportTicketRow,
  AdminUserDetailResponse,
  AdminUserRow,
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
  UserYouTubeSettings
} from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const hasBody = init?.body !== undefined && init?.body !== null;

  const headers: Record<string, string> = {};
  if (hasBody && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: { ...headers, ...(init?.headers || {}) },
    ...init
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
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

async function fetchJsonAuthed<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const hdrs = new Headers(init?.headers || {});
  hdrs.set('Authorization', `Bearer ${token}`);
  return fetchJson<T>(path, { ...init, headers: hdrs });
}

export const publicApi = {
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
    return fetchJson<CheckoutSession>('/api/checkout/session', {
      method: 'POST',
      body: JSON.stringify({
        email,
        channelInput,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/dashboard`
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
    return fetchJsonAuthed<CheckoutSession>('/api/billing/create-checkout-session', idToken, {
      method: 'POST',
      body: JSON.stringify({
        email: 'account', // server overrides; included for backward compat shape
        channelInput,
        priceKey: planCode,
        planCode,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/#pricing`
      })
    });
  }
};

export const premiumApi = {
  async loadDashboardOverview(idToken: string): Promise<DashboardOverview> {
    return fetchJsonAuthed<DashboardOverview>('/api/premium/dashboard/overview', idToken);
  }
};

export const authApi = {
  async requestMagicLink(email: string, redirectPath = '/checkout/success'): Promise<MagicLinkLoginResponse> {
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
  async crmSupportReply(ticketId: string, subject: string, body: string): Promise<{ status?: string }> {
    return fetchJson(`/api/admin/crm/support/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ subject, body })
    });
  }
};
