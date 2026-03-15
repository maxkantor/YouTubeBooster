import { useEffect, useState } from 'react';
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
import { PaywallModal } from './PaywallModal';
import type { CheckoutSession } from './types';
import type { DemoPreview } from './types';
import type { DashboardOverview } from './types';

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

  const channelTitle = isDemo
    ? (demoData?.channelTitle ?? demoChannelData.channelTitle)
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

  const scoreExplanation = isDemo ? demoChannelData.scoreExplanation : null;
  const hasMeaningfulMetrics = Boolean(
    demoData && (Number(demoData.subscriberCount) > 0 || Number(demoData.totalViews) > 0)
  );
  const subscribers = isDemo
    ? (hasMeaningfulMetrics && demoData?.subscriberCount != null ? Number(demoData.subscriberCount) : demoChannelData.subscribers)
    : 0;
  const totalViews = isDemo
    ? (hasMeaningfulMetrics && demoData?.totalViews != null ? Number(demoData.totalViews) : demoChannelData.totalViews)
    : 0;
  const videoCount = isDemo
    ? (hasMeaningfulMetrics && demoData?.videoCount != null ? Number(demoData.videoCount) : demoChannelData.videos)
    : 0;
  const avgEngagement = isDemo
    ? (hasMeaningfulMetrics && demoData?.avgEngagement != null ? Number(demoData.avgEngagement) : demoChannelData.avgEngagement)
    : 0;
  const topVideosPaid = hasMeaningfulMetrics && demoData?.topVideos?.length ? (demoData.topVideos ?? []) : (demoData?.topVideos ?? []);
  const recommendations = isDemo
    ? [...demoRecommendations]
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
        <h1 className="dashboard-title">YouTubeBuster Dashboard</h1>
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
            {isDemo && demoData != null && hasMeaningfulMetrics ? (
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
              <div className="dashboard-unlock-blur locked-insights">
                <ul className="feature-list locked-insight-teasers">
                  {demoLockedInsightTeasers.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <span className="dashboard-unlock-text">Unlock deeper analysis</span>
              </div>
            </section>
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
          </>
        )}
        <section className="dashboard-section">
          <h2>Recommendations</h2>
          <ul className="feature-list">
            {recommendations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
            {recommendations.length === 0 && (
              <li className="muted">Complete purchase to see full AI recommendations.</li>
            )}
          </ul>
        </section>
      </div>

      {/* Videos */}
      <div className={`tab-panel ${activeTab === 'videos' ? 'active' : ''}`}>
        <section className="dashboard-section">
          <h2>Your Videos</h2>
          <div className="video-list">
            {isDemo ? (
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
                    onClick={() => setPaywallFeature('SEO Optimizer')}
                    title="Available after unlock"
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
            <h2>Top Content Ideas</h2>
            <ul className="feature-list">
              {demoSuggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
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
            <p className="muted">Run ongoing analytics and monitoring for your channel.</p>
            <button type="button" className="btn btn-primary">
              Start Runner
            </button>
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
