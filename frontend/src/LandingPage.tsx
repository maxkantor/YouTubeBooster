import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from './config/brand';
import { MarketingFooter } from './components/MarketingFooter';
import { analytics } from './lib/analytics';
import { beginAuditAttempt } from './lib/auditEventGate';
import {
  buildYoutubeChannelCanonicalUrl,
  DEFAULT_DEMO_CHANNEL,
  getStoredDemoChannel,
  setStoredDemoChannel
} from './lib/demo';
import type { DemoPreview } from './types';
import { validateYouTubeChannelInput } from './lib/youtubeChannelInput';
import { billingApi, meApi, publicApi } from './lib/api';
import { isCheckoutEmailValid, startPremiumCheckout } from './lib/startCheckout';
import { useAuth } from './AuthContext';
import { usePricing } from './PricingContext';
import { AiGrowthStudio } from './components/AiGrowthStudio';
import { HOMEPAGE_COMPARISON_LINKS } from './seo/comparisonPageData';
import { HOMEPAGE_GUIDE_GROUPS } from './seo/growthGuides';
import { HOMEPAGE_FAQS } from './seo/homepageFaq';

const DEMO_STORAGE_KEY = 'ybai_demo';

type ProductPreviewMetrics = {
  subscribers: number;
  totalViews: number;
  videos: number;
  engagementRate: number;
  topVideos: Array<{ id: string; title: string; views: number }>;
};

function computeChannelHealthScore(metrics: {
  subscribers: number;
  totalViews: number;
  videos: number;
  engagementRate: number;
}): number {
  const engagement = Math.min(28, metrics.engagementRate * 6);
  const catalog = Math.min(22, metrics.videos / 12);
  return Math.round(Math.min(96, 38 + engagement + catalog));
}

const UNLOCK_FEATURES = [
  'Find what is killing your views',
  'Fix weak titles and low CTR',
  'Discover missed keyword and traffic opportunities',
  'Improve thumbnails and video packaging',
  'Save your report and track progress'
];

const FREE_PREVIEW_INCLUDES = [
  'Public channel stats snapshot',
  'Real findings from your audit',
  'Sample growth recommendations',
  'AI Studio preview output'
];

const FULL_UNLOCK_FALLBACK_MODULES = [
  'Full title rewrites',
  'Complete keyword set',
  'Thumbnail strategy',
  'AI Growth Studio on AWS Bedrock',
  'Saved full report'
];

const DEFAULT_EXAMPLE_PREVIEW_CHANNEL = '@MaxKantorCooking';

type OpportunityId = 'titles' | 'description' | 'pattern' | 'ctr';

type OpportunityPreview = {
  id: OpportunityId;
  title: string;
  buttonLabel: string;
  output: string[];
};

type AuditPreviewData = {
  channelLabel: string;
  score: number;
  viewsLoss: string;
  benchmark: string;
  titleOriginal: string;
  titleOptimized: string;
  keywords: string[];
  impact: {
    ctrFrom: number;
    ctrTo: number;
    viewsFromK: number;
    viewsToK: number;
    subsFrom: number;
    subsTo: number;
  };
  opportunities: OpportunityPreview[];
  apiBacked?: boolean;
};

type FullGrowthPlanUserState = 'demo' | 'loggedIn' | 'paid';

function normalizeChannelLabel(input: string): string {
  const raw = input.trim();
  if (!raw) return DEFAULT_EXAMPLE_PREVIEW_CHANNEL;
  if (raw.startsWith('@')) return raw;
  const handleMatch = raw.match(/@([A-Za-z0-9._-]+)/);
  if (handleMatch?.[1]) return `@${handleMatch[1]}`;
  const clean = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/^youtube\.com\//i, '')
    .replace(/^channel\//i, '')
    .replace(/^c\//i, '')
    .replace(/^user\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
  return clean ? `@${clean}` : DEFAULT_EXAMPLE_PREVIEW_CHANNEL;
}

function buildAuditPreview(channelInput: string): AuditPreviewData {
  const channelLabel = normalizeChannelLabel(channelInput);
  const channelLower = channelLabel.toLowerCase();
  const isCooking = /cook|food|recipe|kitchen|meal/.test(channelLower);

  if (isCooking) {
    return {
      channelLabel,
      score: 71,
      viewsLoss: '12,000–45,000',
      benchmark: 'Channels like yours average 85+ when optimized',
      titleOriginal: 'Cooking Chicken with Potatoes and Sauce Recipe',
      titleOptimized: 'I Cooked Chicken Like This — It Changed Everything',
      keywords: ['kazan kebab', 'easy dinner recipe', 'one pot meals'],
      impact: {
        ctrFrom: 3.1,
        ctrTo: 6.8,
        viewsFromK: 2,
        viewsToK: 18,
        subsFrom: 12,
        subsTo: 210
      },
      opportunities: [
        {
          id: 'titles',
          title: 'Title optimization',
          buttonLabel: 'Rewrite My Titles',
          output: [
            'I Cooked Chicken Like This — It Changed Everything',
            'One-Pot Chicken & Potatoes in 30 Minutes (No Oven)',
            'Kazan Kebab at Home: Easy Dinner That Tastes Restaurant-Level'
          ]
        },
        {
          id: 'description',
          title: 'Description SEO',
          buttonLabel: 'Optimize My Descriptions',
          output: [
            'Primary keyword added in first sentence for search relevance',
            'Ingredient + timestamp structure boosts watch completion',
            'CTA + related recipe links increase session time'
          ]
        },
        {
          id: 'pattern',
          title: 'Winning content pattern',
          buttonLabel: 'Find Winning Pattern',
          output: [
            'Hook in first 5 seconds: show finished dish immediately',
            'Use “budget + easy + one-pot” angle for higher CTR',
            'Post Tue/Thu/Sun at 6–8 PM local for your audience'
          ]
        },
        {
          id: 'ctr',
          title: 'CTR keyword uplift',
          buttonLabel: 'Improve CTR Keywords',
          output: [
            'Swap generic words with intent keywords: “easy dinner”, “one-pot”',
            'Lead with result-driven language: “changed everything”',
            'Pair keyword with emotional trigger for higher clicks'
          ]
        }
      ]
    };
  }

  const baseTopic = channelLabel.replace('@', '').split(/[._-]/)[0] || 'creator';
  const topic = baseTopic.charAt(0).toUpperCase() + baseTopic.slice(1);

  return {
    channelLabel,
    score: 66,
    viewsLoss: '8,400–31,000',
    benchmark: `Channels like ${channelLabel} average 82+ when optimized`,
    titleOriginal: `${topic} tips and complete guide for beginners`,
    titleOptimized: `I Tried ${topic} This Way for 30 Days — Here’s What Worked`,
    keywords: [`${topic} strategy`, `${topic} for beginners`, `${topic} tutorial`],
    impact: {
      ctrFrom: 2.7,
      ctrTo: 5.9,
      viewsFromK: 2.4,
      viewsToK: 14.6,
      subsFrom: 18,
      subsTo: 154
    },
    opportunities: [
      {
        id: 'titles',
        title: 'Title optimization',
        buttonLabel: 'Rewrite My Titles',
        output: [
          `I Tested ${topic} for 30 Days — Results You Can Copy`,
          `${topic} Mistakes That Kill Growth (And How to Fix Them)`,
          `${topic} in 10 Minutes: The Simple Framework`
        ]
      },
      {
        id: 'description',
        title: 'Description SEO',
        buttonLabel: 'Optimize My Descriptions',
        output: [
          `Add “${topic}” keyword in first 140 characters`,
          'Use chapter timestamps to increase retention',
          'Add two internal links to lift session depth'
        ]
      },
      {
        id: 'pattern',
        title: 'Winning content pattern',
        buttonLabel: 'Find Winning Pattern',
        output: [
          'Open with clear promise in first 3–5 seconds',
          'Use comparison format: before/after or wrong/right',
          'Publish in consistent 48-hour cadence windows'
        ]
      },
      {
        id: 'ctr',
        title: 'CTR keyword uplift',
        buttonLabel: 'Improve CTR Keywords',
        output: [
          `Use “${topic} mistakes”, “${topic} simple”, “${topic} fast” variants`,
          'Pair high-intent keyword + curiosity phrase',
          'Keep first 42 characters punchy and benefit-led'
        ]
      }
    ]
  };
}

function maskKeyword(keyword: string): string {
  if (keyword.length <= 4) return `${keyword.slice(0, 1)}•••`;
  return `${keyword.slice(0, Math.min(4, Math.ceil(keyword.length / 2)))}•••`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

function mapDemoToProductPreview(demo: DemoPreview): ProductPreviewMetrics {
  return {
    subscribers: Number(demo.subscriberCount ?? 0),
    totalViews: Number(demo.totalViews ?? 0),
    videos: Number(demo.videoCount ?? 0),
    engagementRate: Number(demo.avgEngagement ?? 0),
    topVideos: (demo.topVideos ?? []).slice(0, 4).map((v) => ({
      id: v.videoId,
      title: v.title,
      views: Number(v.viewCount ?? 0)
    }))
  };
}

type HeroInsightLine = { tag: string; text: string; tagVariant: 'leak' | 'bad' | 'opp' };

function heroInsightsFromDemo(demo: DemoPreview | null): HeroInsightLine[] {
  if (!demo) return [];
  const lines = [...(demo.findings ?? []), ...(demo.previewRecommendations ?? [])].filter(Boolean).slice(0, 4);
  const tags: HeroInsightLine['tag'][] = ['CTR', 'Title', 'SEO', 'Opportunity'];
  const variants: HeroInsightLine['tagVariant'][] = ['leak', 'bad', 'opp', 'opp'];
  return lines.map((text, i) => ({
    tag: tags[i % tags.length],
    text,
    tagVariant: variants[i % variants.length]
  }));
}

function mergeAuditPreviewWithDemo(base: AuditPreviewData, demo: DemoPreview | null): AuditPreviewData {
  if (!demo) return base;
  const findings = (demo.findings ?? []).filter(Boolean);
  const recommendations = (demo.previewRecommendations ?? []).filter(Boolean);
  const topVideoTitle = demo.topVideos?.[0]?.title?.trim();
  const titleCandidates = recommendations.filter((line) => /title|ctr|thumbnail|hook|packaging/i.test(line));
  const titleOutput =
    titleCandidates.length >= 2
      ? titleCandidates.slice(0, 3)
      : (base.opportunities.find((item) => item.id === 'titles')?.output ?? [base.titleOptimized]);
  const keywordCandidates = recommendations.filter((line) => /keyword|seo|search|topic/i.test(line));
  const keywords =
    keywordCandidates.length >= 2
      ? keywordCandidates.slice(0, 3)
      : recommendations.length >= 3
        ? recommendations.slice(0, 3)
        : base.keywords;
  const opportunities = base.opportunities.map((opportunity) => {
    if (opportunity.id === 'titles' && titleOutput.length > 0) {
      return { ...opportunity, output: titleOutput };
    }
    if (opportunity.id === 'description' && findings.length > 0) {
      return { ...opportunity, output: findings.slice(0, 3) };
    }
    if (opportunity.id === 'pattern' && recommendations.length > 0) {
      return { ...opportunity, output: recommendations.slice(0, 3) };
    }
    return opportunity;
  });

  return {
    ...base,
    channelLabel: demo.channelHandle?.trim() ? normalizeChannelLabel(demo.channelHandle) : base.channelLabel,
    score: demo.healthScore > 0 ? demo.healthScore : base.score,
    titleOriginal: topVideoTitle || base.titleOriginal,
    titleOptimized: titleOutput[0] ?? base.titleOptimized,
    keywords,
    opportunities,
    apiBacked: true
  };
}

function FullGrowthPlanSection({
  userState,
  auditPreview,
  pricingLoading,
  onUnlock,
  onViewFullReport
}: {
  userState: FullGrowthPlanUserState;
  auditPreview: AuditPreviewData;
  pricingLoading: boolean;
  onUnlock: () => void;
  onViewFullReport: () => void;
}) {
  const optimizedTitles = auditPreview.opportunities.find((item) => item.id === 'titles')?.output ?? [auditPreview.titleOptimized];
  const thumbnailIdeas = [
    'High-contrast face + 3-word hook',
    'Before/after framing for instant curiosity',
    'One clear object focus with bold text placement'
  ];

  if (userState === 'paid') {
    return (
      <div className="landing-growth-plan-shell landing-growth-plan-paid">
        <div className="landing-growth-plan-header">
          <span className="landing-growth-plan-badge">Success mode</span>
          <h4>✅ Your Full Growth Plan Is Unlocked</h4>
          <p>All AI fixes, optimizations, and strategies are now available.</p>
        </div>

        <div className="landing-growth-plan-success-grid">
          <div className="landing-growth-plan-checklist-card">
            <ul className="landing-growth-plan-checklist">
              <li>✔ Titles optimized</li>
              <li>✔ Keywords generated</li>
              <li>✔ Thumbnail strategy ready</li>
              <li>✔ Growth plan available</li>
            </ul>
            <p className="landing-growth-plan-success-note">🎯 Everything is unlocked. Start applying fixes to grow your channel.</p>
          </div>

          <div className="landing-growth-plan-action-card">
            <span className="landing-growth-plan-action-label">Recommended first step</span>
            <strong>👉 Start with title optimization — highest impact</strong>
            <p>Open your full report, review the strongest title rewrites, and start applying the highest-leverage fixes first.</p>
            <div className="landing-growth-plan-actions">
              <button type="button" className="btn btn-primary btn-lg landing-growth-plan-btn" onClick={onViewFullReport}>
                View Full Report →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDemo = userState === 'demo';

  return (
    <div className={`landing-growth-plan-shell landing-growth-plan-${userState}`}>
      <div className="landing-growth-plan-header">
        <span className="landing-growth-plan-badge">Premium preview</span>
        <h4>🔥 Your Full Growth Plan Is Ready</h4>
        <p>
          {isDemo
            ? 'Your AI fixes are generated. Unlock to see everything.'
            : `You’re leaving ${auditPreview.viewsLoss} views/month on the table`}
        </p>
      </div>

      <div className="landing-growth-plan-preview-grid">
        <article className={`landing-growth-plan-card ${isDemo ? 'is-locked' : 'is-partial'}`}>
          <div className="landing-growth-plan-card-head">
            <h5>Optimized titles</h5>
            <span>🔒</span>
          </div>
          <ul className="landing-growth-plan-list">
            {optimizedTitles.slice(0, 3).map((title, index) => (
              <li key={title} className={!isDemo && index > 0 ? 'is-blurred' : ''}>
                {title}
              </li>
            ))}
          </ul>
          {isDemo && <div className="landing-growth-plan-lock-overlay">🔒 Locked AI titles</div>}
        </article>

        <article className={`landing-growth-plan-card ${isDemo ? 'is-locked' : 'is-partial'}`}>
          <div className="landing-growth-plan-card-head">
            <h5>Keyword opportunities</h5>
            <span>🔒</span>
          </div>
          <div className="landing-growth-plan-chip-wrap">
            {auditPreview.keywords.map((keyword, index) => (
              <span key={keyword} className={`landing-growth-plan-chip ${!isDemo && index > 0 ? 'is-blurred' : ''}`}>
                {isDemo ? `🔒 ${keyword}` : index === 0 ? keyword : maskKeyword(keyword)}
              </span>
            ))}
          </div>
          {isDemo && <div className="landing-growth-plan-lock-overlay">🔒 Premium keyword set</div>}
        </article>

        <article className={`landing-growth-plan-card ${isDemo ? 'is-locked' : 'is-partial'}`}>
          <div className="landing-growth-plan-card-head">
            <h5>Thumbnail strategy</h5>
            <span>🔒</span>
          </div>
          <ul className="landing-growth-plan-list">
            {thumbnailIdeas.map((idea, index) => (
              <li key={idea} className={!isDemo && index > 0 ? 'is-blurred' : ''}>
                {idea}
              </li>
            ))}
          </ul>
          {isDemo && <div className="landing-growth-plan-lock-overlay">🔒 Thumbnail playbook</div>}
        </article>
      </div>

      <div className="landing-growth-plan-footer">
        <button
          type="button"
          className="btn btn-primary btn-lg landing-growth-plan-cta"
          onClick={onUnlock}
          disabled={pricingLoading}
        >
          {pricingLoading ? 'Starting checkout…' : isDemo ? 'Unlock My Full AI Audit →' : 'Unlock Full Plan →'}
        </button>

        {isDemo ? (
          <>
            <div className="landing-growth-plan-proof" role="status">
              <span>See the free preview before you pay</span>
              <span>One-time unlock. No subscription.</span>
            </div>
            {!auditPreview.apiBacked && (
              <p className="landing-growth-plan-soft-note muted">Illustrative preview — run your audit for personalized output.</p>
            )}
            <p className="landing-growth-plan-urgency">Unlock once to save the full report and full recommendation set.</p>
          </>
        ) : (
          <p className="landing-growth-plan-soft-note">Unlock once to reveal every AI fix, full keyword set, and complete growth plan.</p>
        )}
      </div>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const { oneTimePriceLabel } = usePricing();
  const faqLeftColumn = useMemo(() => HOMEPAGE_FAQS.slice(0, 4), []);
  const faqRightColumn = useMemo(() => HOMEPAGE_FAQS.slice(4), []);
  const { session: authSession, signOut: authSignOut } = useAuth();
  const [demoInput, setDemoInput] = useState('');
  const [demoError, setDemoError] = useState('');
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [hasPremium, setHasPremium] = useState(false);
  const [userChannelUrl, setUserChannelUrl] = useState('');
  const [demoPreviewByChannel, setDemoPreviewByChannel] = useState<Record<string, DemoPreview>>({});
  const [productPreviewLoading, setProductPreviewLoading] = useState(false);
  const [productPreviewError, setProductPreviewError] = useState('');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const pricingViewedRef = useRef(false);
  const headerRef = useRef<HTMLElement>(null);
  const stickyCtaRef = useRef<HTMLDivElement>(null);
  const [showCheckoutSuccessBanner, setShowCheckoutSuccessBanner] = useState(false);

  const enteredChannelValid = useMemo(() => {
    const entered = demoInput.trim();
    if (!entered) return null;
    const validated = validateYouTubeChannelInput(entered);
    return validated.ok ? validated.normalized : null;
  }, [demoInput]);

  const previewChannelInput = demoInput.trim() || getStoredDemoChannel() || DEFAULT_DEMO_CHANNEL;
  const baseAuditPreview = useMemo(() => buildAuditPreview(previewChannelInput), [previewChannelInput]);
  const paidPreviewChannelInput = useMemo(() => {
    const entered = demoInput.trim();
    if (entered) {
      const validated = validateYouTubeChannelInput(entered);
      if (validated.ok) return validated.normalized;
    }
    return userChannelUrl.trim();
  }, [demoInput, userChannelUrl]);
  const productPreviewChannelInput = useMemo(() => {
    if (hasPremium) return paidPreviewChannelInput;
    const entered = demoInput.trim();
    if (entered) {
      const validated = validateYouTubeChannelInput(entered);
      if (validated.ok) return validated.normalized;
    }
    return DEFAULT_DEMO_CHANNEL;
  }, [hasPremium, paidPreviewChannelInput, demoInput]);
  const heroDemo = demoPreviewByChannel[DEFAULT_DEMO_CHANNEL] ?? null;
  const productDemo = productPreviewChannelInput.trim()
    ? demoPreviewByChannel[productPreviewChannelInput.trim()] ?? null
    : null;
  const auditPreview = useMemo(
    () => mergeAuditPreviewWithDemo(baseAuditPreview, productDemo ?? heroDemo),
    [baseAuditPreview, productDemo, heroDemo]
  );
  const productPreviewLabel = normalizeChannelLabel(productPreviewChannelInput || DEFAULT_DEMO_CHANNEL);
  const heroChannelLabel = normalizeChannelLabel(heroDemo?.channelHandle || DEFAULT_EXAMPLE_PREVIEW_CHANNEL);
  const heroChannelUrl = buildYoutubeChannelCanonicalUrl(DEFAULT_DEMO_CHANNEL);
  const heroInsights = useMemo(() => heroInsightsFromDemo(heroDemo), [heroDemo]);
  const heroHealthScore = heroDemo?.healthScore ?? null;
  const productPreviewData = productDemo ? mapDemoToProductPreview(productDemo) : null;
  const productPreviewSubtitle = hasPremium
    ? productPreviewChannelInput
      ? `Live snapshot for ${productPreviewLabel} using your paid channel data, channel audit signals, and real YouTube analytics.`
      : 'Paid account detected. Add a valid channel URL above to load your real YouTube analytics, packaging insights, and top videos.'
    : productPreviewChannelInput !== DEFAULT_DEMO_CHANNEL
      ? `Live preview for ${productPreviewLabel} from public YouTube data. Unlock to save your full personalized report.`
      : `Example preview for ${productPreviewLabel} using public YouTube analytics. Enter your channel above to preview yours.`;
  const channelHealthScore =
    productDemo?.healthScore && productDemo.healthScore > 0
      ? productDemo.healthScore
      : productPreviewData
        ? computeChannelHealthScore(productPreviewData)
        : null;
  const pricingUnlockModules =
    (productDemo ?? heroDemo)?.gatedModules?.filter(Boolean) ?? FULL_UNLOCK_FALLBACK_MODULES;
  const purchaseCompletedTrackedRef = useRef(false);

  useEffect(() => {
    analytics.landingPageView();
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const onScroll = () => {
      header.classList.toggle('landing-header-scrolled', window.scrollY > 16);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = document.getElementById('audit');
    const cta = stickyCtaRef.current;
    if (!el || !cta) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        cta.classList.toggle('is-hidden', !!entry?.isIntersecting);
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!authSession?.idToken) {
      setHasPremium(false);
      setUserChannelUrl('');
      return;
    }
    (async () => {
      try {
        const [status, me] = await Promise.all([meApi.getAccessStatus(authSession.idToken), meApi.getMe(authSession.idToken)]);
        if (!cancelled) {
          setHasPremium(!!status.premium);
          setUserChannelUrl(me.channelUrl?.trim() ?? '');
        }
      } catch {
        if (!cancelled) {
          setHasPremium(false);
          setUserChannelUrl('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authSession?.idToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;
    // Guest buyers land on /?checkout=success — show activation CTA (Stripe success URL).
    if (!authSession?.idToken) {
      setShowCheckoutSuccessBanner(true);
      return;
    }
    if (purchaseCompletedTrackedRef.current) return;

    let cancelled = false;
    (async () => {
      const start = Date.now();
      while (!cancelled && Date.now() - start < 30_000) {
        try {
          const data = await meApi.getAccessStatus(authSession.idToken);
          if (data.premium) {
            if (!purchaseCompletedTrackedRef.current) {
              purchaseCompletedTrackedRef.current = true;
              analytics.purchaseCompleted();
            }
            setShowCheckoutSuccessBanner(false);
            return;
          }
        } catch {
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authSession?.idToken]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      const scrollToSection = () => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      requestAnimationFrame(() => requestAnimationFrame(scrollToSection));
      return;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const el = document.getElementById('pricing');
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !pricingViewedRef.current) {
          pricingViewedRef.current = true;
          analytics.pricingViewed();
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const productChannel = productPreviewChannelInput.trim();
    const channels = Array.from(new Set([DEFAULT_DEMO_CHANNEL, productChannel].filter(Boolean)));
    if (!productChannel) {
      setProductPreviewError('');
      setProductPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setProductPreviewLoading(true);
    setProductPreviewError('');

    void (async () => {
      try {
        const results = await Promise.all(channels.map((channel) => publicApi.runDemo(channel)));
        if (cancelled) return;
        const next: Record<string, DemoPreview> = {};
        channels.forEach((channel, index) => {
          next[channel] = results[index];
        });
        setDemoPreviewByChannel((prev) => ({ ...prev, ...next }));
      } catch (err) {
        if (cancelled) return;
        setProductPreviewError(err instanceof Error ? err.message : 'Could not load live dashboard preview data.');
      } finally {
        if (!cancelled) setProductPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productPreviewChannelInput]);

  function handleOpenInstantDemo() {
    analytics.heroInstantDemoClicked();
    analytics.demoOpenedFromHomepage();
    setStoredDemoChannel(DEFAULT_DEMO_CHANNEL);
    analytics.channelAuditStarted();
    navigate('/demo', { replace: true, state: { channelInput: DEFAULT_DEMO_CHANNEL } });
  }

  function handleAnalyzeUserChannel() {
    const channel = demoInput.trim();
    setDemoError('');
    if (!channel) {
      setDemoError('Enter a channel URL or @handle.');
      return;
    }
    const validated = validateYouTubeChannelInput(channel);
    if (!validated.ok) {
      setDemoError(validated.message);
      return;
    }
    const normalized = validated.normalized;
    setAuditSubmitting(true);
    analytics.auditUrlEntered(normalized);
    const { attemptId } =
      typeof window !== 'undefined'
        ? beginAuditAttempt(window.sessionStorage)
        : { attemptId: undefined as string | undefined };
    analytics.auditStarted('homepage_or_audit_form', attemptId ? { auditAttemptId: attemptId } : undefined);
    analytics.channelAuditStarted();
    setStoredDemoChannel(normalized);
    if (hasPremium) {
      navigate(`/dashboard/channel?channel=${encodeURIComponent(normalized)}`, {
        replace: true,
        state: { channelInput: normalized, auditAttemptId: attemptId }
      });
    } else {
      navigate(`/demo?channel=${encodeURIComponent(normalized)}`, {
        replace: true,
        state: { channelInput: normalized, auditAttemptId: attemptId }
      });
    }
    setAuditSubmitting(false);
  }

  async function handleUnlockReport() {
    try {
      const stored = sessionStorage.getItem(DEMO_STORAGE_KEY);
      const storedDemo = getStoredDemoChannel();
      let channelInput: string | undefined = undefined;
      if (!channelInput && stored) {
        try {
          const parsed = JSON.parse(stored) as { channelInput?: string };
          channelInput = parsed.channelInput || undefined;
        } catch {
          /* ignore */
        }
      }
      if (!channelInput && storedDemo) channelInput = storedDemo;
      const entered = demoInput.trim();
      const enteredValid = entered ? validateYouTubeChannelInput(entered) : null;
      const checkoutChannel =
        enteredValid?.ok ? enteredValid.normalized : channelInput || getStoredDemoChannel() || 'account';

      if (!authSession) {
        if (!isCheckoutEmailValid(checkoutEmail)) {
          setPricingError('Enter your email to continue to secure checkout.');
          return;
        }
        setPricingLoading(true);
        setPricingError('');
        analytics.checkoutStarted(checkoutChannel);
        const checkout = await startPremiumCheckout({ channelInput: checkoutChannel, email: checkoutEmail });
        window.location.href = checkout.checkoutUrl;
        return;
      }

      if (hasPremium) {
        setPricingError('You already have premium access.');
        return;
      }

      if (!channelInput) channelInput = checkoutChannel;

      setPricingLoading(true);
      setPricingError('');
      analytics.checkoutStarted(channelInput);
      const checkout = await startPremiumCheckout({
        channelInput,
        idToken: authSession.idToken
      });
      window.location.href = checkout.checkoutUrl;
    } catch (err) {
      setPricingError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setPricingLoading(false);
    }
  }

  function handleViewFullReport() {
    const savedChannel = userChannelUrl.trim();
    if (savedChannel) {
      navigate(`/dashboard/channel?channel=${encodeURIComponent(savedChannel)}`, {
        state: { channelInput: savedChannel }
      });
      return;
    }

    const demoChannel = previewChannelInput.trim() || getStoredDemoChannel() || DEFAULT_DEMO_CHANNEL;
    setStoredDemoChannel(demoChannel);
    navigate(`/demo?channel=${encodeURIComponent(demoChannel)}`, {
      state: { channelInput: demoChannel }
    });
  }

  const fullGrowthPlanUserState: FullGrowthPlanUserState = hasPremium
    ? 'paid'
    : authSession
      ? 'loggedIn'
      : 'demo';

  return (
    <div className="landing landing-layout">
      {showCheckoutSuccessBanner && !authSession ? (
        <div
          className="status-card"
          role="status"
          style={{
            margin: '12px auto 0',
            maxWidth: 920,
            padding: '16px 18px',
            borderColor: 'rgba(167, 139, 250, 0.5)'
          }}
        >
          <strong>Payment received — finish unlocking your report</strong>
          <p className="muted" style={{ marginTop: 8 }}>
            Create your account with the <strong>same email</strong> you used at Stripe checkout. A different email
            cannot attach this purchase.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/auth/signup?returnTo=%2F%3Fcheckout%3Dsuccess">
              Create account with checkout email
            </Link>
            <Link className="btn btn-secondary" to="/auth/signin?returnTo=%2F%3Fcheckout%3Dsuccess">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      ) : null}
      {/* 1. Header */}
      <header ref={headerRef} className="landing-header">
        <div className="container landing-header-inner nav-shell">
          <Link
            to="/"
            className="landing-logo landing-logo-premium brand-link brand-with-play"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label={`${BRAND.name} home`}
          >
            <span className="brand-play-icon" aria-hidden />
            <span className="landing-logo-yt">{BRAND.namePart1}</span>
            <span className="landing-logo-boost">{BRAND.namePart2}</span>
          </Link>
          <nav className="landing-nav landing-nav-center" aria-label="Primary">
            <a 
              href="#product" 
              className="landing-nav-link"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('product');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              Product
            </a>
            <a
              href="#ai-tools"
              className="landing-nav-link landing-nav-link-subtle"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('ai-tools');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              AI Studio
            </a>
            <a 
              href="#pricing" 
              className="landing-nav-link"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('pricing');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              Pricing
            </a>
            <a 
              href="#faq" 
              className="landing-nav-link"
              onClick={(e) => {
                e.preventDefault();
                const element = document.getElementById('faq');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
            >
              FAQ
            </a>
            <Link 
              to="/contact" 
              className="landing-nav-link"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Contact
            </Link>
          </nav>
          <div className="landing-nav-actions">
            {authSession ? (
              <>
                <span className="landing-nav-user">{authSession.email ?? 'Account'}</span>
                <button
                  type="button"
                  className="landing-nav-link landing-nav-signout"
                  onClick={() => {
                    void authSignOut();
                  }}
                >
                  Sign out
                </button>
                <a
                  href="#audit"
                  className="landing-nav-link landing-nav-cta landing-nav-cta-primary"
                  title="Analyze Channel"
                >
                  Analyze Channel
                </a>
              </>
            ) : (
              <>
                <Link className="landing-nav-link landing-nav-auth" to="/auth/signin">
                  Sign In
                </Link>
                <Link className="landing-nav-link landing-nav-auth landing-nav-auth-strong" to="/auth/signup">
                  Sign Up
                </Link>
                <a
                  href="#audit"
                  className="landing-nav-link landing-nav-cta landing-nav-cta-primary"
                  title="Analyze Channel"
                >
                  Analyze Channel
                </a>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="landing-header-rule" aria-hidden />

      <main id="main-content" className="landing-main">
      {/* 2. Hero */}
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="container landing-hero-grid">
          <div className="landing-hero-content">
            <h1 className="landing-hero-title landing-hero-brand-h1" id="hero-heading">
              {BRAND.name}
            </h1>
            <h2 className="landing-hero-tagline-h2">
              AI-Powered YouTube Channel Audit &amp; Growth Platform
            </h2>
            <p className="landing-hero-sub">
              {BRAND.heroSubtitle}
            </p>
            <p className="landing-hero-outcome muted">
              See what&apos;s limiting CTR, retention, and search visibility — from public YouTube data.
            </p>
            <form
              className="landing-hero-audit"
              id="audit"
              onSubmit={(e) => {
                e.preventDefault();
                analytics.heroAuditCtaClicked();
                handleAnalyzeUserChannel();
              }}
            >
              <input
                type="text"
                className="landing-hero-audit-input"
                placeholder="Paste a YouTube channel URL or @handle"
                value={demoInput}
                onChange={(e) => {
                  setDemoInput(e.target.value);
                  setDemoError('');
                }}
                autoComplete="url"
                inputMode="url"
                aria-label="YouTube channel URL or @handle"
                aria-invalid={!!demoError}
                aria-describedby={demoError ? 'audit-channel-error' : 'hero-audit-hint'}
              />
              {demoError ? (
                <p id="audit-channel-error" className="landing-demo-error" role="alert">
                  {demoError}
                </p>
              ) : null}
              <div className="landing-hero-buttons">
                <button
                  type="submit"
                  className="btn btn-lg landing-hero-cta-primary landing-cta-premium"
                  disabled={auditSubmitting}
                >
                  {auditSubmitting ? 'Starting…' : 'Analyze Your Channel'}
                </button>
                <button
                  type="button"
                  className="btn btn-lg landing-hero-cta-secondary landing-cta-secondary-premium"
                  onClick={handleOpenInstantDemo}
                >
                  See Instant Demo
                </button>
              </div>
              <p className="landing-hero-audit-hint" id="hero-audit-hint">
                Instant demo runs on{' '}
                <a href={heroChannelUrl} target="_blank" rel="noopener noreferrer">
                  {heroChannelLabel}
                </a>
                . Free preview — no Studio login.
              </p>
            </form>
            <div className="landing-hero-proof-strip" aria-label="Trust signals">
              <span>
                <strong>Free preview</strong> before you pay
              </span>
              <span>
                <strong>Public YouTube data</strong>
              </span>
              <span>
                <strong>One-time payment</strong>
              </span>
            </div>
          </div>
          <div className="landing-hero-preview">
            <div className="landing-hero-insight-panel landing-insight-glass">
              <div className="landing-insight-panel-top">
                <div className="landing-insight-panel-chrome" aria-hidden>
                  <span className="landing-insight-chrome-dot" />
                  <span className="landing-insight-chrome-dot" />
                  <span className="landing-insight-chrome-dot" />
                </div>
                <span className="landing-insight-pulse" aria-hidden />
                <span className="landing-insight-panel-label-single">Live Channel Audit</span>
                <span className="landing-insight-panel-status">{heroDemo ? 'Live preview' : 'Loading'}</span>
              </div>
              <div className="landing-insight-health-row">
                <div
                  className="landing-insight-health-ring"
                  style={
                    heroHealthScore != null
                      ? ({ '--health-score': String(heroHealthScore) } as CSSProperties)
                      : undefined
                  }
                  aria-label={heroHealthScore != null ? `Channel health score ${heroHealthScore}` : 'Channel health score loading'}
                >
                  <span>{heroHealthScore ?? '…'}</span>
                </div>
                <div className="landing-insight-health-meta">
                  <span className="landing-insight-health-label">Channel Health</span>
                  <span className="landing-insight-health-track" aria-hidden>
                    <span
                      className="landing-insight-health-fill"
                      style={{ width: `${heroHealthScore ?? 0}%` }}
                    />
                  </span>
                </div>
              </div>
              <ul className="landing-insight-list">
                {heroInsights.length > 0 ? (
                  heroInsights.map((insight) => (
                    <li
                      key={`${insight.tag}-${insight.text}`}
                      className={`landing-insight-item${insight.tagVariant === 'leak' ? ' landing-insight-item-pulse' : ''}`}
                    >
                      <span className={`landing-insight-tag landing-insight-tag-${insight.tagVariant}`}>{insight.tag}</span>
                      <span className="landing-insight-text">{insight.text}</span>
                    </li>
                  ))
                ) : (
                  <>
                    <li className="landing-insight-item landing-insight-skeleton" aria-hidden>
                      <span className="landing-insight-tag landing-insight-tag-leak">CTR</span>
                      <span className="landing-insight-skel-line" />
                    </li>
                    <li className="landing-insight-item landing-insight-skeleton" aria-hidden>
                      <span className="landing-insight-tag landing-insight-tag-bad">Title</span>
                      <span className="landing-insight-skel-line" />
                    </li>
                    <li className="landing-insight-item landing-insight-skeleton" aria-hidden>
                      <span className="landing-insight-tag landing-insight-tag-opp">SEO</span>
                      <span className="landing-insight-skel-line" />
                    </li>
                    <li className="sr-only">Loading channel insights…</li>
                  </>
                )}
              </ul>
              <p className="landing-insight-footer">
                Example:{' '}
                <a href={heroChannelUrl} target="_blank" rel="noopener noreferrer">
                  {heroChannelLabel}
                </a>
                . Paste your channel to see yours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Product Dashboard Preview */}
      <section className="landing-section landing-section-alt" id="product">
        <div className="container landing-container">
          <span className="landing-section-eyebrow">Dashboard</span>
          <h2 className="landing-section-title">Product dashboard preview</h2>
          <p className="landing-section-sub">{productPreviewSubtitle}</p>
          {productPreviewError && <p className="landing-demo-error">{productPreviewError}</p>}
          {!productPreviewChannelInput.trim() ? (
            <div className="landing-dashboard-preview landing-dashboard-preview-empty">
              <p className="landing-dashboard-empty-copy">
                Paste your channel above to load your live dashboard preview.
              </p>
              <a href="#audit" className="btn btn-primary">
                Analyze My Channel
              </a>
            </div>
          ) : (
            <div className="landing-dashboard-preview">
              <div className="landing-dashboard-top">
                <div className="landing-channel-health">
                  <div
                    className="landing-channel-health-ring"
                    aria-label={
                      channelHealthScore != null
                        ? `Channel health score ${channelHealthScore} out of 100`
                        : 'Channel health score loading'
                    }
                  >
                    <span className="landing-channel-health-value">
                      {productPreviewLoading || channelHealthScore == null ? '…' : channelHealthScore}
                    </span>
                    <span className="landing-channel-health-max">/100</span>
                  </div>
                  <div className="landing-channel-health-copy">
                    <span className="landing-channel-health-label">Channel Health Score</span>
                    <span className="landing-channel-health-desc">
                      CTR, retention &amp; SEO signal composite
                    </span>
                  </div>
                  <div className="landing-channel-health-chart" aria-hidden />
                </div>
              </div>
              {productPreviewLoading && !productPreviewData ? (
                <p className="landing-dashboard-loading muted">Loading live channel analytics…</p>
              ) : productPreviewData ? (
                <>
                  <div className="landing-metrics-grid">
                    <div className="landing-metric-card">
                      <span className="landing-metric-value">{formatNumber(productPreviewData.subscribers)}</span>
                      <span className="landing-metric-label">Subscribers</span>
                    </div>
                    <div className="landing-metric-card">
                      <span className="landing-metric-value">{formatNumber(productPreviewData.totalViews)}</span>
                      <span className="landing-metric-label">Total Views</span>
                    </div>
                    <div className="landing-metric-card">
                      <span className="landing-metric-value">{formatNumber(productPreviewData.videos)}</span>
                      <span className="landing-metric-label">Videos</span>
                    </div>
                    <div className="landing-metric-card">
                      <span className="landing-metric-value">{`${productPreviewData.engagementRate.toFixed(2)}%`}</span>
                      <span className="landing-metric-label">Engagement Rate</span>
                    </div>
                  </div>
                  <div className="landing-top-videos-block">
                    <h3 className="landing-block-title">Top Performing Videos</h3>
                    <ul className="landing-video-list">
                      {productPreviewData.topVideos.map((v) => (
                        <li key={v.id} className="landing-video-item">
                          <span className="landing-video-item-title">{v.title}</span>
                          <span className="landing-video-item-views">{formatNumber(v.views)} views</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {enteredChannelValid && !hasPremium && productPreviewData && (
                    <div className="landing-dashboard-open-report">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleAnalyzeUserChannel}
                        disabled={auditSubmitting}
                      >
                        {auditSubmitting ? 'Opening report…' : 'Open full report →'}
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="landing-section landing-real-problems-section" aria-labelledby="real-problems-heading">
        <div className="container landing-container">
          <span className="landing-section-eyebrow">Creator reality</span>
          <h2 className="landing-section-title" id="real-problems-heading">Real Creator Growth Problems We Analyze</h2>
          <p className="landing-section-sub">
            Examples of the actual issues preventing small YouTube channels from growing.
          </p>
          <div className="landing-real-problems-grid">
            <article className="landing-real-problem-card">
              <div className="landing-real-problem-top">
                <span className="landing-real-problem-label">CTR signal</span>
                <span className="landing-real-problem-status">Flagged</span>
              </div>
              <h3>Low CTR</h3>
              <p>
                Your videos appear in search and browse, but thumbnails and titles are not
                earning clicks.
              </p>
              <ul className="landing-real-problem-metrics" aria-label="Low CTR indicators">
                <li><span>Impressions</span><strong>Present</strong></li>
                <li><span>Packaging</span><strong>Underperforming</strong></li>
              </ul>
            </article>
            <article className="landing-real-problem-card">
              <div className="landing-real-problem-top">
                <span className="landing-real-problem-label">Retention signal</span>
                <span className="landing-real-problem-status">Watching</span>
              </div>
              <h3>Weak Retention</h3>
              <p>
                People click but leave early because intros, pacing, or packaging lose
                attention.
              </p>
              <ul className="landing-real-problem-metrics" aria-label="Weak retention indicators">
                <li><span>Opening hook</span><strong>Needs proof faster</strong></li>
                <li><span>Viewer hold</span><strong>Drops too early</strong></li>
              </ul>
            </article>
            <article className="landing-real-problem-card">
              <div className="landing-real-problem-top">
                <span className="landing-real-problem-label">SEO signal</span>
                <span className="landing-real-problem-status">Opportunity</span>
              </div>
              <h3>Search Visibility</h3>
              <p>
                Your content may be targeting topics with low discoverability or poor keyword
                alignment.
              </p>
              <ul className="landing-real-problem-metrics" aria-label="Search visibility indicators">
                <li><span>Topic fit</span><strong>Too broad</strong></li>
                <li><span>Keyword match</span><strong>Needs clearer intent</strong></li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <AiGrowthStudio
        auditPreview={auditPreview}
        hasPremium={hasPremium}
        idToken={authSession?.idToken ?? null}
        onUnlock={handleUnlockReport}
      />

      <section className="landing-section landing-section-alt" id="growth-plan">
        <div className="container landing-container">
          <span className="landing-section-eyebrow">Growth plan</span>
          <h2 className="landing-section-title">Your personalized growth plan</h2>
          <p className="landing-section-sub">
            Preview what unlocks after your free audit — titles, keywords, and thumbnail strategy tailored to your channel.
          </p>
          <FullGrowthPlanSection
            userState={fullGrowthPlanUserState}
            auditPreview={auditPreview}
            pricingLoading={pricingLoading}
            onUnlock={handleUnlockReport}
            onViewFullReport={handleViewFullReport}
          />
        </div>
      </section>

      {/* 5. Why Creators Buy */}
      <section className="landing-section landing-section-alt landing-why-section">
        <div className="container landing-container">
          <h2 className="landing-section-title">Built by a Real Creator, for Real YouTube Growth</h2>
          <p className="landing-section-sub">
            YouTubeBooster AI is designed for creators who are tired of guessing. It reviews your channel like a growth consultant and gives you practical fixes for titles, thumbnails, SEO, packaging, and content strategy.{' '}
            <a href={heroChannelUrl} target="_blank" rel="noopener noreferrer">
              See the same audit flow on the creator&apos;s public channel ({heroChannelLabel})
            </a>
            .
          </p>
          <div className="landing-why-grid">
            <div className="landing-why-card">
              <span className="landing-why-icon" aria-hidden />
              <h3>Real Channel Audit</h3>
              <p>Uses your channel data to identify growth blockers.</p>
            </div>
            <div className="landing-why-card">
              <span className="landing-why-icon" aria-hidden />
              <h3>Creator-Friendly Fixes</h3>
              <p>Simple recommendations you can apply without being a YouTube expert.</p>
            </div>
            <div className="landing-why-card">
              <span className="landing-why-icon" aria-hidden />
              <h3>One-time unlock</h3>
              <p>No monthly subscription. Pay once and get your full report.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing */}
      <section className="landing-section landing-pricing-section" id="pricing" aria-labelledby="pricing-heading">
        <div className="container landing-container landing-pricing-inner">
          <span className="landing-section-eyebrow">One-time · no subscription</span>
          <h2 className="landing-section-title landing-pricing-headline landing-heading-display" id="pricing-heading">
            Professional Channel Growth Audit
          </h2>
          <p className="landing-pricing-lead">
            Unlock personalized recommendations, growth opportunities, and channel insights.
          </p>
          <div className="landing-pricing-card">
            <p className="landing-pricing-compare">See why your growth is stalled before you waste more uploads on guesswork.</p>
            <p className="landing-pricing-badge" role="note">
              Free preview first. Upgrade only if you want the full fix.
            </p>
            <div className="landing-pricing-price-row" aria-label="Price">
              <span className="landing-pricing-amount">{oneTimePriceLabel}</span>
              <span className="landing-pricing-period">one-time</span>
            </div>
            <ul className="landing-pricing-features">
              {UNLOCK_FEATURES.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <div className="landing-pricing-tier-compare" aria-label="Free preview versus full unlock">
              <div className="landing-pricing-tier-col">
                <h3 className="landing-pricing-tier-title">Free preview</h3>
                <ul className="landing-pricing-tier-list">
                  {FREE_PREVIEW_INCLUDES.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="landing-pricing-tier-col">
                <h3 className="landing-pricing-tier-title">Full unlock adds</h3>
                <ul className="landing-pricing-tier-list">
                  {pricingUnlockModules.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <form
              className="landing-pricing-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleUnlockReport();
              }}
            >
              {!authSession && (
                <>
                  <label className="field-label" htmlFor="landing-checkout-email">
                    Email for checkout
                  </label>
                  <input
                    id="landing-checkout-email"
                    type="email"
                    className="premium-input"
                    placeholder="you@example.com"
                    value={checkoutEmail}
                    onChange={(e) => {
                      setCheckoutEmail(e.target.value);
                      setPricingError('');
                    }}
                    autoComplete="email"
                    inputMode="email"
                  />
                  <p className="muted" style={{ margin: 0 }}>
                    Pay with Stripe first, then sign up with the same email to access your full report.
                  </p>
                </>
              )}
              {pricingError && <p className="landing-pricing-error">{pricingError}</p>}
              <button
                type="submit"
                className="btn btn-primary btn-lg landing-pricing-cta"
                disabled={pricingLoading || hasPremium}
              >
                {hasPremium
                  ? 'Already unlocked'
                  : pricingLoading
                    ? 'Starting checkout…'
                    : `Get My Full Growth Fix — ${oneTimePriceLabel}`}
              </button>
              <ul className="landing-pricing-trust-list" aria-label="Pricing trust signals">
                <li>One-time payment</li>
                <li>No subscription</li>
                <li>Instant access</li>
                <li>Free preview before you pay</li>
                <li>Public YouTube data only</li>
                <li>Secure checkout via Stripe</li>
              </ul>
              <p className="landing-pricing-microcopy">Unlock the full report after the free preview when you are ready.</p>
            </form>
          </div>
        </div>
      </section>

      {/* 7. FAQ */}
      <section className="landing-section landing-section-alt" id="faq" aria-labelledby="faq-heading">
        <div className="container landing-faq-container">
          <h2 className="landing-section-title" id="faq-heading">
            FAQ
          </h2>
          <p className="landing-section-sub landing-faq-lead">
            Most creators don&apos;t grow because they&apos;re guessing.
            <br />
            Here&apos;s how this tool fixes that.
          </p>
          <div className="landing-faq-list" role="presentation">
            <div className="landing-faq-column" role="list">
              {faqLeftColumn.map((item, i) => {
                const globalIndex = i;
                return (
                  <div
                    key={`faq-l-${i}`}
                    className={`landing-faq-item ${openFaq === globalIndex ? 'open' : ''}`}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="landing-faq-question"
                      aria-expanded={openFaq === globalIndex}
                      aria-controls={`faq-panel-${globalIndex}`}
                      id={`faq-q-${globalIndex}`}
                      onClick={() => setOpenFaq(openFaq === globalIndex ? null : globalIndex)}
                    >
                      {item.question}
                    </button>
                    <div
                      id={`faq-panel-${globalIndex}`}
                      className="landing-faq-answer"
                      role="region"
                      aria-labelledby={`faq-q-${globalIndex}`}
                      aria-hidden={openFaq !== globalIndex}
                    >
                      <p>{item.answer}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="landing-faq-column" role="list">
              {faqRightColumn.map((item, i) => {
                const globalIndex = i + faqLeftColumn.length;
                return (
                  <div
                    key={`faq-r-${i}`}
                    className={`landing-faq-item ${openFaq === globalIndex ? 'open' : ''}`}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="landing-faq-question"
                      aria-expanded={openFaq === globalIndex}
                      aria-controls={`faq-panel-${globalIndex}`}
                      id={`faq-q-${globalIndex}`}
                      onClick={() => setOpenFaq(openFaq === globalIndex ? null : globalIndex)}
                    >
                      {item.question}
                    </button>
                    <div
                      id={`faq-panel-${globalIndex}`}
                      className="landing-faq-answer"
                      role="region"
                      aria-labelledby={`faq-q-${globalIndex}`}
                      aria-hidden={openFaq !== globalIndex}
                    >
                      <p>{item.answer}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 8. Growth guides gateway + primary CTA */}
      <section className="landing-section landing-growth-guides-section" aria-labelledby="growth-guides-heading">
        <div className="container landing-container landing-growth-guides-inner">
          <p className="landing-growth-guides-skip">
            <a href="#pricing" className="landing-growth-guides-skip-link">
              Skip to pricing
            </a>
          </p>
          <h2 className="landing-growth-guides-title landing-heading-display" id="growth-guides-heading">
            Explore Growth Guides, Audit Topics, and Comparisons
          </h2>
          <p className="landing-growth-guides-sub">
            Indexable, useful resources for creators who want practical answers on CTR, titles, thumbnails, SEO, retention, and better publishing decisions.
          </p>
          <div className="landing-comparison-links" aria-labelledby="homepage-compare-heading">
            <h3 className="landing-growth-guide-card-title" id="homepage-compare-heading">
              Tool comparisons
            </h3>
            <ul className="landing-comparison-links-list">
              {HOMEPAGE_COMPARISON_LINKS.map((item) => (
                <li key={item.path}>
                  <Link to={item.path} className="landing-comparison-link">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-guide-directory-grid">
            {HOMEPAGE_GUIDE_GROUPS.map((group, index) => (
              <section key={group.title} className="landing-guide-directory-card" aria-labelledby={`guide-group-${index}`}>
                <h3 className="landing-growth-guide-card-title" id={`guide-group-${index}`}>{group.title}</h3>
                <ul className="landing-guide-directory-links">
                  {group.pages.map((page) => (
                    <li key={page.path}>
                      <Link to={page.path} className="landing-guide-directory-link">
                        {page.cardTitle}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </section>
      </main>

      <div ref={stickyCtaRef} className="landing-mobile-sticky-cta">
        <a href="#audit" className="btn btn-primary btn-lg landing-mobile-sticky-cta-btn">
          Analyze Your Channel
        </a>
      </div>

      <MarketingFooter showFinalCta />
    </div>
  );
}
