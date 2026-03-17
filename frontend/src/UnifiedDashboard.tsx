import { useEffect, useState } from 'react';
import { BRAND } from './config/brand';
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
import { getDisplayHandle } from './lib/demo';
import { publicApi } from './lib/api';
import { PaywallModal } from './PaywallModal';
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
  { id: 'suggestions', label: 'Suggestions', icon: '💡', locked: true },
  { id: 'seo', label: 'SEO Optimizer', icon: '🔍', locked: true },
  { id: 'traffic', label: 'Traffic Tools', icon: '🚀', locked: true },
  { id: 'runner', label: 'Continuous Runner', icon: '▶', locked: true }
] as const;

type TabId = (typeof TABS)[number]['id'];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  demoData: DemoPreview | null;
  dashboardOverview: DashboardOverview | null;
  channelInput: string;
  userEmail?: string;
  demoLoading?: boolean;
  demoError?: string | null;
  onCreateCheckout: (channelInput: string, email: string) => Promise<CheckoutSession>;
  onSignOut?: () => void;
}) {
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
  const [runnerIndex, setRunnerIndex] = useState(0);
  const [runnerLog, setRunnerLog] = useState<string[]>([]);
  const [runnerSpeed, setRunnerSpeed] = useState(10);
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
  const [runnerPlayOrder, setRunnerPlayOrder] = useState<number[]>([]);
  const [runnerWatchStartPos, setRunnerWatchStartPos] = useState<number | null>(null);
  const [runnerWatchLimitFired, setRunnerWatchLimitFired] = useState(false);

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

  const channelTitle = isDemo
    ? (pyOverview?.channel_info?.title ?? demoData?.channelTitle ?? demoChannelData.channelTitle)
    : (dashboardOverview?.channelTitle ?? 'Channel');
  const displayHandle = isDemo ? getDisplayHandle(channelInput) : null;
  const previewFor = isDemo ? (displayHandle && displayHandle !== '@channel' ? displayHandle : (demoData?.channelHandle ?? demoChannelData.channelHandle)) : null;

  const growthScore = isDemo
    ? (demoData?.healthScore ?? demoChannelData.growthScore)
    : (dashboardOverview?.healthScore ?? 0);
  const growthScoreLabel = isDemo ? demoChannelData.growthScoreLabel : (growthScore >= 70 ? 'GOOD' : growthScore >= 50 ? 'FAIR' : 'NEEDS WORK');
  const scoreAnimated = !isDemo || displayScore >= growthScore;

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
    if (!isDemo || !isFullDemo) return;
    const input = (channelInput || '').trim();
    if (!input) return;

    let cancelled = false;
    setPyLoading(true);
    setPyError(null);
    Promise.all([
      publicApi.analyzeChannel(input, 30),
      publicApi.listVideos(input, 50)
    ])
      .then(([overview, videos]) => {
        if (cancelled) return;
        setPyOverview(overview);
        setPyVideos(videos);
      })
      .catch((err) => {
        if (cancelled) return;
        setPyOverview(null);
        setPyVideos(null);
        setPyError(err instanceof Error ? err.message : 'Could not load channel data.');
      })
      .finally(() => {
        if (!cancelled) setPyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [channelInput, isDemo, isFullDemo]);

  const scoreExplanation = isDemo ? demoChannelData.scoreExplanation : null;
  const hasMeaningfulMetrics = Boolean(
    demoData && (Number(demoData.subscriberCount) > 0 || Number(demoData.totalViews) > 0)
  );
  const subscribers = isDemo
    ? (pyOverview?.channel_info?.subscriber_count ?? (hasMeaningfulMetrics && demoData?.subscriberCount != null ? Number(demoData.subscriberCount) : demoChannelData.subscribers))
    : 0;
  const totalViews = isDemo
    ? (pyOverview?.channel_info?.view_count ?? (hasMeaningfulMetrics && demoData?.totalViews != null ? Number(demoData.totalViews) : demoChannelData.totalViews))
    : 0;
  const videoCount = isDemo
    ? (pyOverview?.channel_info?.video_count ?? (hasMeaningfulMetrics && demoData?.videoCount != null ? Number(demoData.videoCount) : demoChannelData.videos))
    : 0;
  const avgEngagement = isDemo
    ? (pyOverview?.video_performance?.avg_engagement_rate ?? (hasMeaningfulMetrics && demoData?.avgEngagement != null ? Number(demoData.avgEngagement) : demoChannelData.avgEngagement))
    : 0;
  const topVideosPaid = hasMeaningfulMetrics && demoData?.topVideos?.length ? (demoData.topVideos ?? []) : (demoData?.topVideos ?? []);
  const recommendations = isDemo
    ? [...(pyOverview?.recommendations ?? demoRecommendations)]
    : [...(dashboardOverview?.topOpportunities ?? []), ...(dashboardOverview?.topIssues ?? [])];

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

  function handleTabClick(tab: (typeof TABS)[number]) {
    setActiveTab(tab.id);
    if (tab.locked && isPreviewMode) {
      setPaywallFeature(tab.label);
    }
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

  useEffect(() => {
    if (!isDemo || !isFullDemo) return;
    ensureYouTubeIframeApi();
  }, [isDemo, isFullDemo]);

  function getRunnerVideos() {
    return (pyVideos ?? []).filter((v) => v && v.video_id);
  }

  function buildPlayOrder() {
    const list = getRunnerVideos();
    const pickedIndices = list
      .map((v, idx) => (runnerPicked[v.video_id] ? idx : -1))
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

  function runnerCurrentVideo() {
    const list = getRunnerVideos();
    const order = runnerPlayOrder.length ? runnerPlayOrder : buildPlayOrder();
    const idx = order.length ? order[Math.min(runnerIndex, order.length - 1)] : -1;
    return idx >= 0 ? list[idx] : null;
  }

  function runnerApplySpeed() {
    try {
      const player = (globalThis as any).__ybPlayerRef?.player;
      if (!player) return;
      if (typeof player.setPlaybackRate === 'function') {
        player.setPlaybackRate(runnerSpeed);
      }
      const actual = typeof player.getPlaybackRate === 'function' ? player.getPlaybackRate() : null;
      setRunnerDesiredSpeed(runnerSpeed);
      setRunnerActualSpeed(typeof actual === 'number' ? actual : null);
    } catch {
      // ignore
    }
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
    setRunnerRunning(false);
    setRunnerStatus('STOPPED');
    setRunnerWatchStartPos(null);
    setRunnerWatchLimitFired(false);
    try {
      const player = (globalThis as any).__ybPlayerRef?.player;
      if (player && typeof player.stopVideo === 'function') player.stopVideo();
    } catch {
      // ignore
    }
  }

  function runnerAdvance() {
    const order = runnerPlayOrder.length ? runnerPlayOrder : buildPlayOrder();
    if (!order.length) return;
    const next = (runnerIndex + 1) % order.length;
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
    appendRunnerLog(`Playing ${video.title} (${videoId})`);
    setRunnerSessionStarted((v) => v + 1);
    setRunnerWatchStartPos(null);
    setRunnerWatchLimitFired(false);

    const load = () => {
      const ref = (globalThis as any).__ybPlayerRef;
      const existingPlayer = ref?.player;
      if (existingPlayer && typeof existingPlayer.loadVideoById === 'function') {
        existingPlayer.loadVideoById(videoId);
        setTimeout(() => {
          runnerApplySpeed();
          runnerUpdatePosition();
        }, 800);
        return;
      }

      if (!(w.YT && w.YT.Player)) {
        appendRunnerLog('YouTube IFrame API not ready yet.');
        return;
      }

      ref.player = new w.YT.Player('runner-player', {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { autoplay: 1, controls: 1 },
        events: {
          onReady: () => {
            runnerApplySpeed();
            try {
              const player = ref.player;
              const pos = player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
              setRunnerWatchStartPos(typeof pos === 'number' ? pos : 0);
            } catch {
              setRunnerWatchStartPos(0);
            }
          },
          onStateChange: (e: any) => {
            // PLAYING
            if (e?.data === w.YT.PlayerState.PLAYING) {
              setRunnerStatus('RUNNING');
              try {
                const player = ref.player;
                const pos = player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
                setRunnerWatchStartPos((prev) => (prev == null ? (typeof pos === 'number' ? pos : 0) : prev));
              } catch {
                setRunnerWatchStartPos((prev) => prev ?? 0);
              }
              runnerApplySpeed();
            }
            // ENDED
            if (e?.data === w.YT.PlayerState.ENDED) {
              setRunnerSessionEnded((v: number) => v + 1);
              runnerAdvance();
            }
          },
          onError: (e: any) => {
            appendRunnerLog(`Player error code ${e?.data ?? 'unknown'} on ${videoId}. Skipping.`);
            runnerAdvance();
          }
        }
      });
    };

    // If iframe api hasn't called onYouTubeIframeAPIReady yet, we still try shortly.
    load();
    setTimeout(load, 1200);
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

      runnerUpdatePosition();
      runnerApplySpeed();

      // Watch limit
      if (runnerWatchSeconds > 0 && !runnerWatchLimitFired) {
        try {
          const player = (globalThis as any).__ybPlayerRef?.player;
          if (player && typeof player.getCurrentTime === 'function') {
            const pos = player.getCurrentTime();
            const startPos = runnerWatchStartPos ?? 0;
            if (typeof pos === 'number' && pos - startPos >= runnerWatchSeconds) {
              setRunnerWatchLimitFired(true);
              setRunnerSessionEnded((v) => v + 1);
              appendRunnerLog(`Watch limit reached (${runnerWatchSeconds}s). Advancing.`);
              runnerAdvance();
            }
          }
        } catch {
          // ignore
        }
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [runnerRunning, runnerSpeed, runnerWatchSeconds, runnerWatchLimitFired, runnerWatchStartPos]);

  // When index changes while running, play next
  useEffect(() => {
    if (!runnerRunning) return;
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
      const match = demoVideos.find((v) => v.id === maybeId);
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
    <div className="page dashboard-page">
      <header className="dashboard-header">
        <h1 className="dashboard-title">{BRAND.name} Dashboard</h1>
        {isDemo && (
          <>
            {isFullDemo ? (
              <p className="dashboard-badge demo-badge">Full demo — product showcase</p>
            ) : (
              <>
                <div className="dashboard-preview-banner">
                  <p className="dashboard-badge preview-badge">Preview Mode</p>
                  <p className="dashboard-preview-banner-text">
                    Unlock the full dashboard to see your real channel analytics and AI recommendations.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('Overview')}>
                    Unlock Full Analysis
                  </button>
                </div>
                {previewFor && <p className="dashboard-preview-for">Preview for: <strong>{previewFor}</strong></p>}
              </>
            )}
          </>
        )}
        {!isDemo && <p className="dashboard-subtitle">Channel: <strong>{channelTitle}</strong></p>}
        {!isDemo && userEmail && (
          <div className="pill-row dashboard-actions">
            <span className="info-pill">Signed in as {userEmail}</span>
            {onSignOut && (
              <button type="button" className="btn btn-secondary" onClick={onSignOut}>Sign out</button>
            )}
          </div>
        )}
        {isDemo && demoLoading && (
          <p className="dashboard-demo-loading">Loading channel data…</p>
        )}
        {isDemo && demoError && (
          <p className="dashboard-demo-error">{demoError}</p>
        )}
        {isDemo && isFullDemo && pyLoading && (
          <p className="dashboard-demo-loading">Loading your channel data…</p>
        )}
        {isDemo && isFullDemo && pyError && (
          <p className="dashboard-demo-error">{pyError}</p>
        )}
      </header>

      <div className="dashboard-tabs">
        {TABS.map((tab) => {
          const locked = tab.locked && isPreviewMode;
          return (
            <button
              key={tab.id}
              type="button"
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => handleTabClick(tab)}
              title={locked ? 'Available after unlock' : undefined}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
              {locked && (
                <span className="tab-lock" aria-hidden>🔒</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Overview */}
      <div className={`tab-panel ${activeTab === 'overview' ? 'active' : ''}`}>
        <div className="growth-score-block" data-animated={scoreAnimated}>
          <h2 className="growth-score-title">Channel Growth Score</h2>
          {showLockedUI ? (
            <div className="growth-score-value-wrap preview-blur-wrap">
              <div className="growth-score-value" data-score={displayScore} aria-hidden>
                {displayScore} <span className="growth-score-max">/ 100</span>
              </div>
              <div className="preview-blur-overlay" onClick={() => setPaywallFeature('Overview')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Overview')}>
                <span className="preview-blur-copy">Unlock full AI channel analysis</span>
              </div>
            </div>
          ) : (
            <div className="growth-score-value" data-score={isDemo ? displayScore : growthScore}>
              {isDemo ? displayScore : growthScore} <span className="growth-score-max">/ 100</span>
            </div>
          )}
          <span className="growth-score-label">{growthScoreLabel}</span>
          {isDemo && demoChannelData.scoreFactors && (
            <div className="growth-score-factors">
              {demoChannelData.scoreFactors.map((f) => (
                <span key={f.label} className="growth-score-factor">{f.label}: {f.score}</span>
              ))}
            </div>
          )}
          {scoreExplanation && <p className="growth-score-explanation">{scoreExplanation}</p>}
        </div>
        {showLockedUI ? (
          <div className="stats-grid preview-blur-wrap">
            <div className="stats-grid-inner">
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
            <div className="preview-blur-overlay" onClick={() => setPaywallFeature('Overview')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Overview')}>
              <span className="preview-blur-copy">Unlock full AI channel analysis</span>
            </div>
          </div>
        ) : (
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
                {demoTopVideos.slice(0, 5).map((v) => (
                  <div key={v.key} className="video-card">
                    <div className="video-card-title">{v.title}</div>
                    <div className="video-card-meta">{formatNumber(v.viewCount)} views</div>
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
            ) : isDemo ? (
              demoTopVideos.map((v) => (
                <div key={v.key} className="video-card">
                  <div className="video-card-title">{v.title}</div>
                  <div className="video-card-meta">
                    {formatNumber(v.viewCount)} views
                    {v.tag ? <span className="video-card-tag"> · {v.tag}</span> : null}
                  </div>
                </div>
              ))
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
              <div className="ai-insights-grid">
                <div className="ai-insights-column">
                  <h3 className="dashboard-section-h3">Detected problems</h3>
                  <ul className="feature-list">
                    {demoDetectedProblems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="ai-insights-column">
                  <h3 className="dashboard-section-h3">Top opportunities</h3>
                  <ul className="feature-list">
                    {demoOpportunities.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {isPreviewMode && (
                <div className="dashboard-unlock-blur locked-insights">
                  <ul className="feature-list locked-insight-teasers">
                    {demoLockedInsightTeasers.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <span className="dashboard-unlock-text">Unlock deeper analysis</span>
                </div>
              )}
            </section>
            {isPreviewMode && (
              <section className="dashboard-section conversion-bar">
                <h2 className="conversion-bar-title">Unlock the full AI report for your channel</h2>
                <p className="conversion-bar-sub">Get live stats, deeper recommendations, SEO tools, and traffic insights.</p>
                <div className="conversion-bar-actions">
                  <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('Overview')}>
                    Unlock for $49.99
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
          <ul className="feature-list">
            {recommendations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
            {recommendations.length === 0 && (
              <li className="muted">{isPreviewMode ? 'Complete purchase to see full AI recommendations.' : 'No recommendations available.'}</li>
            )}
          </ul>
        </section>
      </div>

      {/* Videos */}
      <div className={`tab-panel ${activeTab === 'videos' ? 'active' : ''}`}>
        <section className="dashboard-section">
          <h2>Your Videos</h2>
          <div className="video-list">
            {isDemo && isFullDemo && pyVideos ? (
              pyVideos.map((v) => (
                <div key={v.video_id} className="video-card video-card-with-action">
                  <div className="video-card-main">
                    <div className="video-card-title">{v.title}</div>
                    <div className="video-card-meta">
                      👁️ {formatNumber(v.view_count)} views · 👍 {formatNumber(v.like_count)} likes · 💬 {formatNumber(v.comment_count)} comments · Published {new Date(v.published_at).toLocaleDateString()}
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
            ) : isDemo ? (
              demoVideos.map((v) => (
                <div key={v.id} className="video-card video-card-with-action">
                  <div className="video-card-main">
                    <div className="video-card-title">{v.title}</div>
                    <div className="video-card-meta">
                      {v.views} views · {v.likes} likes · {v.comments} comment{v.comments !== 1 ? 's' : ''} · Published {v.publishDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm video-card-action"
                    onClick={() => {
                      if (isPreviewMode) {
                        setPaywallFeature('SEO Optimizer');
                      } else {
                        handleAnalyzeSeoFromTitle(v.title);
                      }
                    }}
                    title={isPreviewMode ? 'Available after unlock' : 'Analyze SEO'}
                  >
                    Analyze SEO
                  </button>
                </div>
              ))
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
        </section>
      </div>

      {/* Suggestions: locked in preview mode; full content in default demo */}
      <div className={`tab-panel ${activeTab === 'suggestions' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <div className="locked-panel locked-panel-with-content">
            <div className="locked-content-blur">
              <section className="dashboard-section">
                <h2>Top Content Ideas</h2>
                <ul className="feature-list">
                  {demoSuggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </section>
            </div>
            <div className="locked-overlay">
              <span className="locked-icon">🔒</span>
              <span className="locked-label">Unlock full AI channel analysis</span>
              <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('Suggestions')}>
                Unlock for $49.99
              </button>
            </div>
          </div>
        ) : isFullDemo ? (
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
                  {!pySuggestions?.top_performers?.length && demoTopVideos.slice(0, 10).map((v) => (
                    <div key={v.key} className="video-card">
                      <div className="video-card-title">{v.title}</div>
                      <div className="video-card-meta">{formatNumber(v.viewCount)} views</div>
                    </div>
                  ))}
                </div>
                <h3 className="dashboard-section-h3" style={{ marginTop: 18 }}>Content ideas</h3>
                <ul className="feature-list">
                  {(pySuggestions?.content_suggestions?.length ? pySuggestions.content_suggestions : demoSuggestions).map((s, i) => (
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

      {/* SEO: locked in preview mode; full content in default demo */}
      <div className={`tab-panel ${activeTab === 'seo' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <div className="locked-panel locked-panel-with-content">
            <div className="locked-content-blur">
              <section className="dashboard-section">
                <h2>SEO Optimizer</h2>
                <p className="video-card-title">{demoSeoAnalysis.title}</p>
                <p className="seo-score">SEO Score: {demoSeoAnalysis.score} / {demoSeoAnalysis.maxScore}</p>
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
              </section>
            </div>
            <div className="locked-overlay">
              <span className="locked-icon">🔒</span>
              <span className="locked-label">Unlock full AI channel analysis</span>
              <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('SEO Optimizer')}>
                Unlock for $49.99
              </button>
            </div>
          </div>
        ) : isFullDemo ? (
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
                <p><strong>Current:</strong> {pySeo.current_tags.slice(0, 10).join(', ') || '—'}</p>
                <p><strong>Suggested:</strong> {pySeo.suggested_tags.slice(0, 10).join(', ') || '—'}</p>
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
                <p className="muted">Try analyzing one of the demo videos, or paste a YouTube URL.</p>
                <div className="status-card" style={{ marginTop: 12 }}>
                  <strong>Example analysis</strong>
                  <p className="video-card-title">{demoSeoAnalysis.title}</p>
                  <p className="seo-score">SEO Score: {demoSeoAnalysis.score} / {demoSeoAnalysis.maxScore}</p>
                </div>
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

      {/* Traffic: locked in preview mode; full content in default demo */}
      <div className={`tab-panel ${activeTab === 'traffic' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <div className="locked-panel locked-panel-with-content">
            <div className="locked-content-blur">
              <section className="dashboard-section">
                <h2>Traffic Tools</h2>
                <div className="traffic-demo-cards">
                  <div className="traffic-demo-card">
                    <h3 className="dashboard-section-h3">Best Video To Promote</h3>
                    <p className="video-card-title">{demoTrafficTools.bestVideoToPromote}</p>
                    <p className="traffic-engagement">Engagement: {demoTrafficTools.engagement}%</p>
                  </div>
                  <div className="traffic-demo-card">
                    <h3 className="dashboard-section-h3">Proven Video To Reshare</h3>
                    <p className="video-card-title">{demoTrafficTools.provenVideoToReshare.title}</p>
                    <p className="traffic-engagement">{formatNumber(demoTrafficTools.provenVideoToReshare.views)} views</p>
                  </div>
                </div>
              </section>
            </div>
            <div className="locked-overlay">
              <span className="locked-icon">🔒</span>
              <span className="locked-label">Unlock full AI channel analysis</span>
              <button type="button" className="btn btn-primary" onClick={() => setPaywallFeature('Traffic Tools')}>
                Unlock for $49.99
              </button>
            </div>
          </div>
        ) : isFullDemo ? (
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
                          <a className="btn btn-secondary" href={v.watch_url} target="_blank" rel="noreferrer">Open on YouTube</a>
                          <button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(v.watch_url); }}>
                            Copy Link
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(v.share_text); }}>
                            Copy Share Text
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
                          <a className="btn btn-secondary" href={v.watch_url} target="_blank" rel="noreferrer">Open on YouTube</a>
                          <button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(v.watch_url); }}>
                            Copy Link
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={async () => { await navigator.clipboard.writeText(v.share_text); }}>
                            Copy Share Text
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
                      {(pyTraffic?.content_suggestions ?? demoSuggestions).slice(0, 10).map((idea) => (
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

      {/* Runner: locked in preview mode; full content in default demo */}
      <div className={`tab-panel ${activeTab === 'runner' ? 'active' : ''}`}>
        {isPreviewMode ? (
          <div className="locked-panel locked-panel-with-content">
            <div className="locked-content-blur">
              <section className="dashboard-section">
                <h2>Continuous Runner</h2>
                <p className="muted">Run ongoing analytics and monitoring for your channel.</p>
                <button type="button" className="btn btn-primary" disabled>
                  Start Runner
                </button>
              </section>
            </div>
            <div className="locked-overlay runner-overlay" onClick={() => setPaywallFeature('Continuous Runner')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPaywallFeature('Continuous Runner')}>
              <span className="locked-icon">🔒</span>
              <span className="locked-label">Unlock full AI channel analysis</span>
            </div>
          </div>
        ) : isFullDemo ? (
          <section className="dashboard-section">
            <h2>Continuous Runner</h2>
            <p className="muted">
              Review and test your content — play through videos and mark issues (parity with the Python demo).
            </p>
            <div className="surface" style={{ padding: 18, marginTop: 14 }}>
              <div className="pill-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <label className="info-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Speed (1–20)
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={0.25}
                    value={runnerSpeed}
                    onChange={(e) => setRunnerSpeed(Number(e.target.value) || 10)}
                    style={{ width: 90 }}
                  />
                </label>
                <label className="info-pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Watch seconds (0 = full)
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
                  onClick={() => {
                    setRunnerLoaded(true);
                    setRunnerIndex(0);
                    setRunnerPlayOrder(buildPlayOrder());
                    appendRunnerLog('Videos loaded.');
                  }}
                >
                  🔄 Load Videos
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!runnerLoaded || runnerRunning}
                  onClick={async () => {
                    ensureYouTubeIframeApi();
                    setRunnerStatus('RUNNING');
                    setRunnerRunning(true);
                    setRunnerSessionStarted(0);
                    setRunnerSessionEnded(0);
                    setRunnerSessionWallSeconds(0);
                    setRunnerPlayOrder(buildPlayOrder());
                    setRunnerServerStatus('—');
                    await runnerTestServer();
                    runnerPlayCurrent();
                  }}
                >
                  ▶ Start
                </button>
                <button type="button" className="btn btn-secondary" disabled={!runnerRunning} onClick={runnerStopInternal}>
                  ⏹ Stop
                </button>
                <button type="button" className="btn btn-secondary" disabled={!runnerRunning} onClick={runnerAdvance}>
                  ⏭ Skip
                </button>
                <button type="button" className="btn btn-secondary" disabled={!runnerLoaded} onClick={runnerTestServer}>
                  🔌 Test Server
                </button>
              </div>

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
                      ) : '—';
                    })()}
                  </div>
                  <div>
                    <strong>Index:</strong> {runnerPlayOrder.length ? `${runnerIndex + 1} / ${runnerPlayOrder.length}` : '0 / 0'}
                  </div>
                  <div>
                    <strong>Desired speed:</strong> {runnerDesiredSpeed ?? '—'} | <strong>Actual speed:</strong> {runnerActualSpeed ?? '—'}
                  </div>
                  <div>
                    <strong>Position:</strong> {runnerPosition != null ? `${runnerPosition.toFixed(1)}s` : '—'}
                  </div>
                  <div>
                    <strong>Session:</strong> {runnerSessionStarted} started | {runnerSessionEnded} ended | {Math.floor(runnerSessionWallSeconds)}s watched | Server: {runnerServerStatus}
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
                  disabled={!runnerLoaded}
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
                <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto', paddingRight: 6 }}>
                  {getRunnerVideos().map((v) => (
                    <label key={v.video_id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(runnerPicked[v.video_id])}
                        onChange={(e) => setRunnerPicked((prev) => ({ ...prev, [v.video_id]: e.target.checked }))}
                      />
                      <span style={{ opacity: 0.95 }}>{v.title}</span>
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
