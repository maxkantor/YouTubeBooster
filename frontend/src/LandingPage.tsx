import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from './config/brand';
import { analytics } from './lib/analytics';
import { DEFAULT_DEMO_CHANNEL, getStoredDemoChannel, setStoredDemoChannel } from './lib/demo';
import { validateYouTubeChannelInput } from './lib/youtubeChannelInput';
import { billingApi, meApi, publicApi } from './lib/api';
import { useAuth } from './AuthContext';
import { usePricing } from './PricingContext';
import { AiGrowthStudio } from './components/AiGrowthStudio';

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
  'Find what’s killing your views',
  'Fix your titles for higher CTR',
  'Discover missed traffic opportunities',
  'Get simple steps to grow fast',
  'Save your report & track progress'
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
  countdownLabel,
  pricingLoading,
  onUnlock,
  onViewFullReport
}: {
  userState: FullGrowthPlanUserState;
  auditPreview: AuditPreviewData;
  countdownLabel: string;
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
              <span>+2,184 creators improved their channel this week</span>
              <span>Avg +312% views in 30 days</span>
            </div>
            <p className="landing-growth-plan-urgency">⏳ Your report expires in {countdownLabel}</p>
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
  const faqLeftColumn = useMemo(
    () => [
      {
        q: 'Will this actually help me get more views?',
        a: 'Yes — the AI identifies what’s limiting your growth (low CTR, weak titles, missed keywords) and gives you exact fixes you can apply immediately.'
      },
      {
        q: 'What results should I expect?',
        a: 'Most users improve click-through rate and video performance by fixing titles and packaging — the fastest way to grow.'
      },
      {
        q: 'Is this safe for my YouTube account?',
        a: 'Yes. No login required. We don’t modify anything — you stay in full control.'
      },
      {
        q: 'Is this a subscription?',
        a: 'No — one-time payment. No recurring fees.'
      },
      {
        q: 'Do I need any technical setup?',
        a: 'No. Paste your channel URL and click analyze.'
      }
    ],
    []
  );
  const faqRightColumn = useMemo(
    () => [
      {
        q: 'How is this different from TubeBuddy or vidIQ?',
        a: 'Those tools show data. This tells you what to DO with it — titles, ideas, and strategies ready to use.'
      },
      {
        q: `Why is it only ${oneTimePriceLabel}?`,
        a: 'This is designed as a fast, high-impact tool — not a bloated subscription. You get value instantly.'
      },
      {
        q: 'Can I analyze any channel?',
        a: 'Yes — yours, competitors, or any channel in your niche.'
      },
      {
        q: 'What happens after purchase?',
        a: 'You unlock full AI insights, Growth Studio tools, and all recommendations instantly.'
      },
      {
        q: 'Will this work for small channels?',
        a: 'Yes — small channels benefit the most by fixing mistakes early.'
      }
    ],
    [oneTimePriceLabel]
  );
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
  const [countdownSec, setCountdownSec] = useState(14 * 60 + 32);
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
      ? `Live snapshot for ${productPreviewLabel} using your paid channel data.`
      : 'Paid account detected. Add a valid channel URL above to load your real metrics and top videos.'
    : 'Preview of the paid dashboard experience with sample channel data. Upgrade to see your own metrics and top videos.';
  const productPreviewMetrics = productPreviewData ?? {
    ...EXAMPLE_DASHBOARD_METRICS,
    topVideos: EXAMPLE_VIDEOS
  };
  const countdownLabel = useMemo(() => {
    const mins = String(Math.floor(countdownSec / 60)).padStart(2, '0');
    const secs = String(countdownSec % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }, [countdownSec]);

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
    const timer = window.setInterval(() => {
      setCountdownSec((prev) => (prev <= 0 ? 14 * 60 + 32 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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
                  href="https://www.youtubeboosterai.com/#audit"
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
                  href="https://www.youtubeboosterai.com/#audit"
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
        <div className="container landing-hero-grid">
          <div className="landing-hero-content">
            <h1 className="landing-hero-title" id="hero-heading">
              <span className="landing-hero-title-line landing-heading-display">Turn Every Upload Into a Growth Asset</span>
            </h1>
            <p className="landing-hero-sub">
              Elite AI pinpoints what is suppressing CTR, watch time, and discovery—then gives you exact fixes you can apply in minutes.
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
            <div className="landing-hero-proof-strip" aria-label="Social proof">
              <span><strong>2,184+</strong> creators improved channels this week</span>
              <span><strong>+312%</strong> avg views lift in 30 days</span>
              <span><strong>One-time</strong> payment model</span>
            </div>
            <ul className="landing-hero-trust" aria-label="Trust">
              <li>
                <span className="landing-trust-check" aria-hidden />
                <span>Find what’s killing your clicks</span>
              </li>
              <li>
                <span className="landing-trust-check" aria-hidden />
                <span>Fix titles, thumbnails, and SEO fast</span>
              </li>
              <li>
                <span className="landing-trust-check" aria-hidden />
                <span>Spot videos with breakout potential</span>
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

      <AiGrowthStudio
        auditPreview={auditPreview}
        hasPremium={hasPremium}
        idToken={authSession?.idToken ?? null}
        onUnlock={handleUnlockReport}
      />

      {/* 5. Why Creators Buy */}
      <section className="landing-section landing-section-alt">
        <div className="container landing-container">
          <h2 className="landing-section-title">Why creators buy this</h2>
          <div className="landing-why-grid">
            <div className="landing-why-card">
              <h3>Stop guessing</h3>
              <p>Know exactly what is blocking your growth.</p>
            </div>
            <div className="landing-why-card">
              <h3>Data-driven insights</h3>
              <p>Recommendations based on your real channel data.</p>
            </div>
            <div className="landing-why-card">
              <h3>One-time unlock</h3>
              <p>Pay once. No subscriptions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Pricing */}
      <section className="landing-section landing-pricing-section" id="pricing" aria-labelledby="pricing-heading">
        <div className="container landing-container landing-pricing-inner">
          <span className="landing-section-eyebrow">One-time · no subscription</span>
          <h2 className="landing-section-title landing-pricing-headline landing-heading-display landing-nowrap-desktop" id="pricing-heading">
            See Why Your Channel Isn’t Growing — Fix It in Minutes
          </h2>
          <p className="landing-pricing-lead landing-nowrap-desktop">
            Start with a free preview using the demo channel — upgrade only if you want the full fix.
          </p>
          <div className="landing-pricing-card">
            <p className="landing-pricing-compare">Similar audits cost $100+ — get yours for {oneTimePriceLabel}</p>
            <p className="landing-pricing-badge" role="note">
              🔥 Most channels under 1K subs make these mistakes
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
                    : `Get My Growth Fix — ${oneTimePriceLabel}`}
              </button>
              <p className="landing-pricing-microcopy">One-time payment. No subscription. Instant access.</p>
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
                      {item.q}
                    </button>
                    <div
                      id={`faq-panel-${globalIndex}`}
                      className="landing-faq-answer"
                      role="region"
                      aria-labelledby={`faq-q-${globalIndex}`}
                      aria-hidden={openFaq !== globalIndex}
                    >
                      <p>{item.a}</p>
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
                      {item.q}
                    </button>
                    <div
                      id={`faq-panel-${globalIndex}`}
                      className="landing-faq-answer"
                      role="region"
                      aria-labelledby={`faq-q-${globalIndex}`}
                      aria-hidden={openFaq !== globalIndex}
                    >
                      <p>{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="landing-faq-post-cta">
            <p className="landing-pricing-microcopy">Still unsure? Run a free channel audit — no signup required.</p>
            <a href="#audit" className="btn btn-primary">
              Analyze your channel
            </a>
          </div>
        </div>
      </section>

      {/* 8. Final CTA */}
      <section className="landing-section landing-cta-section" aria-labelledby="cta-heading">
        <div className="container landing-container landing-cta-inner">
          <h2 className="landing-cta-title landing-heading-display" id="cta-heading">
            Stop guessing what the algorithm wants.
          </h2>
          <p className="landing-cta-sub">Run your AI channel audit now.</p>
          <a href="#audit" className="btn btn-primary btn-lg landing-cta-btn">
            Analyze your channel
          </a>
        </div>
      </section>
      </main>

      {/* 9. Footer */}
      <footer className="landing-site-footer">
        <div className="landing-site-footer-divider" aria-hidden />
        <div className="container landing-site-footer-inner">
          <div className="landing-site-footer-brand">
            <Link
              to="/"
              className="landing-site-footer-logo brand-link brand-with-play"
              aria-label={`${BRAND.name} home`}
            >
              <span className="brand-play-icon" aria-hidden />
              <span className="landing-logo-yt">{BRAND.namePart1}</span>
              <span className="landing-logo-boost">{BRAND.namePart2}</span>
            </Link>
            <p className="landing-site-footer-tagline">
              AI-powered YouTube growth audits for creators who want more views.
            </p>
          </div>
          <nav className="landing-site-footer-nav" aria-label="Footer">
            <div className="landing-site-footer-col">
              <h3 className="landing-site-footer-col-title">Company</h3>
              <ul className="landing-site-footer-links">
                <li>
                  <Link to="/about">About Us</Link>
                </li>
                <li>
                  <Link to="/contact">Contact</Link>
                </li>
                <li>
                  <Link to="/platform">Platform</Link>
                </li>
              </ul>
            </div>
            <div className="landing-site-footer-col">
              <h3 className="landing-site-footer-col-title">Legal</h3>
              <ul className="landing-site-footer-links">
                <li>
                  <Link to="/privacy">Privacy Policy</Link>
                </li>
                <li>
                  <Link to="/disclaimer">Disclaimer</Link>
                </li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="landing-site-footer-bottom">
          <p className="landing-site-footer-copy">© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
