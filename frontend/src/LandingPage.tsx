import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from './config/brand';
import { analytics } from './lib/analytics';
import { DEFAULT_DEMO_CHANNEL, getStoredDemoChannel, setStoredDemoChannel } from './lib/demo';
import { billingApi, publicApi } from './lib/api';
import { useAuth } from './AuthContext';

const DEMO_STORAGE_KEY = 'ybai_demo';

const EXAMPLE_VIDEOS = [
  { title: 'How to Make Pickled Eggplants with Mushrooms', views: '9,596', id: '3BxAR1565k' },
  { title: 'Chicken Breast Pâté / Spread — Quick & Fancy', views: '9,559', id: 'ozTRk69sNAw' },
  { title: 'How to Make Georgian-style Pickled Cabbage', views: '7,948', id: 'aU5WF88yPZg' },
  { title: 'How to Make Belyashi (Fried Meat Buns)', views: '6,201', id: 'belyashi-ex' }
];

const DETECT_CARDS = [
  { title: 'Title Weakness Detection', desc: 'Find titles that limit click-through rate.' },
  { title: 'SEO Gap Analysis', desc: 'Identify missing keywords and ranking opportunities.' },
  { title: 'Traffic Leak Detection', desc: 'See where viewers drop before subscribing.' },
  { title: 'Content Pattern Discovery', desc: 'AI finds what your best videos have in common.' },
  { title: 'Publishing Strategy', desc: 'Reveal optimal upload timing and cadence.' },
  { title: 'Growth Opportunities', desc: 'Find the fastest path to more views and subscribers.' }
];

const BLURRED_INSIGHTS = [
  'CTR optimization recommendations',
  'Title rewrite suggestions',
  'SEO keyword opportunities',
  'Traffic growth insights'
];

const FAQ_ITEMS = [
  { q: 'Is this a subscription?', a: 'No. This is a one-time purchase.' },
  { q: 'Do I need technical setup?', a: 'No. Just paste your channel URL.' },
  { q: 'Can I analyze any channel?', a: 'Yes. Any public YouTube channel.' },
  { q: 'What happens after purchase?', a: 'You unlock the full AI dashboard.' },
  { q: 'Is this source code?', a: 'No. This is a hosted analytics platform.' }
];

const UNLOCK_FEATURES = [
  'Full AI growth audit',
  'SEO title rewrites',
  'Traffic opportunity insights',
  'Content strategy recommendations',
  'Saved dashboard access',
  'Future dashboard improvements'
];

const PLATFORM_URL = 'https://mk-ai-performance.com';

export function LandingPage() {
  const navigate = useNavigate();
  const { session: authSession, signOut: authSignOut } = useAuth();
  const [demoInput, setDemoInput] = useState('');
  const [demoError, setDemoError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [pricingEmail, setPricingEmail] = useState('');
  const [pricingChannel, setPricingChannel] = useState('');
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState('');

  const pricingViewedRef = useRef(false);
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (window.location.hash === '#audit') {
      const scrollToAudit = () => {
        const el = document.getElementById('audit');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      requestAnimationFrame(() => requestAnimationFrame(scrollToAudit));
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

  function handleAnalyzeUserChannel() {
    const channel = demoInput.trim();
    setDemoError('');
    if (!channel) {
      setDemoError('Enter a channel URL or @handle.');
      return;
    }
    analytics.channelAuditStarted(channel);
    setStoredDemoChannel(channel);
    navigate(`/demo?channel=${encodeURIComponent(channel)}`, { replace: true, state: { channelInput: channel } });
  }

  async function handleUnlockReport() {
    const channel = pricingChannel.trim() || undefined;
    try {
      const stored = sessionStorage.getItem(DEMO_STORAGE_KEY);
      const storedDemo = getStoredDemoChannel();
      let channelInput = channel;
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
          `/auth/signup?returnTo=${encodeURIComponent('/#pricing')}&channel=${encodeURIComponent(
            channelInput || ''
          )}&plan=premium`
        );
        return;
      }

      if (!channelInput) {
        setPricingError('Enter a channel URL (or analyze a demo first).');
        return;
      }

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

  return (
    <div className="landing">
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
          <nav className="landing-nav landing-nav-center" aria-label="Page">
            <a href="#product" className="landing-nav-link">
              Product
            </a>
            <a href="#example-audit" className="landing-nav-link">
              Example Audit
            </a>
            <a href="#pricing" className="landing-nav-link">
              Pricing
            </a>
            <a href="#faq" className="landing-nav-link">
              FAQ
            </a>
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
              </>
            ) : (
              <>
                <Link className="landing-nav-link landing-nav-auth" to="/auth/signin">
                  Sign In
                </Link>
                <Link className="landing-nav-link landing-nav-auth landing-nav-auth-strong" to="/auth/signup">
                  Sign Up
                </Link>
              </>
            )}
            <a href="/#audit" className="landing-nav-cta landing-nav-cta-primary">
              Analyze Channel
            </a>
          </div>
        </div>
      </header>
      <div className="landing-header-rule" aria-hidden />

      {/* 2. Hero */}
      <section className="landing-hero">
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
            <h1 className="landing-hero-title">
              <span className="landing-hero-title-line">Get More Views Without Guessing</span>
            </h1>
            <p className="landing-hero-sub">
              See exactly what’s stopping your growth—and fix it to increase views, subscribers, and watch time in minutes.
            </p>
            <div className="landing-hero-buttons">
              <a href="#audit" className="btn btn-lg landing-hero-cta-primary landing-cta-premium">
                Analyze Your Channel
              </a>
              <a href="#audit" className="btn btn-lg landing-hero-cta-secondary landing-cta-secondary-premium">
                Analyze Default Channel
              </a>
            </div>
            <p className="landing-hero-micro">Free • 60 seconds • No signup</p>
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

      {/* 3. Audit entry — two options: default demo (full) vs user channel (preview) */}
      <section className="landing-demo-entry landing-audit-section" id="audit">
        <div className="landing-demo-entry-inner">
          <span className="landing-section-eyebrow">Free audit</span>
          <h2 className="landing-section-title">Run your free channel audit</h2>
          <p className="landing-section-sub">
            Analyze any YouTube channel and uncover hidden growth opportunities in seconds.
          </p>

          <div className="landing-audit-options">
            <div className="landing-audit-option landing-audit-option-highlight">
              <h3 className="landing-audit-option-label">Default demo channel</h3>
              <div className="landing-demo-input-wrap">
                <input
                  type="text"
                  className="landing-demo-input"
                  value={DEFAULT_DEMO_CHANNEL}
                  readOnly
                  aria-label="Default demo channel URL"
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg landing-audit-cta"
                onClick={() => {
                  setStoredDemoChannel(DEFAULT_DEMO_CHANNEL);
                  analytics.channelAuditStarted(DEFAULT_DEMO_CHANNEL);
                  navigate('/demo', { replace: true, state: { channelInput: DEFAULT_DEMO_CHANNEL } });
                }}
              >
                Analyze Default Channel
              </button>
              <p className="landing-audit-option-hint">Full product showcase — all tabs and analytics visible.</p>
            </div>

            <div className="landing-audit-separator" aria-hidden>
              <span>or</span>
            </div>

            <div className="landing-audit-option">
              <h3 className="landing-audit-option-label">Analyze your own channel</h3>
              <div className="landing-demo-input-wrap">
                <input
                  type="text"
                  className="landing-demo-input"
                  placeholder="Paste a YouTube channel URL or @handle"
                  value={demoInput}
                  onChange={(e) => setDemoInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeUserChannel()}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg landing-audit-cta"
                onClick={handleAnalyzeUserChannel}
              >
                Analyze Your Channel
              </button>
              {demoError && <p className="landing-demo-error">{demoError}</p>}
              <p className="landing-audit-option-hint">
                Examples: https://youtube.com/@channelname or @channelname
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
          <p className="landing-section-sub">
            The same dashboard you get after purchase — metrics and top videos at a glance.
          </p>
          <div className="landing-dashboard-preview">
            <div className="landing-metrics-grid">
              <div className="landing-metric-card">
                <span className="landing-metric-value">5,770</span>
                <span className="landing-metric-label">Subscribers</span>
              </div>
              <div className="landing-metric-card">
                <span className="landing-metric-value">515,218</span>
                <span className="landing-metric-label">Total Views</span>
              </div>
              <div className="landing-metric-card">
                <span className="landing-metric-value">188</span>
                <span className="landing-metric-label">Videos</span>
              </div>
              <div className="landing-metric-card">
                <span className="landing-metric-value">3.42%</span>
                <span className="landing-metric-label">Engagement Rate</span>
              </div>
            </div>
            <div className="landing-top-videos-block">
              <h3 className="landing-block-title">Top Performing Videos</h3>
              <ul className="landing-video-list">
                {EXAMPLE_VIDEOS.map((v) => (
                  <li key={v.id} className="landing-video-item">
                    <span className="landing-video-item-title">{v.title}</span>
                    <span className="landing-video-item-views">{v.views} views</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. AI Insight Preview */}
      <section className="landing-section">
        <div className="container landing-container">
          <h2 className="landing-section-title">AI Channel Insights</h2>
          <p className="landing-section-sub">
            Sample insights from the audit. Unlock the full plan for actionable recommendations.
          </p>
          <div className="landing-insights-grid">
            <div className="landing-insight-card">
              <h4>Title length vs. niche</h4>
              <p>Your titles are longer than the niche average.</p>
            </div>
            <div className="landing-insight-card">
              <h4>Winning format</h4>
              <p>Your top videos follow a strong repeatable format.</p>
            </div>
            <div className="landing-insight-card landing-insight-card-blur">
              <span className="landing-insight-lock">CTR optimization recommendations</span>
            </div>
            <div className="landing-insight-card landing-insight-card-blur">
              <span className="landing-insight-lock">Title rewrite suggestions</span>
            </div>
            <div className="landing-insight-card landing-insight-card-blur">
              <span className="landing-insight-lock">SEO keyword opportunities</span>
            </div>
            <div className="landing-insight-card landing-insight-card-blur">
              <span className="landing-insight-lock">Traffic growth insights</span>
            </div>
          </div>
          <div className="landing-unlock-overlay-msg">
            <span className="landing-unlock-icon">🔒</span>
            Unlock Full AI Growth Plan
          </div>
        </div>
      </section>

      {/* 6. What The AI Detects */}
      <section className="landing-section landing-section-alt">
        <div className="container landing-container">
          <h2 className="landing-section-title">What the AI detects</h2>
          <p className="landing-section-sub">
            Six areas the audit analyzes to give you a clear growth path.
          </p>
          <div className="landing-detect-grid">
            {DETECT_CARDS.map((card, i) => (
              <div key={i} className="landing-detect-card">
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Example Channel Audit */}
      <section className="landing-section" id="example-audit">
        <div className="container landing-container">
          <h2 className="landing-section-title">Example channel audit</h2>
          <p className="landing-section-sub">
            A sample growth score and report. Your audit will look like this.
          </p>
          <div className="landing-audit-showcase">
            <div className="landing-audit-score-block">
              <h3 className="landing-audit-score-title">Channel Growth Score</h3>
              <div className="landing-audit-score-value">71 <span className="landing-audit-score-max">/ 100</span></div>
              <p className="landing-audit-score-desc">
                Your channel has momentum, but packaging issues are slowing growth.
              </p>
            </div>
            <div className="landing-audit-lists">
              <div className="landing-audit-list-block">
                <h4>Detected problems</h4>
                <ul>
                  <li>Titles exceed optimal length</li>
                  <li>Missing search keywords</li>
                  <li>Weak video packaging</li>
                  <li>Irregular posting cadence</li>
                </ul>
              </div>
              <div className="landing-audit-list-block">
                <h4>Opportunities</h4>
                <ul>
                  <li>Rewrite high-potential titles</li>
                  <li>Optimize descriptions for search</li>
                  <li>Focus on winning content patterns</li>
                  <li>Improve CTR keywords</li>
                </ul>
              </div>
            </div>
            <div className="landing-audit-blur-block">
              <span className="landing-unlock-icon">🔒</span>
              Unlock Full AI Growth Report
            </div>
          </div>
        </div>
      </section>

      {/* 8. Why Creators Buy */}
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

      {/* 9. Pricing */}
      <section className="landing-section landing-pricing-section" id="pricing">
        <div className="container landing-container">
          <span className="landing-section-eyebrow">One-time unlock</span>
          <h2 className="landing-section-title">Unlock the Full AI Growth Report</h2>
          <div className="landing-pricing-card">
            <div className="landing-pricing-price">49.99 USD <span className="landing-pricing-period">one-time</span></div>
            <ul className="landing-pricing-features">
              {UNLOCK_FEATURES.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <div className="landing-pricing-form">
              {authSession ? (
                <input
                  type="text"
                  placeholder="Channel URL (optional)"
                  className="landing-pricing-channel"
                  value={pricingChannel}
                  onChange={(e) => setPricingChannel(e.target.value)}
                />
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Sign up to unlock. We’ll take you back to pricing after authentication.
                </p>
              )}
              {pricingError && <p className="landing-pricing-error">{pricingError}</p>}
              <button
                type="button"
                className="btn btn-primary btn-lg landing-pricing-cta"
                onClick={handleUnlockReport}
                disabled={pricingLoading}
              >
                {pricingLoading ? 'Starting checkout…' : 'Unlock Full Report'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 10. FAQ */}
      <section className="landing-section landing-section-alt" id="faq">
        <div className="container landing-container landing-faq-container">
          <h2 className="landing-section-title">FAQ</h2>
          <div className="landing-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                className={`landing-faq-item ${openFaq === i ? 'open' : ''}`}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <button type="button" className="landing-faq-question">
                  {item.q}
                </button>
                <div className="landing-faq-answer">
                  <p>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 11. Final CTA */}
      <section className="landing-section landing-cta-section">
        <div className="container landing-container">
          <h2 className="landing-cta-title">Stop guessing what the algorithm wants.</h2>
          <p className="landing-cta-sub">Run your AI channel audit now.</p>
          <a href="#audit" className="btn btn-primary btn-lg landing-cta-btn">
            Analyze Your Channel
          </a>
        </div>
      </section>

      {/* 12. Footer */}
      <footer className="landing-footer global-footer">
        <div className="global-footer-content">
          <p className="global-footer-line">Engineered by MK AI &amp; Performance Systems</p>
          <p className="global-footer-line">
            <a href={PLATFORM_URL} target="_blank" rel="noopener noreferrer">Platform</a>
          </p>
          <p className="global-footer-copy">© 2026 YouTube Booster. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
