import type {
  AdminSessionStatus,
  AdminSummary,
  CheckoutSession,
  DashboardOverview,
  DemoPreview,
  MagicLinkLoginResponse,
  SaveUserYouTubeSettingsRequest,
  UserOnboardingState,
  UserSessionStatus,
  UserYouTubeSettings
} from '../types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
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
  }
};
