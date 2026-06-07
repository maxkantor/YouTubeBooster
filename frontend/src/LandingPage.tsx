import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from './config/brand';
import { MarketingFooter } from './components/MarketingFooter';
import { analytics } from './lib/analytics';
import { DEFAULT_DEMO_CHANNEL, getStoredDemoChannel, setStoredDemoChannel } from './lib/demo';
import { validateYouTubeChannelInput } from './lib/youtubeChannelInput';
import { billingApi, meApi, publicApi } from './lib/api';
import { useAuth } from './AuthContext';
import { usePricing } from './PricingContext';
import { AiGrowthStudio } from './components/AiGrowthStudio';
import { HOMEPAGE_COMPARISON_LINKS } from './seo/comparisonPageData';
import { HOMEPAGE_GUIDE_GROUPS } from './seo/growthGuides';
import { HOMEPAGE_FAQS } from './seo/homepageFaq';

const DEMO_STORAGE_KEY = 'ybai_demo';

const EXAMPLE_VIDEOS = [
  { title: 'How to Make Pickled Eggplants with Mushrooms', views: 9596, id: '3BxAR1565k' },
  { title: 'Chicken Breast Pâté / Spread — Quick & Fancy', views: 9559, id: 'ozTRk69sNAw' },
  { title: 'How to Make Georgian-style Pickled Cabbage', views: 7948, id: 'aU5WF88yPZg' },
  { title: 'How to Make Belyashi (Fried Meat Buns)', views: 6201, id: 'belyashi-ex' }
];

const EXAMPLE_DASHBOARD_METRICS = {
  subscribers: 5770,
  totalViews: 515218,
  videos: 188,
  engagementRate: 3.42
};

const UNLOCK_FEATURES = [
  'Find what is killing your views',
  'Fix weak titles and low CTR',
  'Discover missed keyword and traffic opportunities',
  'Improve thumbnails and video packaging',
  'Save your report and track progress'
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
  const faqLeftColumn = useMemo(() => HOMEPAGE_FAQS.slice(0, 3), []);
  const faqRightColumn = useMemo(() => HOMEPAGE_FAQS.slice(3), []);
  const { session: authSession, signOut: authSignOut } = useAuth();
  const [demoInput, setDemoInput] = useState('');
  const [demoError, setDemoError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const [hasPremium, setHasPremium] = useState(false);
  const [userChannelUrl, setUserChannelUrl] = useState('');
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [auditRevealed, setAuditRevealed] = useState(false);
  const [opportunityStates, setOpportunityStates] = useState<Record<OpportunityId, 'idle' | 'showing' | 'locked'>>({
    titles: 'idle',
    description: 'idle',
    pattern: 'idle',
    ctr: 'idle'
  });
  const [fixCardsBlurred, setFixCardsBlurred] = useState([false, false, false, false]);
  const [productPreviewLoading, setProductPreviewLoading] = useState(false);
  const [productPreviewError, setProductPreviewError] = useState('');
  const [productPreviewData, setProductPreviewData] = useState<{
    subscribers: number;
    totalViews: number;
    videos: number;
    engagementRate: number;
    topVideos: Array<{ id: string; title: string; views: number }>;
  } | null>(null);
  const pricingViewedRef = useRef(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const auditSectionRef = useRef<HTMLElement | null>(null);
  const opportunityTimeoutsRef = useRef<Record<string, number>>({});

  const previewChannelInput = demoInput.trim() || getStoredDemoChannel() || DEFAULT_EXAMPLE_PREVIEW_CHANNEL;
  const auditPreview = useMemo(() => buildAuditPreview(previewChannelInput), [previewChannelInput]);
  const paidPreviewChannelInput = useMemo(() => {
    const entered = demoInput.trim();
    if (entered) {
      const validated = validateYouTubeChannelInput(entered);
      if (validated.ok) return validated.normalized;
    }
    return userChannelUrl.trim();
  }, [demoInput, userChannelUrl]);
  const productPreviewChannelInput = hasPremium ? paidPreviewChannelInput : DEFAULT_DEMO_CHANNEL;
  const productPreviewLabel = normalizeChannelLabel(productPreviewChannelInput || DEFAULT_DEMO_CHANNEL);
  const productPreviewSubtitle = hasPremium
    ? productPreviewChannelInput
      ? `Live snapshot for ${productPreviewLabel} using your paid channel data, channel audit signals, and real YouTube analytics.`
      : 'Paid account detected. Add a valid channel URL above to load your real YouTube analytics, packaging insights, and top videos.'
    : 'Preview of the paid dashboard with sample YouTube analytics, channel audit signals, and video packaging insights. Upgrade to see your own metrics, SEO issues, and top videos.';
  const productPreviewMetrics = productPreviewData ?? {
    ...EXAMPLE_DASHBOARD_METRICS,
    topVideos: EXAMPLE_VIDEOS
  };

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
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
    const el = auditSectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setAuditRevealed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!auditRevealed) return;
    let frame = 0;
    const target = Math.max(0, Math.min(100, auditPreview.score));
    const step = Math.max(1, Math.ceil(target / 36));
    const timer = window.setInterval(() => {
      frame += step;
      setScoreDisplay((prev) => {
        const next = Math.max(prev, frame);
        return next >= target ? target : next;
      });
      if (frame >= target) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [auditRevealed, auditPreview.score]);

  useEffect(() => {
    if (!auditRevealed) return;
    setFixCardsBlurred([false, false, false, false]);
    const timers = [
      window.setTimeout(() => setFixCardsBlurred((prev) => [true, prev[1], prev[2], prev[3]]), 2200),
      window.setTimeout(() => setFixCardsBlurred((prev) => [prev[0], true, prev[2], prev[3]]), 3000),
      window.setTimeout(() => setFixCardsBlurred((prev) => [prev[0], prev[1], true, prev[3]]), 3800),
      window.setTimeout(() => setFixCardsBlurred((prev) => [prev[0], prev[1], prev[2], true]), 4600)
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [auditRevealed]);

  useEffect(() => {
    return () => {
      Object.values(opportunityTimeoutsRef.current).forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    const channel = productPreviewChannelInput.trim();
    if (!channel) {
      setProductPreviewData(null);
      setProductPreviewError('');
      setProductPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setProductPreviewLoading(true);
    setProductPreviewError('');

    (async () => {
      try {
        const [overview, videos] = await Promise.all([
          publicApi.analyzeChannel(channel, 30),
          publicApi.listVideos(channel, 50)
        ]);

        if (cancelled) return;

        const topVideos = [...(videos ?? [])]
          .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
          .slice(0, 4)
          .map((v) => ({
            id: v.video_id,
            title: v.title,
            views: Number(v.view_count ?? 0)
          }));

        setProductPreviewData({
          subscribers: Number(overview.channel_info?.subscriber_count ?? 0),
          totalViews: Number(overview.video_performance?.total_views ?? 0),
          videos: Number(overview.video_performance?.total_videos ?? 0),
          engagementRate: Number(overview.video_performance?.avg_engagement_rate ?? 0),
          topVideos
        });
      } catch (err) {
        if (cancelled) return;
        setProductPreviewData(null);
        setProductPreviewError(err instanceof Error ? err.message : 'Could not load live dashboard preview data.');
      } finally {
        if (!cancelled) setProductPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productPreviewChannelInput]);

  function handleTryAIFix(id: OpportunityId) {
    const current = opportunityTimeoutsRef.current[id];
    if (current) window.clearTimeout(current);
    setOpportunityStates((prev) => ({ ...prev, [id]: 'showing' }));
    opportunityTimeoutsRef.current[id] = window.setTimeout(() => {
      setOpportunityStates((prev) => ({ ...prev, [id]: 'locked' }));
    }, 2000);
  }

  function handleOpenInstantDemo() {
    setStoredDemoChannel(DEFAULT_DEMO_CHANNEL);
    analytics.channelAuditStarted(DEFAULT_DEMO_CHANNEL);
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
    analytics.channelAuditStarted(normalized);
    setStoredDemoChannel(normalized);
    if (hasPremium) {
      navigate(`/dashboard/channel?channel=${encodeURIComponent(normalized)}`, {
        replace: true,
        state: { channelInput: normalized }
      });
    } else {
      navigate(`/demo?channel=${encodeURIComponent(normalized)}`, { replace: true, state: { channelInput: normalized } });
    }
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

      if (!authSession) {
        // Never allow purchase when not authenticated. Redirect to signup and let the user unlock
        // again after authentication.
        navigate(
          `/auth/signup?returnTo=${encodeURIComponent('/#pricing')}&channel=${encodeURIComponent('')}&plan=premium`
        );
        return;
      }

      if (hasPremium) {
        setPricingError('You already have premium access.');
        return;
      }

      // Channel is optional for purchase. If missing, send a safe placeholder.
      // Backend uses it for metadata only; user can connect their channel later.
      if (!channelInput) channelInput = 'account';

      setPricingLoading(true);
      setPricingError('');
      const checkout = await billingApi.createCheckoutSession(authSession.idToken, channelInput, 'premium');
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
      {/* 1. Header */}
      <header className={`landing-header ${navScrolled ? 'landing-header-scrolled' : ''}`}>
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
                  href="https://youtubeboosterai.com/#audit"
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
                  href="https://youtubeboosterai.com/#audit"
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
        <div className="landing-hero-bg" aria-hidden>
          <div className="landing-hero-bg-vignette" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-1" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-2" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-3" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-4" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-5" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-6" />
          <div className="landing-hero-bg-ribbon landing-hero-bg-ribbon-7" />
          <div className="landing-hero-bg-glow-red" />
          <div className="landing-hero-bg-lines">
            <span className="landing-hero-bg-line landing-hero-bg-line-1" />
            <span className="landing-hero-bg-line landing-hero-bg-line-2" />
            <span className="landing-hero-bg-line landing-hero-bg-line-3" />
          </div>
          <div className="landing-hero-bg-content-overlay" />
          <div className="landing-hero-bg-audit-overlay" />
        </div>
        <div className="landing-hero-headline-row">
          <div className="container">
            <h1 className="landing-hero-title landing-hero-brand-h1" id="hero-heading">
              {BRAND.name}
            </h1>
            <h2 className="landing-hero-tagline-h2">
              AI-Powered YouTube Channel Audit &amp; Growth Platform
            </h2>
          </div>
        </div>
        <div className="container landing-hero-grid">
          <div className="landing-hero-content">
            <p className="landing-hero-sub">
              {BRAND.heroDescription}
            </p>
            <p className="landing-hero-trust-copy">
              Built for small YouTube creators who need clear fixes -- not generic advice.
            </p>
            <div className="landing-hero-buttons">
              <a href="#audit" className="btn btn-lg landing-hero-cta-primary landing-cta-premium">
                Analyze Your Channel
              </a>
              <button type="button" className="btn btn-lg landing-hero-cta-secondary landing-cta-secondary-premium" onClick={handleOpenInstantDemo}>
                See Instant Demo
              </button>
            </div>
            <p className="landing-hero-micro">Free preview • ~60 seconds • No signup required</p>
            <div className="landing-hero-proof-strip" aria-label="Trust signals">
              <span><strong>Free preview</strong> before you unlock the full report</span>
              <span><strong>No subscription</strong> or recurring tool stack</span>
              <span><strong>CTR, SEO, retention</strong> in one channel audit</span>
            </div>
            <ul className="landing-hero-trust" aria-label="Trust">
              <li>
                <span className="landing-trust-check" aria-hidden />
                <span>Spot weak YouTube CTR and thumbnail optimization issues</span>
              </li>
              <li>
                <span className="landing-trust-check" aria-hidden />
                <span>Fix titles, video packaging, and YouTube SEO faster</span>
              </li>
              <li>
                <span className="landing-trust-check" aria-hidden />
                <span>See retention leaks and missed small creator growth opportunities</span>
              </li>
            </ul>
          </div>
          <div className="landing-hero-preview" aria-hidden>
            <div className="landing-hero-insight-panel landing-insight-glass">
              <div className="landing-insight-panel-top">
                <span className="landing-insight-pulse" aria-hidden />
                <span className="landing-insight-panel-label-single">Live Channel Audit</span>
              </div>
              <ul className="landing-insight-list">
                <li className="landing-insight-item landing-insight-item-pulse">
                  <span className="landing-insight-tag landing-insight-tag-leak">CTR</span>
                  <span className="landing-insight-text">Low CTR (2.1%) — below your niche average</span>
                </li>
                <li className="landing-insight-item">
                  <span className="landing-insight-tag landing-insight-tag-bad">Title</span>
                  <span className="landing-insight-text">Title not optimized for search</span>
                </li>
                <li className="landing-insight-item">
                  <span className="landing-insight-tag landing-insight-tag-opp">SEO</span>
                  <span className="landing-insight-text">Missed high-volume keyword</span>
                </li>
                <li className="landing-insight-item">
                  <span className="landing-insight-tag landing-insight-tag-opp">Opportunity</span>
                  <span className="landing-insight-text">Video with breakout potential</span>
                </li>
              </ul>
              <p className="landing-insight-footer">Analyze your channel to see your results.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Audit entry */}
      <section className="landing-demo-entry landing-audit-section" id="audit">
        <div className="landing-demo-entry-inner">
          <span className="landing-section-eyebrow">Free audit</span>
          <h2 className="landing-section-title">Run your free channel audit now</h2>
          <p className="landing-section-sub landing-nowrap-desktop">
            Paste your channel URL or @handle to get an AI growth breakdown with your highest-impact next steps.
          </p>

          <div className="landing-audit-single-panel">
            <div className="landing-demo-input-wrap">
              <input
                type="text"
                className="landing-demo-input"
                placeholder="Paste a YouTube channel URL or @handle"
                value={demoInput}
                onChange={(e) => {
                  setDemoInput(e.target.value);
                  setDemoError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeUserChannel()}
                aria-invalid={!!demoError}
                aria-describedby={demoError ? 'audit-channel-error' : undefined}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg landing-audit-cta"
              onClick={handleAnalyzeUserChannel}
            >
              Analyze My Channel
            </button>
            {demoError && (
              <p id="audit-channel-error" className="landing-demo-error" role="alert">
                {demoError}
              </p>
            )}
            <p className="landing-audit-option-hint">
              Examples: https://youtube.com/@channelname or @channelname
            </p>
            <button type="button" className="landing-audit-demo-link" onClick={handleOpenInstantDemo}>
              Want a quick sample first? Open the instant demo.
            </button>
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
          <div className="landing-dashboard-preview">
            <div className="landing-metrics-grid">
              <div className="landing-metric-card">
                <span className="landing-metric-value">{productPreviewLoading ? '…' : formatNumber(productPreviewMetrics.subscribers)}</span>
                <span className="landing-metric-label">Subscribers</span>
              </div>
              <div className="landing-metric-card">
                <span className="landing-metric-value">{productPreviewLoading ? '…' : formatNumber(productPreviewMetrics.totalViews)}</span>
                <span className="landing-metric-label">Total Views</span>
              </div>
              <div className="landing-metric-card">
                <span className="landing-metric-value">{productPreviewLoading ? '…' : formatNumber(productPreviewMetrics.videos)}</span>
                <span className="landing-metric-label">Videos</span>
              </div>
              <div className="landing-metric-card">
                <span className="landing-metric-value">{productPreviewLoading ? '…' : `${productPreviewMetrics.engagementRate.toFixed(2)}%`}</span>
                <span className="landing-metric-label">Engagement Rate</span>
              </div>
            </div>
            <div className="landing-top-videos-block">
              <h3 className="landing-block-title">Top Performing Videos</h3>
              <ul className="landing-video-list">
                {productPreviewMetrics.topVideos.map((v) => (
                  <li key={v.id} className="landing-video-item">
                    <span className="landing-video-item-title">{v.title}</span>
                    <span className="landing-video-item-views">{formatNumber(v.views)} views</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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

      {/* 5. Why Creators Buy */}
      <section className="landing-section landing-section-alt landing-why-section">
        <div className="container landing-container">
          <h2 className="landing-section-title">Built by a Real Creator, for Real YouTube Growth</h2>
          <p className="landing-section-sub">
            YouTubeBooster AI is designed for creators who are tired of guessing. It reviews your channel like a growth consultant and gives you practical fixes for titles, thumbnails, SEO, packaging, and content strategy.
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
          <h2 className="landing-section-title landing-pricing-headline landing-heading-display landing-nowrap-desktop" id="pricing-heading">
            See Why Your Channel Isn&apos;t Growing -- Unlock the Full Fix for {oneTimePriceLabel}
          </h2>
          <p className="landing-pricing-lead landing-nowrap-desktop">
            Start with a free preview. Upgrade only if you want the full channel audit, recommendations, and growth plan.
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
            <div className="landing-pricing-form">
              {!authSession && (
                <p className="muted" style={{ margin: 0 }}>
                  Sign up to check out. We’ll bring you back here to pay.
                </p>
              )}
              {pricingError && <p className="landing-pricing-error">{pricingError}</p>}
              <button
                type="button"
                className="btn btn-primary btn-lg landing-pricing-cta"
                onClick={handleUnlockReport}
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
              </ul>
              <p className="landing-pricing-microcopy">Unlock the full report after the free preview when you are ready.</p>
            </div>
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

      <MarketingFooter showFinalCta />
    </div>
  );
}
