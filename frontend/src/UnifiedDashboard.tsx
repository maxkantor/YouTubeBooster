import { useEffect, useRef, useState } from 'react';
import { BRAND } from './config/brand';
import { usePricing } from './PricingContext';
import {
  demoChannelData,
  demoDetectedProblems,
  demoLockedInsightTeasers,
  demoOpportunities,
  demoRecommendations,
  demoSeoAnalysis,
  demoSuggestions,
  demoTopVideos,
  demoTrafficTools,
  demoVideos
} from './demoData';
import {
  DEFAULT_DEMO_CHANNEL,
  buildYoutubeChannelCanonicalUrl,
  getDisplayHandle,
  normalizeChannelForComparison
} from './lib/demo';

/** Only the marketing default URL/handle may use the embedded Max Kantor demo dataset. */
function isBuiltInShowcaseChannel(channelInput: string): boolean {
  const trimmed = channelInput.trim();
  if (!trimmed) return false;
  const inputNorm = normalizeChannelForComparison(trimmed);
  const defaultNorm = normalizeChannelForComparison(DEFAULT_DEMO_CHANNEL);
  const handleNorm = normalizeChannelForComparison(getDisplayHandle(trimmed));
  const defaultHandleNorm = normalizeChannelForComparison(getDisplayHandle(DEFAULT_DEMO_CHANNEL));
  return (
    inputNorm === defaultNorm ||
    handleNorm === defaultHandleNorm ||
    handleNorm === '@maxkantorcooking'
  );
}
import { publicApi } from './lib/api';
import { analytics } from './lib/analytics';
import { PaywallModal } from './PaywallModal';
import { DemoAnalysisLoadingPanel } from './components/DemoAnalysisLoadingPanel';
import type { CheckoutSession } from './types';
import type { DemoPreview } from './types';
import type { DashboardOverview } from './types';
import type {
  PublicChannelAnalyzeResponse,
  PublicChannelSuggestionsResponse,
  PublicTrafficToolsResponse,
  PublicVideo,
  PublicVideoSeoResponse
} from './types';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊', locked: false },
  { id: 'videos', label: 'Videos', icon: '📹', locked: false },
  { id: 'suggestions', label: 'Suggestions', icon: '💡', locked: false },
  { id: 'seo', label: 'SEO Optimizer', icon: '🔍', locked: false },
  { id: 'traffic', label: 'Traffic Tools', icon: '🚀', locked: false },
  { id: 'runner', label: 'Continuous Runner', icon: '▶', locked: false }
] as const;

type TabId = (typeof TABS)[number]['id'];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Copy text to clipboard; works in secure and fallback contexts. Returns true if successful. */
async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function extractYouTubeVideoId(input: string): string {
  const value = (input || '').trim();
  if (!value) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const shortId = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (/^[A-Za-z0-9_-]{11}$/.test(shortId)) return shortId;
    }
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;

    const parts = url.pathname.split('/').filter(Boolean);
    const prefixes = new Set(['shorts', 'embed', 'live', 'watch']);
    if (parts.length >= 2 && prefixes.has(parts[0]) && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) return parts[1];
  } catch {
    // ignore
  }
  return '';
}

type LocalSeoResult = {
  title: string;
  score: number;
  rating: 'good' | 'fair' | 'needs-work';
  issues: string[];
  recommendations: string[];
  suggestedTitles: string[];
};

function analyzeSeoLocally(title: string): LocalSeoResult {
  const trimmed = (title || '').trim();
  const length = trimmed.length;
  const words = trimmed.split(/\s+/).filter(Boolean);

  let score = 78;
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (length < 30) {
    score -= 18;
    issues.push('Title is likely too short for strong search intent + curiosity.');
    recommendations.push('Add a clear outcome + keyword (e.g., dish name + a promise).');
  } else if (length > 70) {
    score -= 16;
    issues.push('Title is likely too long; it may truncate on mobile and weaken CTR.');
    recommendations.push('Shorten the title while keeping the main keyword near the front.');
  }

  const hasNumber = /\b\d+\b/.test(trimmed);
  if (!hasNumber) {
    score -= 6;
    issues.push('No numbers present (numbers often improve scannability and CTR).');
    recommendations.push('Try a number: “3 mistakes…”, “5-minute…”, “2 ways…”.');
  }

  const hasCapsWord = /\b[A-Z]{3,}\b/.test(trimmed);
  if (hasCapsWord) {
    score -= 6;
    issues.push('Excessive ALL CAPS can look spammy.');
    recommendations.push('Use emphasis sparingly; prefer clarity over shouting.');
  }

  const keyword = words.find((w) => w.length >= 5) ?? (words[0] ?? 'Recipe');
  const suggestedTitles = [
    `${keyword}: The Fastest Way (Step-by-Step)`,
    `How to Make ${keyword} (No Mistakes)`,
    `${keyword} — 5 Tips for Better Results`
  ];

  score = Math.max(0, Math.min(100, score));
  const rating: LocalSeoResult['rating'] = score >= 80 ? 'good' : score >= 60 ? 'fair' : 'needs-work';

  return {
    title: trimmed || 'Video',
    score,
    rating,
    issues,
    recommendations,
    suggestedTitles
  };
}

export function UnifiedDashboard({
  isDemo,
  isFullDemo = false,
  premiumUnlocked = false,
  paidChannelAudit = false,
  demoData,
  dashboardOverview,
  channelInput,
  userEmail,
  demoLoading,
  demoError,
  onCreateCheckout,
  onSignOut
}: {
  isDemo: boolean;
  /** When true, default channel demo: all tabs visible, no blur. When false (user channel), preview mode with blur. */
  isFullDemo?: boolean;
  /** Paid user on a non-default channel — same unlock as full demo, different badge copy. */
  premiumUnlocked?: boolean;
  /** Logged-in premium user on `/dashboard/channel` — full UI without harsh public-demo API warnings. */
  paidChannelAudit?: boolean;
  demoData: DemoPreview | null;
  dashboardOverview: DashboardOverview | null;
  channelInput: string;
  userEmail?: string;
  demoLoading?: boolean;
  demoError?: string | null;
  onCreateCheckout: (channelInput: string, email: string) => Promise<CheckoutSession>;
  onSignOut?: () => void;
}) {
  const { oneTimePriceLabel } = usePricing();
  const isPreviewMode = isDemo && !isFullDemo;
  const showLockedUI = isDemo && !isFullDemo;
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [displayScore, setDisplayScore] = useState(0);
  const [seoInput, setSeoInput] = useState('');
  const [seoResult, setSeoResult] = useState<LocalSeoResult | null>(null);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [trafficLoaded, setTrafficLoaded] = useState(false);
  const [runnerLoaded, setRunnerLoaded] = useState(false);
  /** Synced when videos load so Start can play before React commits runnerLoaded. */
  const runnerLoadedRef = useRef(false);
  const [runnerIndex, setRunnerIndex] = useState(0);
  const [runnerLog, setRunnerLog] = useState<string[]>([]);
  const [runnerSpeed, setRunnerSpeed] = useState(2);
  const [runnerWatchSeconds, setRunnerWatchSeconds] = useState(30);
  const [runnerShuffle, setRunnerShuffle] = useState(false);
  const [runnerRunning, setRunnerRunning] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<'IDLE' | 'RUNNING' | 'STOPPED' | 'ERROR'>('IDLE');
  const [runnerDesiredSpeed, setRunnerDesiredSpeed] = useState<number | null>(null);
  const [runnerActualSpeed, setRunnerActualSpeed] = useState<number | null>(null);
  const [runnerPosition, setRunnerPosition] = useState<number | null>(null);
  const [runnerSessionStarted, setRunnerSessionStarted] = useState(0);
  const [runnerSessionEnded, setRunnerSessionEnded] = useState(0);
  const [runnerSessionWallSeconds, setRunnerSessionWallSeconds] = useState(0);
  const [runnerServerStatus, setRunnerServerStatus] = useState<'—' | 'Testing…' | 'OK' | 'Offline' | 'Error'>('—');
  const [runnerIssueNote, setRunnerIssueNote] = useState('');
  const [runnerPicked, setRunnerPicked] = useState<Record<string, boolean>>({});
  const runnerPickedRef = useRef<Record<string, boolean>>({});
  const [runnerPlayOrder, setRunnerPlayOrder] = useState<number[]>([]);
  const runnerPlayOrderRef = useRef<number[]>([]);
  const [runnerWatchStartPos, setRunnerWatchStartPos] = useState<number | null>(null);
  const [runnerWatchLimitFired, setRunnerWatchLimitFired] = useState(false);
  /** Play on YouTube player tabs (autoplay). Browser allows 1 popup/click unless popups are allowed. */
  const [runnerPlayOnYouTube, setRunnerPlayOnYouTube] = useState(false);
  type RunnerYtQueueItem = { videoId: string; title: string; status: 'pending' | 'opened' | 'blocked' };
  const [runnerYtQueue, setRunnerYtQueue] = useState<RunnerYtQueueItem[]>([]);
  const runnerYtQueueRef = useRef<RunnerYtQueueItem[]>([]);
  const runnerWatchStartPosRef = useRef(0);
  const runnerWatchLimitFiredRef = useRef(false);
  const runnerWatchWallStartRef = useRef<number | null>(null);
  const runnerYouTubeWindowsRef = useRef<Window[]>([]);
  const runnerYouTubeWatchTimerRef = useRef<number | null>(null);
  const runnerRunningRef = useRef(false);
  const runnerSpeedRef = useRef(runnerSpeed);
  const runnerWatchSecondsRef = useRef(runnerWatchSeconds);
  const runnerPlayOnYouTubeRef = useRef(runnerPlayOnYouTube);
  const runnerSpeedClampLoggedRef = useRef(false);
  const runnerResumeTimerRef = useRef<number | null>(null);
  const runnerLoadSessionRef = useRef(0);

  /** Synced inside loadVideos so runner can use list immediately after await (React state is async). */
  const runnerVideosRef = useRef<PublicVideo[]>([]);
  /** Skip one runnerIndex effect after Start (avoid double player init). */
  const suppressRunnerIndexEffectRef = useRef(false);
  /** Cancel token for async Start flow (Start can await server/payer before playing). */
  const runnerStartTokenRef = useRef(0);

  useEffect(() => {
    runnerRunningRef.current = runnerRunning;
  }, [runnerRunning]);
  useEffect(() => {
    runnerSpeedRef.current = runnerSpeed;
    runnerSpeedClampLoggedRef.current = false;
  }, [runnerSpeed]);
  useEffect(() => {
    runnerWatchSecondsRef.current = runnerWatchSeconds;
  }, [runnerWatchSeconds]);
  useEffect(() => {
    runnerPlayOnYouTubeRef.current = runnerPlayOnYouTube;
  }, [runnerPlayOnYouTube]);
  const reportUnlockedTrackedRef = useRef(false);

  useEffect(() => {
    if (reportUnlockedTrackedRef.current) return;
    if (demoLoading) return;

    const paidReportReady =
      (paidChannelAudit && demoData != null) ||
      (premiumUnlocked && !isFullDemo && demoData != null) ||
      (!isDemo && dashboardOverview != null);

    if (!paidReportReady) return;

    reportUnlockedTrackedRef.current = true;
    analytics.reportUnlocked();
  }, [paidChannelAudit, premiumUnlocked, isFullDemo, isDemo, demoData, dashboardOverview, demoLoading]);

  // YouTube iframe API player (kept out of React state)
  const playerRef = (globalThis as any).__ybPlayerRef as { player: any | null } | undefined;
  (globalThis as any).__ybPlayerRef = playerRef ?? { player: null };
  const [pyOverview, setPyOverview] = useState<PublicChannelAnalyzeResponse | null>(null);
  const [pyVideos, setPyVideos] = useState<PublicVideo[] | null>(null);
  const [pySuggestions, setPySuggestions] = useState<PublicChannelSuggestionsResponse | null>(null);
  const [pyTraffic, setPyTraffic] = useState<PublicTrafficToolsResponse | null>(null);
  const [pySeo, setPySeo] = useState<PublicVideoSeoResponse | null>(null);
  const [pyLoading, setPyLoading] = useState(false);
  const [pyError, setPyError] = useState<string | null>(null);
  const [pyVideosLoading, setPyVideosLoading] = useState(false);
  /** Id of the last "Copy" button that succeeded, for showing "Copied!" (e.g. "link-abc123"). */
  const [copyFeedbackId, setCopyFeedbackId] = useState<string | null>(null);

  /** GET /channel/analyze uses UC_fallback when YouTube API is unavailable; POST /demo may still have the real channel. */
  const preferDemoSnapshotOverPy =
    isDemo && pyOverview?.channel_info?.channel_id === 'UC_fallback' && demoData != null;

  /** True only for https://www.youtube.com/@maxkantorcooking — never for user-entered channels. */
  const isEmbeddedProductDemo = isDemo && isBuiltInShowcaseChannel(channelInput || '');

  const demoTitleFallback = (): string => {
    const h = getDisplayHandle(channelInput);
    return h && h !== '@channel' ? `Preview — ${h}` : 'Channel preview';
  };

  const channelTitle = isDemo
    ? preferDemoSnapshotOverPy && demoData?.channelTitle
      ? demoData.channelTitle
      : (pyOverview?.channel_info?.title ??
          demoData?.channelTitle ??
          (isEmbeddedProductDemo ? demoChannelData.channelTitle : undefined)) || demoTitleFallback()
    : (dashboardOverview?.channelTitle ?? 'Channel');
  const hasNamedDashboardChannel = !isDemo && !!channelTitle && channelTitle !== 'Channel' && channelTitle !== 'Channel setup pending';
  const dashboardTitle = hasNamedDashboardChannel
    ? `${BRAND.name} Dashboard for "${channelTitle}"`
    : `${BRAND.name} Dashboard`;
  const displayHandle = isDemo ? getDisplayHandle(channelInput) : null;
  const previewFor = isDemo
    ? displayHandle && displayHandle !== '@channel'
      ? displayHandle
      : demoData?.channelHandle ??
        (isEmbeddedProductDemo ? demoChannelData.channelHandle : getDisplayHandle(channelInput))
    : null;

  const channelPageUrl = buildYoutubeChannelCanonicalUrl(channelInput);
  const contextHandle = isDemo
    ? getDisplayHandle(channelInput)
    : getDisplayHandle(channelInput || channelTitle);
  const contextDisplayName = (channelTitle || '').trim() || contextHandle || 'Your channel';
  const contextAvatarLetter = (() => {
    const base = (contextDisplayName || contextHandle || '?').replace(/^@/, '');
    const alnum = base.replace(/[^a-zA-Z0-9]/g, '');
    return (alnum.slice(0, 1) || base.slice(0, 1) || '?').toUpperCase();
  })();

  const awaitingFirstChannelData =
    isDemo &&
    !!channelInput.trim() &&
    demoData == null &&
    pyOverview == null &&
    !demoError &&
    !pyError;
  const channelContextAnalyzing =
    isDemo && (demoLoading || pyLoading || awaitingFirstChannelData);
  const channelContextError =
    isDemo && !channelContextAnalyzing && !!(demoError || pyError);
  const channelContextComplete = isDemo && !channelContextAnalyzing && !channelContextError;

  const growthScore = isDemo
    ? (demoData?.healthScore ?? (isEmbeddedProductDemo ? demoChannelData.growthScore : 0))
    : (dashboardOverview?.healthScore ?? 0);
  const growthScoreLabel = isDemo
    ? isEmbeddedProductDemo
      ? demoChannelData.growthScoreLabel
      : growthScore >= 70
        ? 'GOOD'
        : growthScore >= 50
          ? 'FAIR'
          : 'NEEDS WORK'
    : growthScore >= 70
      ? 'GOOD'
      : growthScore >= 50
        ? 'FAIR'
        : 'NEEDS WORK';
  const scoreAnimated = !isDemo || displayScore >= growthScore;

  useEffect(() => {
    setDisplayScore(0);
  }, [channelInput]);

  useEffect(() => {
    if (!isDemo || growthScore <= 0) return;
    const duration = 800;
    const start = performance.now();
    let rafId: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplayScore(Math.round(eased * growthScore));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isDemo, growthScore]);

  useEffect(() => {
    if (!isDemo) return;
    const input = (channelInput || '').trim();
    if (!input) return;

    let cancelled = false;
    setPyLoading(true);
    setPyError(null);
    publicApi
      .analyzeChannel(input, 30)
      .then((overview) => {
        if (cancelled) return;
        setPyOverview(overview);
      })
      .catch((err) => {
        if (cancelled) return;
        setPyOverview(null);
        setPyError(err instanceof Error ? err.message : 'Could not load channel data.');
      })
      .finally(() => {
        if (!cancelled) setPyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelInput, isDemo]);

  async function loadVideos(maxResults = 50) {
    const input = (channelInput || '').trim();
    if (!input) return null;
    setPyVideosLoading(true);
    setPyError(null);
    try {
      const videos = await publicApi.listVideos(input, maxResults);
      const list = (videos ?? []).filter((v) => v?.video_id);
      runnerVideosRef.current = list;
      runnerLoadedRef.current = list.length > 0;
      setPyVideos(videos ?? []);
      return list;
    } catch (err) {
      runnerVideosRef.current = [];
      runnerLoadedRef.current = false;
      setPyVideos(null);
      setPyError(err instanceof Error ? err.message : 'Could not load videos.');
      return null;
    } finally {
      setPyVideosLoading(false);
    }
  }

  const scoreExplanation = isDemo
    ? isEmbeddedProductDemo
      ? demoChannelData.scoreExplanation
      : demoData?.findings?.[0] ?? null
    : null;
  const hasMeaningfulMetrics = Boolean(
    demoData && (Number(demoData.subscriberCount) > 0 || Number(demoData.totalViews) > 0)
  );
  const subscribers = isDemo
    ? preferDemoSnapshotOverPy && demoData?.subscriberCount != null
      ? Number(demoData.subscriberCount)
      : (pyOverview?.channel_info?.subscriber_count ??
          (hasMeaningfulMetrics && demoData?.subscriberCount != null
            ? Number(demoData.subscriberCount)
            : isEmbeddedProductDemo
              ? demoChannelData.subscribers
              : 0))
    : 0;
  const totalViews = isDemo
    ? preferDemoSnapshotOverPy && demoData?.totalViews != null
      ? Number(demoData.totalViews)
      : (pyOverview?.channel_info?.view_count ??
          (hasMeaningfulMetrics && demoData?.totalViews != null
            ? Number(demoData.totalViews)
            : isEmbeddedProductDemo
              ? demoChannelData.totalViews
              : 0))
    : 0;
  const videoCount = isDemo
    ? preferDemoSnapshotOverPy && demoData?.videoCount != null
      ? Number(demoData.videoCount)
      : (pyOverview?.channel_info?.video_count ??
          (hasMeaningfulMetrics && demoData?.videoCount != null
            ? Number(demoData.videoCount)
            : isEmbeddedProductDemo
              ? demoChannelData.videos
              : 0))
    : 0;
  const avgEngagement = isDemo
    ? preferDemoSnapshotOverPy && demoData?.avgEngagement != null
      ? Number(demoData.avgEngagement)
      : (pyOverview?.video_performance?.avg_engagement_rate ??
          (hasMeaningfulMetrics && demoData?.avgEngagement != null
            ? Number(demoData.avgEngagement)
            : isEmbeddedProductDemo
              ? demoChannelData.avgEngagement
              : 0))
    : 0;
  const topVideosPaid = hasMeaningfulMetrics && demoData?.topVideos?.length ? (demoData.topVideos ?? []) : (demoData?.topVideos ?? []);
  const recommendations = isDemo
    ? [
        ...(preferDemoSnapshotOverPy
          ? (demoData?.previewRecommendations ?? (isEmbeddedProductDemo ? demoRecommendations : []))
          : (pyOverview?.recommendations ?? (isEmbeddedProductDemo ? demoRecommendations : [])))
      ]
    : [...(dashboardOverview?.topOpportunities ?? []), ...(dashboardOverview?.topIssues ?? [])];

  const whyProblemsList = isEmbeddedProductDemo
    ? [...demoDetectedProblems]
    : demoData?.findings?.length
      ? [...demoData.findings]
      : ['Channel analysis is loading…'];
  const whyOpportunitiesList = isEmbeddedProductDemo
    ? [...demoOpportunities]
    : demoData?.previewRecommendations?.length
      ? [...demoData.previewRecommendations]
      : ['Growth opportunities will appear after analysis completes.'];
  const previewRecommendationItems = isPreviewMode
    ? demoData?.previewRecommendations?.length
      ? [...demoData.previewRecommendations]
      : isEmbeddedProductDemo
        ? [...demoRecommendations]
        : []
    : [];
  const visiblePreviewRecommendations = previewRecommendationItems.slice(0, 2);
  const lockedPreviewRecommendations = previewRecommendationItems.slice(2);
  const visiblePreviewOpportunities = isPreviewMode ? whyOpportunitiesList.slice(0, 2) : [];
  const lockedPreviewOpportunities = isPreviewMode ? whyOpportunitiesList.slice(2) : [];
  const previewGatedModules = demoData?.gatedModules?.filter(Boolean) ?? [];

  const paidMetrics = dashboardOverview?.metrics ?? [];
  const statCards = isDemo
    ? [
        { label: 'Subscribers', value: formatNumber(subscribers) },
        { label: 'Total Views', value: formatNumber(totalViews) },
        { label: 'Videos', value: formatNumber(videoCount) },
        { label: 'Avg Engagement', value: `${avgEngagement.toFixed(2)}%` }
      ]
    : paidMetrics.slice(0, 4).map((m) => ({ label: m.label, value: m.value }));
  const statIcons = ['👥', '📺', '🎬', '💚'];
  const displayCards = statCards.length >= 4
    ? statCards.slice(0, 4)
    : [...statCards, ...Array.from({ length: 4 - statCards.length }, () => ({ label: '—', value: '—' }))];

  const previewSnapshotLoading =
    isPreviewMode && (demoLoading || pyLoading) && !pyOverview?.channel_info && demoData == null;
  const pvSub = preferDemoSnapshotOverPy
    ? (demoData?.subscriberCount ?? pyOverview?.channel_info?.subscriber_count)
    : (pyOverview?.channel_info?.subscriber_count ?? demoData?.subscriberCount);
  const pvViews = preferDemoSnapshotOverPy
    ? (demoData?.totalViews ?? pyOverview?.channel_info?.view_count)
    : (pyOverview?.channel_info?.view_count ?? demoData?.totalViews);
  const pvVideos = preferDemoSnapshotOverPy
    ? (demoData?.videoCount ?? pyOverview?.channel_info?.video_count)
    : (pyOverview?.channel_info?.video_count ?? demoData?.videoCount);
  const pvEng = preferDemoSnapshotOverPy
    ? (demoData?.avgEngagement ?? pyOverview?.video_performance?.avg_engagement_rate)
    : (pyOverview?.video_performance?.avg_engagement_rate ?? demoData?.avgEngagement);
  function previewMetricDisplay(n: number | null | undefined): string {
    if (previewSnapshotLoading && (n == null || (typeof n === 'number' && Number.isNaN(n)))) return '…';
    if (n == null || (typeof n === 'number' && Number.isNaN(n))) return '—';
    return formatNumber(Math.round(Number(n)));
  }
  const engN = pvEng != null ? Number(pvEng) : NaN;
  const previewEngStr =
    previewSnapshotLoading && pvEng == null
      ? '…'
      : Number.isNaN(engN)
        ? '—'
        : engN >= 0 && engN <= 1
          ? `${(engN * 100).toFixed(2)}%`
          : `${engN.toFixed(2)}%`;
  const snapshotStatCards = isPreviewMode
    ? [
        { label: 'Subscribers', value: previewMetricDisplay(pvSub != null ? Number(pvSub) : undefined) },
        { label: 'Total Views', value: previewMetricDisplay(pvViews != null ? Number(pvViews) : undefined) },
        { label: 'Videos', value: previewMetricDisplay(pvVideos != null ? Number(pvVideos) : undefined) },
        { label: 'Avg Engagement', value: previewEngStr }
      ]
    : null;

  function handleTabClick(tab: (typeof TABS)[number]) {
    setActiveTab(tab.id);
  }

  function appendRunnerLog(message: string) {
    setRunnerLog((prev) => [`[${new Date().toISOString()}] ${message}`, ...prev].slice(0, 50));
  }

  function ensureYouTubeIframeApi() {
    const w = window as any;
    if (w.YT && w.YT.Player) return;
    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (existing) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  function waitForYouTubePlayerCtor(maxMs = 20000): Promise<boolean> {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if ((window as any).YT?.Player) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxMs) {
          resolve(false);
          return;
        }
        window.setTimeout(tick, 150);
      };
      tick();
    });
  }

  useEffect(() => {
    if (isPreviewMode) return;
    const w = window as any;
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        setRunnerLog((prevLog) =>
          [`[${new Date().toISOString()}] YouTube IFrame API ready.`, ...prevLog].slice(0, 50)
        );
      } catch {
        // ignore
      }
      if (typeof prev === 'function') prev();
    };
    ensureYouTubeIframeApi();
    if (w.YT?.Player) {
      setRunnerLog((prevLog) =>
        [`[${new Date().toISOString()}] YouTube IFrame API ready.`, ...prevLog].slice(0, 50)
      );
    }
    return () => {
      w.onYouTubeIframeAPIReady = prev;
    };
  }, [isPreviewMode]);

  function getRunnerVideos() {
    if (runnerVideosRef.current.length) return runnerVideosRef.current;
    return (pyVideos ?? []).filter((v) => v && v.video_id);
  }

  function buildPlayOrder() {
    const list = getRunnerVideos();
    const pickedIndices = list
      .map((v, idx) => (runnerPickedRef.current[v.video_id] ? idx : -1))
      .filter((idx) => idx >= 0);
    const indices = pickedIndices.length ? pickedIndices : list.map((_, i) => i);
    if (!runnerShuffle) return indices;
    const shuffled = [...indices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async function runnerTestServer() {
    setRunnerServerStatus('Testing…');
    try {
      const resp = await publicApi.runnerPing();
      setRunnerServerStatus(resp.status === 'ok' ? 'OK' : 'Error');
      appendRunnerLog(resp.status === 'ok' ? 'Server ping OK.' : `Server ping error: ${resp.status}`);
    } catch (err) {
      setRunnerServerStatus('Offline');
      appendRunnerLog(`Server ping exception: ${err instanceof Error ? err.message : 'error'}`);
    }
  }

  function runnerDestroyYouTubePlayer() {
    try {
      const ref = (globalThis as any).__ybPlayerRef;
      const player = ref?.player;
      if (player && typeof player.destroy === 'function') player.destroy();
      if (ref) {
        ref.player = null;
        ref.creating = false;
        ref.videoId = null;
        ref.playToken = null;
      }
    } catch {
      // ignore
    }
  }

  function runnerCurrentVideo() {
    if (!runnerLoadedRef.current && !runnerLoaded) return null;
    const list = getRunnerVideos();
    const order = runnerPlayOrderRef.current.length ? runnerPlayOrderRef.current : buildPlayOrder();
    const idx = order.length ? order[Math.min(runnerIndex, order.length - 1)] : -1;
    return idx >= 0 ? list[idx] : null;
  }

  function runnerResetWatchTracking() {
    runnerWatchWallStartRef.current = null;
    runnerWatchStartPosRef.current = 0;
    runnerWatchLimitFiredRef.current = false;
    setRunnerWatchStartPos(0);
    setRunnerWatchLimitFired(false);
  }

  /** Start wall-clock once per clip. Do not reset on every PLAYING (rate changes / buffer cause replay events). */
  function runnerMarkWatchStarted() {
    if (runnerWatchWallStartRef.current == null) {
      runnerWatchWallStartRef.current = Date.now();
    }
    runnerWatchStartPosRef.current = 0;
    setRunnerWatchStartPos(0);
    setRunnerWatchLimitFired(false);
  }

  function runnerClearYouTubeWatchTimer() {
    if (runnerYouTubeWatchTimerRef.current != null) {
      window.clearTimeout(runnerYouTubeWatchTimerRef.current);
      runnerYouTubeWatchTimerRef.current = null;
    }
  }

  function runnerClearResumeTimer() {
    if (runnerResumeTimerRef.current != null) {
      window.clearTimeout(runnerResumeTimerRef.current);
      runnerResumeTimerRef.current = null;
    }
  }

  function runnerSeekVideoToStart(player: { seekTo?: (seconds: number, allowSeek: boolean) => void }) {
    try {
      if (typeof player.seekTo === 'function') {
        player.seekTo(0, true);
      }
    } catch {
      // ignore
    }
    runnerWatchStartPosRef.current = 0;
    setRunnerWatchStartPos(0);
  }

  function runnerPickPlaybackRate(player: any, desired: number): number {
    let rates: number[] = [1];
    try {
      if (typeof player.getAvailablePlaybackRates === 'function') {
        const available = player.getAvailablePlaybackRates();
        if (Array.isArray(available) && available.length) {
          rates = available.filter((r: unknown) => typeof r === 'number' && r > 0) as number[];
        }
      }
    } catch {
      // ignore
    }
    if (!rates.length) rates = [1];
    return rates.reduce((best, r) => (Math.abs(r - desired) < Math.abs(best - desired) ? r : best), rates[0]);
  }

  function runnerApplySpeed() {
    if (runnerPlayOnYouTubeRef.current) {
      setRunnerDesiredSpeed(1);
      setRunnerActualSpeed(1);
      return;
    }
    try {
      const player = (globalThis as any).__ybPlayerRef?.player;
      if (!player) return;
      const desired = runnerSpeedRef.current;
      const clamped = runnerPickPlaybackRate(player, desired);
      if (clamped !== desired && !runnerSpeedClampLoggedRef.current) {
        runnerSpeedClampLoggedRef.current = true;
        appendRunnerLog(
          `Playback rate ${desired}× not available for this video; using ${clamped}× (YouTube/embed limit).`
        );
      }
      const current = typeof player.getPlaybackRate === 'function' ? player.getPlaybackRate() : null;
      if (typeof player.setPlaybackRate === 'function' && current !== clamped) {
        player.setPlaybackRate(clamped);
      }
      const actual = typeof player.getPlaybackRate === 'function' ? player.getPlaybackRate() : clamped;
      setRunnerDesiredSpeed(desired);
      setRunnerActualSpeed(typeof actual === 'number' ? actual : clamped);
    } catch {
      // ignore
    }
  }

  function runnerFinishWatchLimit() {
    if (runnerWatchLimitFiredRef.current) return;
    runnerWatchLimitFiredRef.current = true;
    setRunnerWatchLimitFired(true);
    setRunnerSessionEnded((v) => v + 1);
    const limit = runnerWatchSecondsRef.current;
    runnerClearResumeTimer();

    // YouTube.com multi-tab: tabs stay open; just end the runner session timer.
    if (runnerPlayOnYouTubeRef.current) {
      appendRunnerLog(
        `Watch limit reached (${limit}s). YouTube tabs stay open — close them when done, or click Stop.`
      );
      setRunnerRunning(false);
      runnerRunningRef.current = false;
      setRunnerStatus('STOPPED');
      return;
    }

    const order = runnerPlayOrderRef.current.length ? runnerPlayOrderRef.current : buildPlayOrder();
    const action = order.length <= 1 ? 'Restarting' : 'Advancing';
    appendRunnerLog(`Watch limit reached (${limit}s). ${action}.`);
    try {
      const player = (globalThis as any).__ybPlayerRef?.player;
      if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
    } catch {
      // ignore
    }
    runnerAdvance();
  }

  function runnerMaybeApplyWatchLimit() {
    const limit = runnerWatchSecondsRef.current;
    if (limit <= 0 || runnerWatchLimitFiredRef.current) return;
    if (runnerWatchWallStartRef.current == null) return;
    const elapsed = (Date.now() - runnerWatchWallStartRef.current) / 1000;
    if (elapsed >= limit) {
      runnerFinishWatchLimit();
    }
  }

  function runnerScheduleYouTubeWatchLimit() {
    runnerClearYouTubeWatchTimer();
    const limit = runnerWatchSecondsRef.current;
    if (limit <= 0 || runnerWatchLimitFiredRef.current) return;
    runnerYouTubeWatchTimerRef.current = window.setTimeout(() => {
      runnerYouTubeWatchTimerRef.current = null;
      if (!runnerRunningRef.current) return;
      runnerFinishWatchLimit();
    }, limit * 1000);
  }

  function runnerCloseAllYouTubeWindows() {
    for (const win of runnerYouTubeWindowsRef.current) {
      try {
        if (win && !win.closed) win.close();
      } catch {
        // ignore
      }
    }
    runnerYouTubeWindowsRef.current = [];
  }

  function runnerYouTubePlayUrl(videoId: string): string {
    // youtube.com/watch ignores autoplay from other sites. Embed + mute autoplays reliably;
    // Open next tab (one click each) bypasses Chrome's one-popup-per-click limit.
    return (
      `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` +
      '?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1'
    );
  }

  function runnerMarkYtQueueItem(videoId: string, status: RunnerYtQueueItem['status']) {
    const next = runnerYtQueueRef.current.map((item) =>
      item.videoId === videoId ? { ...item, status } : item
    );
    runnerYtQueueRef.current = next;
    setRunnerYtQueue(next);
  }

  /** Open one player tab. Must run directly from a user click (popup gesture). */
  function runnerOpenOneYouTubeTab(videoId: string, title: string): Window | null {
    const url = runnerYouTubePlayUrl(videoId);
    const win = window.open(url, `yb_runner_${videoId}`);
    if (!win) {
      runnerMarkYtQueueItem(videoId, 'blocked');
      appendRunnerLog(`Popup blocked for "${title}". Click "Open next tab" (one click per video), or allow popups.`);
      return null;
    }
    runnerYouTubeWindowsRef.current = [...runnerYouTubeWindowsRef.current, win];
    runnerMarkYtQueueItem(videoId, 'opened');
    appendRunnerLog(`Opened player tab: ${title} (${videoId})`);
    try {
      win.focus();
    } catch {
      // ignore
    }
    return win;
  }

  /**
   * Build queue + try to open every selected video.
   * Chrome allows only ~1 window.open per click unless the site is allowed to show popups —
   * remaining items stay pending for "Open next tab".
   */
  function runnerBeginYouTubeQueue(): { opened: number; remaining: number; total: number } {
    const list = getRunnerVideos();
    const order = runnerPlayOrderRef.current.length ? runnerPlayOrderRef.current : buildPlayOrder();
    const queue: RunnerYtQueueItem[] = [];
    for (const idx of order) {
      const video = list[idx];
      if (!video?.video_id) continue;
      queue.push({ videoId: video.video_id, title: video.title || video.video_id, status: 'pending' });
    }
    if (!queue.length) {
      appendRunnerLog('No videos selected to open.');
      runnerYtQueueRef.current = [];
      setRunnerYtQueue([]);
      return { opened: 0, remaining: 0, total: 0 };
    }

    runnerCloseAllYouTubeWindows();
    runnerYtQueueRef.current = queue.map((q) => ({ ...q }));
    setRunnerYtQueue(runnerYtQueueRef.current);

    let opened = 0;
    for (const item of queue) {
      const win = runnerOpenOneYouTubeTab(item.videoId, item.title);
      if (win) opened += 1;
      // After the first failure, stop batching — further opens need a fresh user click.
      if (!win) break;
    }

    const remaining = runnerYtQueueRef.current.filter((q) => q.status !== 'opened').length;
    setRunnerSessionStarted(opened);
    setRunnerDesiredSpeed(1);
    setRunnerActualSpeed(1);
    setRunnerPosition(0);
    setRunnerIndex(0);
    runnerMarkWatchStarted();
    runnerScheduleYouTubeWatchLimit();

    if (opened && !remaining) {
      appendRunnerLog(`Opened all ${opened} player tabs with autoplay.`);
    } else if (opened && remaining) {
      appendRunnerLog(
        `Opened ${opened}/${queue.length} tabs. Browser blocked the rest — click "Open next tab" ${remaining} more time${remaining === 1 ? '' : 's'}.`
      );
    } else {
      appendRunnerLog(
        `Browser blocked popups. Click "Open next tab" for each of the ${queue.length} videos (required unless popups are allowed for this site).`
      );
    }
    return { opened, remaining, total: queue.length };
  }

  /** Open the next pending/blocked video — call only from a button click. */
  function runnerOpenNextYouTubeTab(): boolean {
    const next = runnerYtQueueRef.current.find((q) => q.status !== 'opened');
    if (!next) {
      appendRunnerLog('All selected videos already have a tab open.');
      return false;
    }
    const win = runnerOpenOneYouTubeTab(next.videoId, next.title);
    if (win) {
      setRunnerSessionStarted(runnerYtQueueRef.current.filter((q) => q.status === 'opened').length);
    }
    return !!win;
  }

  function runnerUpdatePosition() {
    try {
      const player = (globalThis as any).__ybPlayerRef?.player;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const pos = player.getCurrentTime();
      if (typeof pos === 'number' && !Number.isNaN(pos)) setRunnerPosition(pos);
    } catch {
      // ignore
    }
  }

  function runnerStopInternal() {
    runnerStartTokenRef.current += 1; // cancel any in-flight Start
    runnerClearYouTubeWatchTimer();
    runnerClearResumeTimer();
    setRunnerRunning(false);
    runnerRunningRef.current = false;
    setRunnerStatus('STOPPED');
    runnerWatchStartPosRef.current = 0;
    runnerWatchLimitFiredRef.current = false;
    setRunnerWatchStartPos(null);
    setRunnerWatchLimitFired(false);
    runnerDestroyYouTubePlayer();
    try {
      const ref = (globalThis as any).__ybPlayerRef;
      if (ref) {
        ref.videoId = null;
        ref.playToken = null;
      }
    } catch {
      // ignore
    }
    runnerCloseAllYouTubeWindows();
    runnerYtQueueRef.current = [];
    setRunnerYtQueue([]);
  }

  function runnerAdvance() {
    if (runnerPlayOnYouTubeRef.current) {
      const remaining = runnerYtQueueRef.current.filter((q) => q.status !== 'opened').length;
      if (remaining > 0) {
        appendRunnerLog(`Use "Open next tab" for the remaining ${remaining} video${remaining === 1 ? '' : 's'}.`);
      } else {
        appendRunnerLog('Skip: all selected YouTube player tabs are already open.');
      }
      return;
    }
    const order = runnerPlayOrderRef.current.length ? runnerPlayOrderRef.current : buildPlayOrder();
    if (!order.length) return;

    // One selected video: loop the same clip from 0 after each watch limit.
    if (order.length === 1) {
      setRunnerIndex(0);
      runnerPlayCurrent();
      return;
    }

    const next = (runnerIndex + 1) % order.length;
    // New shuffled order each full cycle when shuffle is on.
    if (next === 0 && runnerShuffle) {
      runnerPlayOrderRef.current = buildPlayOrder();
      setRunnerPlayOrder([...runnerPlayOrderRef.current]);
    }
    setRunnerIndex(next);
  }

  function runnerPlayCurrent() {
    const w = window as any;
    const video = runnerCurrentVideo();
    if (!video) {
      appendRunnerLog('No video to play.');
      return;
    }
    const videoId = video.video_id;
    const playToken = runnerStartTokenRef.current;
    appendRunnerLog(`Playing ${video.title} (${videoId})`);
    setRunnerSessionStarted((v) => v + 1);
    runnerClearResumeTimer();
    runnerResetWatchTracking();
    // New play session — allow reloading the same videoId (watch-limit loop).
    const loadSession = ++runnerLoadSessionRef.current;

    // YouTube.com multi-tab mode is started via runnerOpenAllSelectedOnYouTube() from Start.
    if (runnerPlayOnYouTubeRef.current) {
      return;
    }

    const origin =
      typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
    const playerVars: Record<string, number | string> = {
      autoplay: 1,
      controls: 1,
      enablejsapi: 1,
      rel: 0,
      playsinline: 1
    };
    if (origin) playerVars.origin = origin;

    const load = () => {
      if (playToken !== runnerStartTokenRef.current) return; // Start/Stop cancellation
      const ref = (globalThis as any).__ybPlayerRef as {
        player: any | null;
        videoId?: string | null;
        playToken?: number | null;
        creating?: boolean;
        loadSession?: number;
      };
      const existingPlayer = ref?.player;

      // Idempotent per playCurrent call — retries must not reload / seek mid-watch.
      if (ref.loadSession === loadSession) return;
      ref.loadSession = loadSession;
      ref.playToken = playToken;
      ref.videoId = videoId;

      if (existingPlayer && typeof existingPlayer.loadVideoById === 'function') {
        try {
          existingPlayer.loadVideoById({ videoId, startSeconds: 0 });
        } catch {
          try {
            existingPlayer.loadVideoById(videoId, 0);
          } catch {
            appendRunnerLog('loadVideoById failed; try Stop then Start.');
            ref.loadSession = undefined;
          }
        }
        setTimeout(() => {
          if (playToken !== runnerStartTokenRef.current) return; // canceled by Stop
          try {
            runnerSeekVideoToStart(existingPlayer);
            if (typeof existingPlayer.playVideo === 'function') existingPlayer.playVideo();
            runnerMarkWatchStarted();
          } catch {
            // autoplay may block
          }
          runnerApplySpeed();
          runnerUpdatePosition();
        }, 400);
        return;
      }

      if (!(w.YT && w.YT.Player)) {
        appendRunnerLog('YouTube IFrame API not ready yet.');
        ref.loadSession = undefined;
        return;
      }

      const host = document.getElementById('runner-player');
      if (!host) {
        appendRunnerLog('Player container #runner-player not in DOM.');
        ref.loadSession = undefined;
        return;
      }

      if (ref.creating) return;
      ref.creating = true;

      ref.player = new w.YT.Player('runner-player', {
        width: '100%',
        height: '100%',
        videoId,
        playerVars,
        events: {
          onReady: () => {
            ref.creating = false;
            if (playToken !== runnerStartTokenRef.current) return;
            runnerSeekVideoToStart(ref.player);
            try {
              if (typeof ref.player.playVideo === 'function') ref.player.playVideo();
            } catch {
              // autoplay may block
            }
            runnerApplySpeed();
          },
          onStateChange: (e: any) => {
            if (playToken !== runnerStartTokenRef.current) return;
            const state = e?.data;
            // PLAYING
            if (state === w.YT.PlayerState.PLAYING) {
              setRunnerStatus('RUNNING');
              runnerMarkWatchStarted();
              runnerApplySpeed();
              return;
            }
            // ENDED
            if (state === w.YT.PlayerState.ENDED) {
              setRunnerSessionEnded((v: number) => v + 1);
              runnerAdvance();
              return;
            }
            // Unexpected pause while runner is active — resume (rate/buffer quirks).
            if (state === w.YT.PlayerState.PAUSED) {
              if (!runnerRunningRef.current || runnerWatchLimitFiredRef.current) return;
              runnerClearResumeTimer();
              runnerResumeTimerRef.current = window.setTimeout(() => {
                runnerResumeTimerRef.current = null;
                if (playToken !== runnerStartTokenRef.current) return;
                if (!runnerRunningRef.current || runnerWatchLimitFiredRef.current) return;
                try {
                  const p = (globalThis as any).__ybPlayerRef?.player;
                  if (p && typeof p.playVideo === 'function') p.playVideo();
                } catch {
                  // ignore
                }
              }, 300);
            }
          },
          onError: (e: any) => {
            ref.creating = false;
            if (playToken !== runnerStartTokenRef.current) return;
            appendRunnerLog(`Player error code ${e?.data ?? 'unknown'} on ${videoId}. Skipping.`);
            runnerAdvance();
          }
        }
      });
    };

    load();
    // Only retry until a player exists — never re-call load once playback has started.
    window.setTimeout(() => {
      if (playToken !== runnerStartTokenRef.current) return;
      const ref = (globalThis as any).__ybPlayerRef;
      if (!ref?.player) {
        ref.loadSession = undefined;
        load();
      }
    }, 800);
    window.setTimeout(() => {
      if (playToken !== runnerStartTokenRef.current) return;
      const ref = (globalThis as any).__ybPlayerRef;
      if (!ref?.player) {
        ref.loadSession = undefined;
        load();
      }
    }, 2200);
  }

  // Runner ticking: wall-time + watch-seconds limit + position updates
  useEffect(() => {
    if (!runnerRunning) return;
    let lastTick = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;
      if (dt > 0 && dt < 10) {
        setRunnerSessionWallSeconds((v) => v + dt);
      }

      if (!runnerPlayOnYouTubeRef.current) {
        runnerUpdatePosition();
        runnerApplySpeed();
        runnerMaybeApplyWatchLimit();
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [runnerRunning]);

  // When index changes while running, play next (Start handles first play with suppress flag)
  useEffect(() => {
    if (!runnerRunning) return;
    if (suppressRunnerIndexEffectRef.current) {
      suppressRunnerIndexEffectRef.current = false;
      return;
    }
    runnerPlayCurrent();
  }, [runnerIndex]);

  function handleAnalyzeSeoFromTitle(title: string) {
    setSeoInput(title);
    setSeoResult(analyzeSeoLocally(title));
    setActiveTab('seo');
  }

  async function handleAnalyzeVideoSeoById(videoId: string) {
    const input = (channelInput || '').trim();
    if (!input) return;
    setActiveTab('seo');
    setSeoInput(videoId);
    setSeoResult(null);
    setPySeo(null);
    setPyError(null);
    try {
      const data = await publicApi.getVideoSeo(input, videoId);
      setPySeo(data);
    } catch (err) {
      setPySeo(null);
      setPyError(err instanceof Error ? err.message : 'Could not analyze SEO.');
    }
  }

  function handleAnalyzeSeo() {
    const raw = seoInput.trim();
    if (!raw) {
      setSeoResult(null);
      setPySeo(null);
      return;
    }
    const maybeId = extractYouTubeVideoId(raw);
    if (maybeId) {
      if (isDemo && isFullDemo) {
        void handleAnalyzeVideoSeoById(maybeId);
        return;
      }
      const match = isEmbeddedProductDemo ? demoVideos.find((v) => v.id === maybeId) : undefined;
      setSeoResult(analyzeSeoLocally(match?.title ?? raw));
      setPySeo(null);
      return;
    }
    setSeoResult(analyzeSeoLocally(raw));
    setPySeo(null);
  }

  async function handleCreateCheckout(email: string) {
    setCheckoutLoading(true);
    try {
      return await onCreateCheckout(channelInput, email);
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className={`page ${isDemo ? 'results-page' : 'dashboard-page'}`}>
      <header className="dashboard-header">
        <h1 className="dashboard-title">{isDemo ? `${BRAND.name} Dashboard` : dashboardTitle}</h1>

        {(channelInput.trim() || (!isDemo && contextDisplayName)) && (
          <div className="dashboard-channel-context" role="region" aria-label="Channel being analyzed">
            <div className="dashboard-channel-context-avatar" aria-hidden>
              {contextAvatarLetter}
            </div>
            <div className="dashboard-channel-context-body">
              <div className="dashboard-channel-context-row">
                {channelContextAnalyzing ? (
                  <span className="dashboard-channel-context-badge dashboard-channel-context-badge--loading">
                    Analyzing your channel…
                  </span>
                ) : channelContextError ? (
                  <span className="dashboard-channel-context-badge dashboard-channel-context-badge--warn">
                    Unable to load channel details — using provided URL.
                  </span>
                ) : isDemo && channelContextComplete ? (
                  <span className="dashboard-channel-context-badge dashboard-channel-context-badge--ok">
                    Analysis complete
                  </span>
                ) : !isDemo ? (
                  <span className="dashboard-channel-context-badge dashboard-channel-context-badge--ok">
                    Analysis complete
                  </span>
                ) : null}
              </div>
              <p className="dashboard-channel-context-label">
                {channelContextAnalyzing ? 'Analyzing channel' : 'Channel'}
              </p>
              <p className="dashboard-channel-context-name">{contextDisplayName}</p>
              <p className="dashboard-channel-context-handle">{contextHandle}</p>
              {channelPageUrl ? (
                <p className="dashboard-channel-context-url">
                  <a href={channelPageUrl} target="_blank" rel="noopener noreferrer">
                    {channelPageUrl}
                  </a>
                </p>
              ) : null}
              <p className="dashboard-channel-context-hint">
                AI insights below are based on this channel&apos;s content, titles, and performance patterns.
              </p>
            </div>
          </div>
        )}

        {isDemo && (
          <>
            {isFullDemo ? (
              <p className="dashboard-badge demo-badge">
                {premiumUnlocked ? 'Premium — full access' : 'Full demo — product showcase'}
              </p>
            ) : (
              <>
                <div className="dashboard-preview-banner">
                  <p className="dashboard-badge preview-badge">Preview Mode</p>
                  <p className="dashboard-preview-banner-text">
                    Unlock the full dashboard to see your real channel analytics and AI recommendations.
                  </p>
                  {previewGatedModules.length > 0 && (
                    <p className="dashboard-gated-modules-hint">
                      Full unlock adds: {previewGatedModules.join(' · ')}
                    </p>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('Overview')}>
                    Unlock Full Analysis
                  </button>
                </div>
                {previewFor && <p className="dashboard-preview-for">Preview for: <strong>{previewFor}</strong></p>}
              </>
            )}
          </>
        )}
        {!isDemo && <p className="dashboard-subtitle">Channel URL: <strong>{channelTitle}</strong></p>}
        {isDemo && premiumUnlocked && userEmail && (
          <div className="pill-row dashboard-actions">
            <span className="info-pill">Signed in as {userEmail}</span>
          </div>
        )}
        {!isDemo && userEmail && (
          <div className="pill-row dashboard-actions">
            <span className="info-pill">Signed in as {userEmail}</span>
            {onSignOut && (
              <button type="button" className="btn btn-secondary" onClick={onSignOut}>Sign out</button>
            )}
          </div>
        )}
        {isDemo && demoError && (
          <p className="dashboard-demo-error">{demoError}</p>
        )}
        {isDemo &&
          !paidChannelAudit &&
          !isEmbeddedProductDemo &&
          demoData != null &&
          !demoLoading &&
          !demoError &&
          Number(demoData.subscriberCount ?? 0) === 0 &&
          Number(demoData.totalViews ?? 0) === 0 && (
            <p className="dashboard-demo-error" role="status">
              YouTube did not return live stats for this channel (API key, quota, or resolution). The zeros below are
              placeholders — not your channel&apos;s real numbers. Fix the API configuration and refresh.
            </p>
          )}
        {isDemo && pyError && (
          <p className="dashboard-demo-error">{pyError}</p>
        )}
      </header>

      {isDemo && channelContextAnalyzing && (
        <DemoAnalysisLoadingPanel channelLabel={contextDisplayName} compact />
      )}

      <div className="dashboard-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview */}
      <div className={`tab-panel ${activeTab === 'overview' ? 'active' : ''}`}>
        {isPreviewMode && snapshotStatCards && (
          <section className="dashboard-section preview-channel-snapshot">
            <h2>Channel snapshot</h2>
            <p className="muted">
              Real subscriber, view, and catalog stats from YouTube. Everything below unlocks after purchase.
            </p>
            <div className="stats-grid stats-grid-snapshot">
              {snapshotStatCards.map((card, i) => (
                <div key={card.label} className="stat-card stat-card-snapshot">
                  <div className="stat-icon">{statIcons[i] ?? '📊'}</div>
                  <div className="stat-info">
                    <h3>{card.value}</h3>
                    <p>{card.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="growth-score-block" data-animated={scoreAnimated}>
          <h2 className="growth-score-title">Channel Growth Score</h2>
          {showLockedUI ? (
            <div className="preview-blur-wrap preview-growth-full-blur">
              <div className="preview-growth-blur-inner">
                <div className="growth-score-value" data-score={displayScore} aria-hidden>
                  {displayScore} <span className="growth-score-max">/ 100</span>
                </div>
                <span className="growth-score-label">{growthScoreLabel}</span>
                {isDemo && isEmbeddedProductDemo && demoChannelData.scoreFactors && (
                  <div className="growth-score-factors">
                    {demoChannelData.scoreFactors.map((f) => (
                      <span key={f.label} className="growth-score-factor">
                        {f.label}: {f.score}
                      </span>
                    ))}
                  </div>
                )}
                {scoreExplanation && <p className="growth-score-explanation">{scoreExplanation}</p>}
              </div>
              <div
                className="preview-blur-overlay"
                onClick={() => setPaywallFeature('Overview')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Overview')}
              >
                <span className="preview-blur-copy">Unlock full score &amp; breakdown</span>
              </div>
            </div>
          ) : (
            <>
              <div className="growth-score-value" data-score={isDemo ? displayScore : growthScore}>
                {isDemo ? displayScore : growthScore} <span className="growth-score-max">/ 100</span>
              </div>
              <span className="growth-score-label">{growthScoreLabel}</span>
              {isDemo && isEmbeddedProductDemo && demoChannelData.scoreFactors && (
                <div className="growth-score-factors">
                  {demoChannelData.scoreFactors.map((f) => (
                    <span key={f.label} className="growth-score-factor">
                      {f.label}: {f.score}
                    </span>
                  ))}
                </div>
              )}
              {scoreExplanation && <p className="growth-score-explanation">{scoreExplanation}</p>}
            </>
          )}
        </div>

        {!isPreviewMode && (
          <div className="stats-grid">
            {displayCards.map((card, i) => (
              <div key={i} className="stat-card">
                <div className="stat-icon">{statIcons[i] ?? '📊'}</div>
                <div className="stat-info">
                  <h3>{card.value}</h3>
                  <p>{card.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <section className="dashboard-section">
          <h2>⭐ Top Performing Videos</h2>
          {showLockedUI ? (
            <div className="video-list preview-blur-wrap">
              <div className="video-list-inner">
                {(isEmbeddedProductDemo ? demoTopVideos.slice(0, 5) : [{ key: 'ph', title: 'Your channel’s top videos', viewCount: 0, tag: '' as const }]).map((v) => (
                  <div key={v.key} className="video-card">
                    <div className="video-card-title">{v.title}</div>
                    <div className="video-card-meta">{isEmbeddedProductDemo ? `${formatNumber(v.viewCount)} views` : 'Shown after analysis'}</div>
                  </div>
                ))}
              </div>
              <div className="preview-blur-overlay" onClick={() => setPaywallFeature('Overview')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Overview')}>
                <span className="preview-blur-copy">Unlock full AI channel analysis</span>
              </div>
            </div>
          ) : (
          <div className="video-list">
            {isDemo && isFullDemo && pyOverview?.video_performance?.top_videos_by_views?.length ? (
              pyOverview.video_performance.top_videos_by_views.map((v) => (
                <div key={v.video_id} className="video-card">
                  <div className="video-card-title">{v.title}</div>
                  <div className="video-card-meta">
                    👁️ {formatNumber(v.view_count)} views · 📝 Video ID: {v.video_id}
                  </div>
                </div>
              ))
            ) : isDemo && demoData != null && hasMeaningfulMetrics ? (
              topVideosPaid.length > 0 ? (
                topVideosPaid.map((v) => (
                  <div key={v.videoId} className="video-card">
                    <div className="video-card-title">{v.title}</div>
                    <div className="video-card-meta">{formatNumber(v.viewCount)} views</div>
                  </div>
                ))
              ) : (
                <p className="muted">No videos in this view.</p>
              )
            ) : isDemo && isEmbeddedProductDemo ? (
              demoTopVideos.map((v) => (
                <div key={v.key} className="video-card">
                  <div className="video-card-title">{v.title}</div>
                  <div className="video-card-meta">
                    {formatNumber(v.viewCount)} views
                    {v.tag ? <span className="video-card-tag"> · {v.tag}</span> : null}
                  </div>
                </div>
              ))
            ) : isDemo ? (
              <p className="muted">
                {demoLoading || pyLoading
                  ? 'Loading videos for this channel…'
                  : demoError || pyError
                    ? 'Could not load video list. Check the URL and try again.'
                    : 'No preview videos yet. Open the Videos tab and click Refresh, or wait for analysis to finish.'}
              </p>
            ) : topVideosPaid.length > 0 ? (
              topVideosPaid.map((v) => (
                <div key={v.videoId} className="video-card">
                  <div className="video-card-title">{v.title}</div>
                  <div className="video-card-meta">{formatNumber(v.viewCount)} views</div>
                </div>
              ))
            ) : (
              <p className="muted">No video data in this view. Unlock full access for your full library.</p>
            )}
          </div>
          )}
        </section>

        {(isDemo && (isFullDemo || isPreviewMode)) && (
          <>
            <section className="dashboard-section why-score-section">
              <h2>Why this score</h2>
              {isPreviewMode ? (
                <>
                  <div className="ai-insights-grid preview-insights-unlocked">
                    <div className="ai-insights-column">
                      <h3 className="dashboard-section-h3">Detected problems</h3>
                      <ul className="feature-list">
                        {whyProblemsList.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="ai-insights-column">
                      <h3 className="dashboard-section-h3">Top opportunities</h3>
                      <ul className="feature-list">
                        {visiblePreviewOpportunities.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {lockedPreviewOpportunities.length > 0 && (
                    <div className="preview-blur-wrap preview-partial-blur">
                      <ul className="feature-list preview-growth-blur-inner">
                        {lockedPreviewOpportunities.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                      <div
                        className="preview-blur-overlay"
                        onClick={() => setPaywallFeature('Overview')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Overview')}
                      >
                        <span className="preview-blur-copy">Unlock more opportunities</span>
                      </div>
                    </div>
                  )}
                  {previewGatedModules.length > 0 && (
                    <p className="muted dashboard-gated-modules-footnote">
                      Premium modules: {previewGatedModules.join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <div className="ai-insights-grid">
                  <div className="ai-insights-column">
                    <h3 className="dashboard-section-h3">Detected problems</h3>
                    <ul className="feature-list">
                      {whyProblemsList.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="ai-insights-column">
                    <h3 className="dashboard-section-h3">Top opportunities</h3>
                    <ul className="feature-list">
                      {whyOpportunitiesList.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
            {isPreviewMode && (
              <section className="dashboard-section conversion-bar">
                <h2 className="conversion-bar-title">See why your channel isn’t growing</h2>
                <p className="conversion-bar-sub">
                  Start with the free preview. Upgrade only if you want the full channel audit, recommendations, and growth plan.
                </p>
                <div className="conversion-bar-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('Overview')}>
                    Get My Full Growth Fix — {oneTimePriceLabel}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('videos')}>
                    Keep Exploring Demo
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        <section className="dashboard-section">
          <h2>Recommendations</h2>
          {isPreviewMode ? (
            <>
              {visiblePreviewRecommendations.length > 0 ? (
                <ul className="feature-list preview-recommendations-visible">
                  {visiblePreviewRecommendations.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Recommendations for your channel unlock after purchase.</p>
              )}
              {lockedPreviewRecommendations.length > 0 && (
                <div className="preview-blur-wrap preview-partial-blur">
                  <ul className="feature-list preview-growth-blur-inner">
                    {lockedPreviewRecommendations.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <div
                    className="preview-blur-overlay"
                    onClick={() => setPaywallFeature('Overview')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Overview')}
                  >
                    <span className="preview-blur-copy">Unlock recommendations tailored to your channel</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <ul className="feature-list">
              {recommendations.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
              {recommendations.length === 0 && (
                <li className="muted">No recommendations available.</li>
              )}
            </ul>
          )}
        </section>
      </div>

        {/* Videos */}
      <div className={`tab-panel ${activeTab === 'videos' ? 'active' : ''}`}>
        <section className="dashboard-section">
          <h2>Your Videos</h2>
          {isPreviewMode && (
            <p className="muted preview-tab-desc">
              Full catalog with views, engagement, publish dates, and per-video SEO — unlock after purchase.
            </p>
          )}
          {!isPreviewMode && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void loadVideos(50)}
              style={{ marginBottom: 12 }}
              disabled={pyVideosLoading}
            >
              {pyVideosLoading ? 'Loading…' : 'Refresh Videos'}
            </button>
          )}
          {isPreviewMode ? (
            <div className="preview-blur-wrap preview-tab-panel-blur">
              <div className="video-list locked-content-blur">
                {(isEmbeddedProductDemo ? demoVideos.slice(0, 8) : [{ id: 'ph', title: 'Your videos load here after unlock', views: 0, likes: 0, comments: 0, publishDate: '—' }]).map((v) => (
                  <div key={v.id} className="video-card video-card-with-action">
                    <div className="video-card-main">
                      <div className="video-card-title">{v.title}</div>
                      <div className="video-card-meta">
                        {isEmbeddedProductDemo ? (
                          <>
                            {v.views} views · {v.likes} likes · {v.comments} comment{v.comments !== 1 ? 's' : ''} · Published{' '}
                            {v.publishDate}
                          </>
                        ) : (
                          'Preview placeholder — not the product demo channel'
                        )}
                      </div>
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm video-card-action" disabled>
                      Analyze SEO
                    </button>
                  </div>
                ))}
              </div>
              <div
                className="preview-blur-overlay"
                onClick={() => setPaywallFeature('Videos')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Videos')}
              >
                <span className="preview-blur-copy">Unlock your full video library</span>
              </div>
            </div>
          ) : (
            <div className="video-list">
              {pyVideos ? (
                pyVideos.map((v) => (
                  <div key={v.video_id} className="video-card video-card-with-action">
                    <div className="video-card-main">
                      <div className="video-card-title">{v.title}</div>
                      <div className="video-card-meta">
                        👁️ {formatNumber(v.view_count)} views · 👍 {formatNumber(v.like_count)} likes · 💬{' '}
                        {formatNumber(v.comment_count)} comments · Published {new Date(v.published_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm video-card-action"
                      onClick={() => handleAnalyzeVideoSeoById(v.video_id)}
                    >
                      Analyze SEO
                    </button>
                  </div>
                ))
              ) : isDemo && isEmbeddedProductDemo ? (
                demoVideos.map((v) => (
                  <div key={v.id} className="video-card video-card-with-action">
                    <div className="video-card-main">
                      <div className="video-card-title">{v.title}</div>
                      <div className="video-card-meta">
                        {v.views} views · {v.likes} likes · {v.comments} comment{v.comments !== 1 ? 's' : ''} · Published{' '}
                        {v.publishDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm video-card-action"
                      onClick={() => handleAnalyzeSeoFromTitle(v.title)}
                    >
                      Analyze SEO
                    </button>
                  </div>
                ))
              ) : isDemo ? (
                <p className="muted">Click “Refresh Videos” to load this channel’s library from YouTube.</p>
              ) : topVideosPaid.length > 0 ? (
                topVideosPaid.map((v) => (
                  <div key={v.videoId} className="video-card">
                    <div className="video-card-title">{v.title}</div>
                    <div className="video-card-meta">{formatNumber(v.viewCount)} views</div>
                  </div>
                ))
              ) : (
                <p className="muted">Unlock full access to see and manage all videos.</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Suggestions */}
      <div className={`tab-panel ${activeTab === 'suggestions' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <section className="dashboard-section">
            <h2>Suggestions</h2>
            <p className="muted preview-tab-desc">
              Content ideas from your winners and whitespace — generated for your channel after purchase.
            </p>
            <div className="preview-blur-wrap preview-tab-panel-blur">
              <div className="locked-content-blur">
                <h3 className="dashboard-section-h3">Ideas based on your catalog</h3>
                <ul className="feature-list">
                  {(isEmbeddedProductDemo ? demoSuggestions : ['Ideas tailored to your catalog unlock after purchase.']).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div
                className="preview-blur-overlay"
                onClick={() => setPaywallFeature('Suggestions')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Suggestions')}
              >
                <span className="preview-blur-copy">Unlock AI content suggestions</span>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPaywallFeature('Suggestions')}>
              Unlock suggestions
            </button>
          </section>
        ) : !isPreviewMode ? (
          <section className="dashboard-section">
            <h2>Content Ideas</h2>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                setSuggestionsLoaded(true);
                setPyError(null);
                try {
                  const data = await publicApi.getSuggestions(channelInput, 10);
                  setPySuggestions(data);
                } catch (err) {
                  setPySuggestions(null);
                  setPyError(err instanceof Error ? err.message : 'Could not load suggestions.');
                }
              }}
              style={{ marginBottom: 12 }}
            >
              Get Suggestions
            </button>
            {suggestionsLoaded ? (
              <>
                <h3 className="dashboard-section-h3">Top Performing Videos</h3>
                <div className="video-list">
                  {(pySuggestions?.top_performers?.length ? pySuggestions.top_performers : []).map((v) => (
                    <div key={v.video_id} className="video-card">
                      <div className="video-card-title">{v.title}</div>
                      <div className="video-card-meta">
                        {formatNumber(v.views)} views · {formatNumber(v.engagement)} engagement
                      </div>
                    </div>
                  ))}
                  {!pySuggestions?.top_performers?.length &&
                    isEmbeddedProductDemo &&
                    demoTopVideos.slice(0, 10).map((v) => (
                    <div key={v.key} className="video-card">
                      <div className="video-card-title">{v.title}</div>
                      <div className="video-card-meta">{formatNumber(v.viewCount)} views</div>
                    </div>
                  ))}
                  {!pySuggestions?.top_performers?.length && !isEmbeddedProductDemo && (
                    <p className="muted">No suggestions yet — check that the channel URL is correct.</p>
                  )}
                </div>
                <h3 className="dashboard-section-h3" style={{ marginTop: 18 }}>Content ideas</h3>
                <ul className="feature-list">
                  {(pySuggestions?.content_suggestions?.length
                    ? pySuggestions.content_suggestions
                    : isEmbeddedProductDemo
                      ? demoSuggestions
                      : []
                  ).map((s, i) => (
                    <li key={`${s}-${i}`}>{s}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Click “Get Suggestions” to generate ideas based on recent winners.</p>
            )}
          </section>
        ) : (
          <section className="dashboard-section">
            <h2>Content ideas</h2>
            <p className="muted">Use your connected channel to see AI content suggestions here.</p>
          </section>
        )}
      </div>

      {/* SEO Optimizer */}
      <div className={`tab-panel ${activeTab === 'seo' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <section className="dashboard-section">
            <h2>SEO Optimizer</h2>
            <p className="muted preview-tab-desc">
              Title, description, and tag analysis on any video — fix CTR and search visibility after unlock.
            </p>
            <div className="preview-blur-wrap preview-tab-panel-blur">
              <div className="locked-content-blur">
                {isEmbeddedProductDemo ? (
                  <>
                    <p className="video-card-title">{demoSeoAnalysis.title}</p>
                    <p className="seo-score">
                      SEO Score: {demoSeoAnalysis.score} / {demoSeoAnalysis.maxScore}
                    </p>
                    <h3 className="dashboard-section-h3">Issues</h3>
                    <ul className="feature-list">
                      {demoSeoAnalysis.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                    <h3 className="dashboard-section-h3">Recommendations</h3>
                    <ul className="feature-list">
                      {demoSeoAnalysis.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="muted">SEO analysis for your pasted channel unlocks here after purchase.</p>
                )}
              </div>
              <div
                className="preview-blur-overlay"
                onClick={() => setPaywallFeature('SEO Optimizer')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('SEO Optimizer')}
              >
                <span className="preview-blur-copy">Unlock SEO optimizer</span>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPaywallFeature('SEO Optimizer')}>
              Unlock SEO tools
            </button>
          </section>
        ) : !isPreviewMode ? (
          <section className="dashboard-section">
            <h2>SEO Optimizer</h2>
            <div className="pill-row" style={{ marginBottom: 10 }}>
              <input
                value={seoInput}
                onChange={(e) => setSeoInput(e.target.value)}
                placeholder="Enter YouTube video title, ID, or URL"
                style={{ flex: 1, minWidth: 240 }}
              />
              <button type="button" className="btn btn-primary" onClick={handleAnalyzeSeo}>
                Analyze SEO
              </button>
            </div>
            {pySeo ? (
              <>
                <h2>{pySeo.video_title}</h2>
                <div className={`seo-score ${pySeo.seo_score.rating}`}>{pySeo.seo_score.score}/100</div>
                <p style={{ textAlign: 'center', fontSize: '1.1em', marginBottom: 18 }}>{pySeo.seo_score.rating.toUpperCase()}</p>

                {pySeo.seo_score.issues?.length ? (
                  <>
                    <h3 className="dashboard-section-h3">⚠️ Issues to Fix</h3>
                    <ul className="feature-list">
                      {pySeo.seo_score.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <h3 className="dashboard-section-h3">📝 Title Analysis ({pySeo.title_analysis.current_length} characters)</h3>
                <ul className="feature-list">
                  {pySeo.title_analysis.suggestions.map((s, i) => (
                    <li key={`${s.message}-${i}`}>
                      <strong>[{s.priority.toUpperCase()}]</strong> {s.message}
                    </li>
                  ))}
                </ul>

                {pySeo.title_analysis.optimized_examples?.length ? (
                  <>
                    <h3 className="dashboard-section-h3">Suggested Titles</h3>
                    <ul className="feature-list">
                      {pySeo.title_analysis.optimized_examples.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                <h3 className="dashboard-section-h3">📄 Description Analysis ({pySeo.description_analysis.word_count} words)</h3>
                <ul className="feature-list">
                  {pySeo.description_analysis.suggestions.map((s, i) => (
                    <li key={`${s.message}-${i}`}>
                      <strong>[{s.priority.toUpperCase()}]</strong> {s.message}
                    </li>
                  ))}
                </ul>

                <h3 className="dashboard-section-h3">🏷️ Tags</h3>
                <p><strong>Current:</strong> <span className="tags-current">{pySeo.current_tags.length ? pySeo.current_tags.join(', ') : '—'}</span></p>
                <p><strong>Suggested:</strong> <span className="tags-suggested">{pySeo.suggested_tags.length ? pySeo.suggested_tags.join(', ') : '—'}</span></p>
                {pySeo.current_tags.length > 0 && pySeo.suggested_tags.length > 0 && (
                  <p className="tags-hint muted">Suggested list is optimized (topic + title + generic first, 10–15 tags). Replace or merge with current as needed.</p>
                )}
              </>
            ) : seoResult ? (
              <>
                <p className="video-card-title">{seoResult.title}</p>
                <p className="seo-score">SEO Score: {seoResult.score} / 100</p>
                {seoResult.issues.length > 0 && (
                  <>
                    <h3 className="dashboard-section-h3">Issues</h3>
                    <ul className="feature-list">
                      {seoResult.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </>
                )}
                <h3 className="dashboard-section-h3">Recommendations</h3>
                <ul className="feature-list">
                  {seoResult.recommendations.length > 0 ? seoResult.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  )) : <li>No major issues detected. Consider testing a stronger hook.</li>}
                </ul>
                <h3 className="dashboard-section-h3">Suggested titles</h3>
                <ul className="feature-list">
                  {seoResult.suggestedTitles.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="muted">
                  {isEmbeddedProductDemo
                    ? 'Try analyzing one of the demo videos, or paste a YouTube URL.'
                    : 'Paste a video URL or ID from the channel you are analyzing.'}
                </p>
                {isEmbeddedProductDemo && (
                  <div className="status-card" style={{ marginTop: 12 }}>
                    <strong>Example analysis</strong>
                    <p className="video-card-title">{demoSeoAnalysis.title}</p>
                    <p className="seo-score">SEO Score: {demoSeoAnalysis.score} / {demoSeoAnalysis.maxScore}</p>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="dashboard-section">
            <h2>SEO Optimizer</h2>
            <p className="muted">Enter a video ID or URL to analyze SEO and get title suggestions.</p>
          </section>
        )}
      </div>

      {/* Traffic Tools */}
      <div className={`tab-panel ${activeTab === 'traffic' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <section className="dashboard-section">
            <h2>Traffic Tools</h2>
            <p className="muted preview-tab-desc">
              Which videos to promote, reshare, and double down on — tailored to your channel after checkout.
            </p>
            <div className="preview-blur-wrap preview-tab-panel-blur">
              <div className="locked-content-blur">
                <div className="traffic-demo-cards">
                  {isEmbeddedProductDemo ? (
                    <>
                      <div className="traffic-demo-card">
                        <h3 className="dashboard-section-h3">Best video to promote</h3>
                        <p className="video-card-title">{demoTrafficTools.bestVideoToPromote}</p>
                        <p className="traffic-engagement">Engagement: {demoTrafficTools.engagement}%</p>
                      </div>
                      <div className="traffic-demo-card">
                        <h3 className="dashboard-section-h3">Proven video to reshare</h3>
                        <p className="video-card-title">{demoTrafficTools.provenVideoToReshare.title}</p>
                        <p className="traffic-engagement">{formatNumber(demoTrafficTools.provenVideoToReshare.views)} views</p>
                      </div>
                    </>
                  ) : (
                    <p className="muted">Promotion picks for your channel appear here after unlock.</p>
                  )}
                </div>
              </div>
              <div
                className="preview-blur-overlay"
                onClick={() => setPaywallFeature('Traffic Tools')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Traffic Tools')}
              >
                <span className="preview-blur-copy">Unlock traffic tools</span>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPaywallFeature('Traffic Tools')}>
              Unlock traffic insights
            </button>
          </section>
        ) : !isPreviewMode ? (
          <section className="dashboard-section">
            <h2>Traffic Tools</h2>
            <p className="muted">
              Use these tools to drive real traffic to standard YouTube watch pages. The goal is to promote the right videos and make sharing easy.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                setTrafficLoaded(true);
                setPyError(null);
                try {
                  const data = await publicApi.getTrafficTools(channelInput);
                  setPyTraffic(data);
                } catch (err) {
                  setPyTraffic(null);
                  setPyError(err instanceof Error ? err.message : 'Could not load traffic tools.');
                }
              }}
              style={{ marginBottom: 12 }}
            >
              Refresh Traffic Tools
            </button>
            {trafficLoaded ? (
              <>
                <div className="traffic-demo-cards">
                  <div className="traffic-demo-card">
                    <h3 className="dashboard-section-h3">Best Videos to Promote Next</h3>
                    {(pyTraffic?.promotion_candidates ?? []).slice(0, 5).map((v) => (
                      <div key={v.video_id} className="video-card" style={{ marginTop: 10 }}>
                        <div className="video-card-title">{v.title}</div>
                        <p className="muted" style={{ marginTop: 6 }}>{v.reason}</p>
                        <div className="video-card-meta">
                          👁️ {formatNumber(v.view_count)} views · 👍 {formatNumber(v.like_count)} likes · 💬 {formatNumber(v.comment_count)} comments · {v.engagement_rate.toFixed(2)}% engagement
                        </div>
                        <div className="pill-row" style={{ marginTop: 10 }}>
                          <a className="btn btn-secondary" href={v.watch_url || `https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer">Open on YouTube</a>
                          <button type="button" className="btn btn-secondary" onClick={async () => {
                            const url = v.watch_url || `https://www.youtube.com/watch?v=${v.video_id}`;
                            if (await copyToClipboard(url)) { setCopyFeedbackId(`link-${v.video_id}`); setTimeout(() => setCopyFeedbackId(null), 1500); }
                          }}>
                            {copyFeedbackId === `link-${v.video_id}` ? 'Copied!' : 'Copy Link'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={async () => {
                            const text = v.share_text || `${v.title || 'Video'} ${v.watch_url || `https://www.youtube.com/watch?v=${v.video_id}`}`;
                            if (await copyToClipboard(text)) { setCopyFeedbackId(`share-${v.video_id}`); setTimeout(() => setCopyFeedbackId(null), 1500); }
                          }}>
                            {copyFeedbackId === `share-${v.video_id}` ? 'Copied!' : 'Copy Share Text'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => handleAnalyzeVideoSeoById(v.video_id)}>
                            Analyze SEO
                          </button>
                        </div>
                      </div>
                    ))}
                    {!pyTraffic?.promotion_candidates?.length && (
                      <p className="muted">No promotion candidates available yet.</p>
                    )}
                  </div>
                  <div className="traffic-demo-card">
                    <h3 className="dashboard-section-h3">Proven Videos to Reshare</h3>
                    {(pyTraffic?.top_performers ?? []).slice(0, 5).map((v) => (
                      <div key={v.video_id} className="video-card" style={{ marginTop: 10 }}>
                        <div className="video-card-title">{v.title}</div>
                        <p className="muted" style={{ marginTop: 6 }}>{v.reason}</p>
                        <div className="video-card-meta">
                          👁️ {formatNumber(v.view_count)} views · 👍 {formatNumber(v.like_count)} likes · 💬 {formatNumber(v.comment_count)} comments · {v.engagement_rate.toFixed(2)}% engagement
                        </div>
                        <div className="pill-row" style={{ marginTop: 10 }}>
                          <a className="btn btn-secondary" href={v.watch_url || `https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer">Open on YouTube</a>
                          <button type="button" className="btn btn-secondary" onClick={async () => {
                            const url = v.watch_url || `https://www.youtube.com/watch?v=${v.video_id}`;
                            if (await copyToClipboard(url)) { setCopyFeedbackId(`link-${v.video_id}`); setTimeout(() => setCopyFeedbackId(null), 1500); }
                          }}>
                            {copyFeedbackId === `link-${v.video_id}` ? 'Copied!' : 'Copy Link'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={async () => {
                            const text = v.share_text || `${v.title || 'Video'} ${v.watch_url || `https://www.youtube.com/watch?v=${v.video_id}`}`;
                            if (await copyToClipboard(text)) { setCopyFeedbackId(`share-${v.video_id}`); setTimeout(() => setCopyFeedbackId(null), 1500); }
                          }}>
                            {copyFeedbackId === `share-${v.video_id}` ? 'Copied!' : 'Copy Share Text'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => handleAnalyzeVideoSeoById(v.video_id)}>
                            Analyze SEO
                          </button>
                        </div>
                      </div>
                    ))}
                    {!pyTraffic?.top_performers?.length && (
                      <p className="muted">No top performers available yet.</p>
                    )}
                  </div>
                </div>
                <div className="section-grid" style={{ marginTop: 16 }}>
                  <div className="surface">
                    <h3 className="dashboard-section-h3">Legitimate Traffic Checklist</h3>
                    <ul className="feature-list">
                      {(pyTraffic?.checklist ?? []).map((item) => (
                        <li key={item.title}><strong>{item.title}</strong>: {item.details}</li>
                      ))}
                    </ul>
                    {!pyTraffic?.checklist?.length && <p className="muted">No checklist items available yet.</p>}
                  </div>
                  <div className="surface">
                    <h3 className="dashboard-section-h3">Follow-up Content Ideas</h3>
                    <ul className="feature-list">
                      {(pyTraffic?.content_suggestions ?? (isEmbeddedProductDemo ? demoSuggestions : [])).slice(0, 10).map((idea) => (
                        <li key={idea}>{idea}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Click “Refresh Traffic Tools” to generate promotion and reshare picks.</p>
            )}
          </section>
        ) : (
          <section className="dashboard-section">
            <h2>Traffic tools</h2>
            <p className="muted">Promotion lists, reshare suggestions, and traffic checklists appear here.</p>
          </section>
        )}
      </div>

      {/* Continuous Runner */}
      <div className={`tab-panel ${activeTab === 'runner' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <section className="dashboard-section">
            <h2>Continuous Runner</h2>
            <p className="muted preview-tab-desc">
              Review uploads in sequence, adjust speed, flag issues — playback and logging unlock after purchase.
            </p>
            <div className="preview-blur-wrap preview-tab-panel-blur">
              <div className="locked-content-blur">
                <div className="surface" style={{ padding: 18 }}>
                  <div className="pill-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <span className="info-pill">Speed · Watch limit · Shuffle</span>
                    <button type="button" className="btn btn-primary" disabled>
                      Start
                    </button>
                    <button type="button" className="btn btn-secondary" disabled>
                      Load Videos
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 16,
                      aspectRatio: '16/9',
                      borderRadius: 12,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  />
                  <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                    Video picker · runner log · mark issues
                  </p>
                </div>
              </div>
              <div
                className="preview-blur-overlay"
                onClick={() => setPaywallFeature('Continuous Runner')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Continuous Runner')}
              >
                <span className="preview-blur-copy">Unlock Continuous Runner</span>
              </div>
            </div>
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPaywallFeature('Continuous Runner')}>
              Unlock runner
            </button>
          </section>
        ) : !isPreviewMode ? (
          <section className="dashboard-section">
            <h2>Continuous Runner</h2>
            <p className="muted">
              Review and test your content — play through videos, use speed/shuffle to scan, and mark issues.
            </p>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              <strong>Views &amp; watch time:</strong> By default, videos play in the embedded player below. Enable{' '}
              <strong>Play on YouTube tabs</strong> and click Start — each selected video opens in its own tab and
              autoplays (starts muted; click unmute for sound). Chrome only allows one new tab per click unless you
              allow popups; use <strong>Open next tab</strong> for the rest (one click each).
            </p>
            <div className="surface" style={{ padding: 18, marginTop: 14 }}>
              <div className="pill-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <label className="info-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={runnerPlayOnYouTube}
                    onChange={(e) => {
                      setRunnerPlayOnYouTube(e.target.checked);
                      if (e.target.checked) setRunnerSpeed(1);
                    }}
                  />
                  Play on YouTube tabs (autoplay each selected)
                </label>
                <label className="info-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Speed (embed max usually 2×)
                  <input
                    type="number"
                    min={0.25}
                    max={2}
                    step={0.25}
                    value={runnerPlayOnYouTube ? 1 : runnerSpeed}
                    disabled={runnerPlayOnYouTube}
                    onChange={(e) => setRunnerSpeed(Math.min(2, Math.max(0.25, Number(e.target.value) || 1)))}
                    style={{ width: 90 }}
                  />
                </label>
                <label className="info-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Watch seconds (0 = full, wall clock)
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    step={1}
                    value={runnerWatchSeconds}
                    onChange={(e) => setRunnerWatchSeconds(Number(e.target.value) || 0)}
                    style={{ width: 110 }}
                  />
                </label>
                <label className="info-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={runnerShuffle} onChange={(e) => setRunnerShuffle(e.target.checked)} />
                  Shuffle
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={pyVideosLoading}
                  onClick={async () => {
                    const v = await loadVideos(200);
                    if (!v?.length) {
                      appendRunnerLog('No videos found for this channel. Check URL/handle and try again.');
                      runnerLoadedRef.current = false;
                      setRunnerLoaded(false);
                      return;
                    }
                    runnerLoadedRef.current = true;
                    setRunnerLoaded(true);
                    setRunnerIndex(0);
                  runnerPlayOrderRef.current = buildPlayOrder();
                  setRunnerPlayOrder(runnerPlayOrderRef.current);
                    appendRunnerLog(`Loaded ${v.length} videos.`);
                  }}
                >
                  {pyVideosLoading ? '…' : '🔄'} Load Videos
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={runnerRunning}
                  onClick={async () => {
                    const startToken = ++runnerStartTokenRef.current;
                    setRunnerStatus('RUNNING');
                    setRunnerSessionStarted(0);
                    setRunnerSessionEnded(0);
                    setRunnerSessionWallSeconds(0);
                    setRunnerServerStatus('—');

                    // Prefer already-loaded list so YouTube.com tabs can open sync (user-gesture).
                    let v = runnerVideosRef.current;
                    if (!v.length) {
                      v = (pyVideos ?? []).filter((vid) => vid && vid.video_id);
                      if (v.length) runnerVideosRef.current = v;
                    }

                    if (runnerPlayOnYouTube) {
                      if (!v.length) {
                        appendRunnerLog(
                          'Load Videos first, then click Start. (Each tab needs a click unless popups are allowed.)'
                        );
                        setRunnerStatus('IDLE');
                        return;
                      }
                      runnerLoadedRef.current = true;
                      setRunnerLoaded(true);
                      suppressRunnerIndexEffectRef.current = true;
                      setRunnerIndex(0);
                      runnerPlayOrderRef.current = buildPlayOrder();
                      setRunnerPlayOrder(runnerPlayOrderRef.current);

                      // Open tabs immediately — before any await (popup gesture).
                      const { total } = runnerBeginYouTubeQueue();
                      if (!total) {
                        setRunnerStatus('ERROR');
                        setRunnerRunning(false);
                        runnerRunningRef.current = false;
                        return;
                      }
                      setRunnerRunning(true);
                      runnerRunningRef.current = true;
                      setRunnerStatus('RUNNING');
                      void runnerTestServer();
                      return;
                    }

                    ensureYouTubeIframeApi();
                    if (!v.length) v = (await loadVideos(200)) ?? [];
                    if (!v.length) {
                      appendRunnerLog('No videos to play. Click Load Videos first.');
                      setRunnerStatus('IDLE');
                      return;
                    }
                    if (startToken !== runnerStartTokenRef.current) return;
                    runnerLoadedRef.current = true;
                    setRunnerLoaded(true);
                    suppressRunnerIndexEffectRef.current = true;
                    setRunnerIndex(0);
                    runnerPlayOrderRef.current = buildPlayOrder();
                    setRunnerPlayOrder(runnerPlayOrderRef.current);
                    const ytOk = await waitForYouTubePlayerCtor(20000);
                    if (!ytOk) {
                      appendRunnerLog('YouTube IFrame API did not load in time. Refresh the page and try again.');
                      setRunnerStatus('ERROR');
                      return;
                    }
                    if (startToken !== runnerStartTokenRef.current) return;
                    setRunnerRunning(true);
                    runnerRunningRef.current = true;
                    await runnerTestServer();
                    if (startToken !== runnerStartTokenRef.current) return;
                    runnerPlayCurrent();
                  }}
                >
                  ▶ Start
                </button>
                <button type="button" className="btn btn-secondary" disabled={!runnerRunning} onClick={runnerStopInternal}>
                  ⏹ Stop
                </button>
                {runnerPlayOnYouTube && runnerYtQueue.some((q) => q.status !== 'opened') ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      runnerOpenNextYouTubeTab();
                    }}
                  >
                    ▶ Open next tab (
                    {runnerYtQueue.filter((q) => q.status !== 'opened').length} left)
                  </button>
                ) : null}
                <button type="button" className="btn btn-secondary" disabled={!runnerRunning} onClick={runnerAdvance}>
                  ⏭ Skip
                </button>
                <button type="button" className="btn btn-secondary" onClick={runnerTestServer}>
                  🔌 Test Server
                </button>
              </div>

              {runnerPlayOnYouTube && runnerYtQueue.length > 0 ? (
                <div
                  className="status-card"
                  style={{ marginTop: 12, borderColor: 'rgba(167, 139, 250, 0.45)' }}
                >
                  <strong>YouTube tabs</strong>
                  <p className="muted" style={{ margin: '6px 0 10px', fontSize: 13 }}>
                    {runnerYtQueue.filter((q) => q.status === 'opened').length}/{runnerYtQueue.length} open.
                    {runnerYtQueue.some((q) => q.status !== 'opened')
                      ? ' Chrome blocks multiple tabs from one click — press Open next tab once per remaining video.'
                      : ' All selected tabs are open and should be autoplaying.'}
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
                    {runnerYtQueue.map((q) => (
                      <li key={q.videoId}>
                        <span style={{ opacity: 0.75 }}>
                          {q.status === 'opened' ? '✓' : q.status === 'blocked' ? '✕' : '•'}
                        </span>{' '}
                        {q.title}{' '}
                        <span className="muted">({q.status})</span>
                        {q.status !== 'opened' ? (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: 12, marginLeft: 6 }}
                              onClick={() => runnerOpenOneYouTubeTab(q.videoId, q.title)}
                            >
                              Open
                            </button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="status-card">
                <strong>Status:</strong> {runnerRunning ? 'Running' : runnerStatus === 'STOPPED' ? 'Stopped' : 'Idle'}
                <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                  <div>
                    <strong>Video:</strong>{' '}
                    {(() => {
                      const v = runnerCurrentVideo();
                      return v ? (
                        <>
                          {v.title} (<a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer">{v.video_id}</a>)
                        </>
                      ) : (
                        <>
                          — (<span className="muted">—</span>)
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <strong>Index:</strong>{' '}
                    {runnerPlayOrder.length ? `${runnerIndex + 1} / ${runnerPlayOrder.length}` : '0 / 0'}
                  </div>
                  <div>
                    <strong>Desired speed:</strong> {runnerDesiredSpeed ?? '—'} | <strong>Actual speed:</strong> {runnerActualSpeed ?? '—'}
                  </div>
                  <div>
                    <strong>Position:</strong> {runnerPosition != null ? `${runnerPosition.toFixed(1)}s` : '—'}
                  </div>
                  <div>
                    <strong>Session:</strong> {runnerSessionStarted} started | {runnerSessionEnded} ended |{' '}
                    {Math.floor(runnerSessionWallSeconds)}s session | {runnerSessionStarted} videos started |{' '}
                    {(runnerSessionWallSeconds / 3600).toFixed(2)}h session (local) | <strong>Server:</strong>{' '}
                    {runnerServerStatus}
                  </div>
                </div>
              </div>

              <div className="pill-row" style={{ marginTop: 12 }}>
                <input
                  value={runnerIssueNote}
                  onChange={(e) => setRunnerIssueNote(e.target.value)}
                  placeholder="Issue note…"
                  style={{ flex: 1, minWidth: 240 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!runnerLoaded && !runnerVideosRef.current.length}
                  onClick={async () => {
                    const v = runnerCurrentVideo();
                    if (!v) return;
                    const note = runnerIssueNote.trim();
                    if (!note) return;
                    try {
                      await publicApi.runnerLogIssue({
                        video_id: v.video_id,
                        title: v.title,
                        desired_speed: runnerDesiredSpeed,
                        actual_speed: runnerActualSpeed,
                        position_seconds: runnerPosition,
                        note
                      });
                      appendRunnerLog(`Issue marked: "${note}" @ ${runnerPosition != null ? runnerPosition.toFixed(1) : '?'}s (${v.video_id})`);
                      setRunnerIssueNote('');
                    } catch (err) {
                      appendRunnerLog(`Issue log failed: ${err instanceof Error ? err.message : 'error'}`);
                    }
                  }}
                >
                  🚩 Mark Issue
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ aspectRatio: '16 / 9', width: '100%', borderRadius: 16, overflow: 'hidden', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div id="runner-player" style={{ width: '100%', height: '100%' }} />
                </div>
              </div>

              <div className="surface" style={{ marginTop: 12, padding: 16 }}>
                <h3 className="dashboard-section-h3">Video picker (leave all unchecked to play all)</h3>
                <div className="runner-video-picker-list">
                  {getRunnerVideos().map((v) => (
                    <label key={v.video_id} className="runner-video-picker-row">
                      <input
                        type="checkbox"
                        checked={Boolean(runnerPicked[v.video_id])}
                        onChange={(e) =>
                          setRunnerPicked((prev) => {
                            const next = { ...prev, [v.video_id]: e.target.checked };
                            // Keep a sync ref so Start can immediately read the latest selection.
                            runnerPickedRef.current = next;
                            return next;
                          })
                        }
                        className="runner-video-picker-checkbox"
                      />
                      <img
                        className="runner-video-picker-thumb"
                        src={`https://img.youtube.com/vi/${encodeURIComponent(v.video_id)}/mqdefault.jpg`}
                        alt=""
                        loading="lazy"
                        width={80}
                        height={45}
                      />
                      <span className="runner-video-picker-title">{v.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="surface" style={{ marginTop: 12, padding: 16 }}>
                <h3 className="dashboard-section-h3">Runner Log</h3>
                <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace', fontSize: 12, opacity: 0.9 }}>
                  {runnerLog.length ? runnerLog.join('\n') : '—'}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="dashboard-section">
            <h2>Continuous runner</h2>
            <p className="muted">Run ongoing analytics and monitoring for your channel.</p>
          </section>
        )}
      </div>

      {paywallFeature && (
        <PaywallModal
          featureName={paywallFeature}
          channelInput={channelInput}
          onClose={() => setPaywallFeature(null)}
          onCreateCheckout={handleCreateCheckout}
          isLoading={checkoutLoading}
        />
      )}

    </div>
  );
}
