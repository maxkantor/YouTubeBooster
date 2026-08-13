# YouTubeBooster AI — paid customer growth experiment log

Agents must append every experiment here. Do not delete history.

## Active

- **EXP-001** — post-checkout guest activation (eval **Monday, August 17, 2026** / `2026-08-17`) — funnel stage: post-purchase activation
- **EXP-002** — SEO/growth pages: above-the-fold channel form → `/demo` (early read **2026-08-18**; full eval **Tuesday, August 25, 2026** / `2026-08-25`) — funnel stage: acquisition / SEO
- **EXP-003** — `/youtube-channel-analyzer` commercial-intent landing (eval **Wednesday, August 19, 2026** / `2026-08-19`) — funnel stage: acquisition / SEO (nested surface using EXP-002 form UI)
- **EXP-004** — mini-audit share page `/share` + sample paid report `/sample-report` for founder outreach (eval **2026-08-20**) — funnel stage: acquisition / distribution (does not change EXP-002/003 treatments)

## EXP-002 / EXP-003 overlap

| Topic | Decision |
|-------|----------|
| Relationship | EXP-003 is a **new distribution/landing URL** that **reuses the EXP-002 on-page form treatment** (`SeoAuditEntryForm`). |
| Independent evaluation? | **Yes for page-level performance** (sessions/starts on `/youtube-channel-analyzer` vs other SEO pages). **No for incremental form-UI lift** — EXP-003 inherits EXP-002 UI. |
| Eligible pages EXP-002 | SEO growth + compare pages that render the form, **excluding** `/youtube-channel-analyzer`. |
| Eligible pages EXP-003 | `/youtube-channel-analyzer` only. |
| Attribution | Prefer `pagePath` and/or GA4 `source` (`growth_guide_*`, `comparison_*`, `youtube-channel-analyzer`). |
| Primary metrics | EXP-002: audit starts from eligible SEO paths. EXP-003: sessions + audit starts on analyzer URL. |
| Double-count rule | A session may appear in **both descriptive sections** when disclosed; **portfolio/sitewide totals count once**. Never add EXP-002+EXP-003 paid into a portfolio sum on top of sitewide Stripe. |
| Measurement limitation | Experiment-attributed paid conversions remain **Unknown** without reliable checkout metadata/UTM. |
| Stop rule | Do **not** auto-stop either experiment solely due to overlap; concurrency skill still blocks a *third* same-stage CRO test. |

Weekday labels are derived from ISO dates in `America/New_York` (never hardcoded separately from the date).

## Log

### 2026-08-13 — EXP-004 Mini-audit share + sample report (acquisition-first)

| Field | Value |
|-------|--------|
| Status | active |
| Evidence | Verified external paying customers = 0; traffic too low for more CRO; need qualified audits in 7 days; founder outreach blocked without a shareable one-observation asset. |
| Hypothesis | A `/share` mini-audit (one public-data observation + tracked CTA to `/demo`) plus `/sample-report` (MaxKantorCooking paid-shape sample) will increase qualified audit completions from founder outreach vs generic SEO alone. |
| Exact change | `MiniAuditSharePage`, `SampleReportPage`, routes, sitemap entries, styles; skill/automation acquisition-first; outreach package `docs/growth/outreach/2026-08-13-founder-outreach.md` (drafts only). |
| Primary metric | `mini_audit_share_viewed` → `audit_started` (source `mini_audit_share`) → qualified `audit_completed`; secondary: verified attributed Stripe (still baseline 0). |
| Guardrail | Do not inflate EXP-002/003 page metrics; no auto-send outreach; Stripe remains product-attributed only. |
| Baseline | ~16 sessions/7d; 0 verified external paying customers. |
| Target | Directional: founder-sent links produce mini-audit views + full audit starts within 7 days. |
| Evaluation date | 2026-08-20 |
| Stop rule | Share/demo failures or spam complaints within 48h → revert routes. |
| Rollback | `git revert` EXP-004 commit on `main`. |
| Funnel stage | acquisition / distribution (outreach enablement; independent of EXP-002 form treatment) |
| Commit | (pending) |
| Amplify | (pending) |

### 2026-08-13 — Measurement repair (not a conversion experiment)

| Field | Value |
|-------|--------|
| Status | completed (measurement) |
| Evidence | Admin growth email scoreboard showed 0 audit starts / 30d while notes cited 4; completions exceeded starts; weekday labels wrong; UTC-first timestamps; EXP attribution unclear. |
| Exact change | Canonical metrics layer; explicit GA4 funnel queries; scoreboard never reads truncated top-events; audit attempt-id completion dedupe; showcase demo excluded from audit_completed; Admin email Decision-first layout; EXP overlap docs. |
| Funnel stage | tracking / funnel-repair (does not invalidate EXP-001/002/003) |

### 2026-08-12 — EXP-003 YouTube channel analyzer landing page

| Field | Value |
|-------|--------|
| Status | active |
| Evidence | User wants faster acquisition than waiting for EXP-002 eval; ~16 sessions/7d; "youtube channel analyzer" is high-intent query not covered by a dedicated URL; EXP-002 tests form on existing pages only. |
| Hypothesis | A dedicated `/youtube-channel-analyzer` page (with on-page audit form via EXP-002 component) will capture new organic/search traffic and increase audit starts vs relying on homepage alone. |
| Exact change | New growth guide page + route + footer/homepage links. Files: `frontend/src/seo/growthGuideData.ts`, `frontend/src/App.tsx`. |
| Primary metric | Organic sessions + `audit_started` with source containing `youtube-channel-analyzer`; secondary: live Stripe (directional). |
| Guardrail | No regression on EXP-002 pages; homepage audit rate stable. |
| Baseline | 0 indexed URL for "youtube channel analyzer"; ~16 sessions/7d sitewide. |
| Target | Directional: first organic visits + audit starts from new URL within 7 days. |
| Evaluation date | 2026-08-19 |
| Stop rule | Build/SEO errors or demo failures on new URL within 48h → revert. |
| Rollback | `git revert` EXP-003 commit on `main`. |
| Funnel stage | acquisition / SEO (new landing URL; nested with EXP-002 form UI — see overlap section) |
| Commit | `368098e` |
| Amplify | deployed — `/youtube-channel-analyzer` returns 200 (2026-08-13 health check) |

### 2026-08-11 — EXP-002 SEO audit entry form (start on page → /demo)

| Field | Value |
|-------|--------|
| Status | active |
| Evidence | ~12 sessions/7d; SEO growth guides promise “paste URL” but only linked to `/#audit` (homepage hop). EXP-001 locks post-purchase. Low-traffic rule → acquisition/SEO. |
| Hypothesis | Putting a channel URL form above the fold on growth/compare SEO pages and routing to `/demo?channel=…` will increase audit starts from SEO sessions vs homepage detour. |
| Exact change | `SeoAuditEntryForm` + `SeoFunnelCta` form; early + bottom placement on `GrowthGuidePages` and `ComparisonPages`. Files: `frontend/src/components/SeoAuditEntryForm.tsx`, `SeoFunnelCta.tsx`, `GrowthGuidePages.tsx`, `ComparisonPages.tsx`, `analytics.ts`, `styles.css`. |
| Primary metric | `audit_started` / `audit_url_entered` from SEO sources; secondary: live Stripe purchases (directional). |
| Guardrail | Demo error rate and homepage audit path must not worsen. |
| Baseline | ~12 sessions/7d; SEO→audit conversion weak (link-only CTAs). |
| Target | Directional ↑ audit starts from growth/SEO pages over 14 days. |
| Evaluation date | 2026-08-25 |
| Stop rule | Demo failures or bounce spike on those URLs within 3 days → rollback. |
| Rollback | `git revert` the EXP-002 commit on `main` and push. |
| Funnel stage | acquisition / SEO (SEO landing → audit start; excludes `/youtube-channel-analyzer` — see overlap section) |
| Commit | `5b4efc2` |
| Amplify | job **230** SUCCEED (2026-08-11) |

### 2026-08-10 — EXP-001 Post-checkout guest activation (same-email signup)

| Field | Value |
|-------|--------|
| Status | active |
| Evidence | Guest Stripe checkout is primary path (`feat(checkout): guest Stripe`). `CheckoutSuccessPage` prioritizes **Sign in** over **Create account** for unauthenticated buyers. CRM docs track unmatched payments / email mismatch. GA4/Stripe API secrets unavailable in agent env — baseline unknown from APIs; code+CRM path evidence only. Recent CRO already polished landing; SEO CTA changes risk repeating 3a3e5d3 without purchase data. |
| Hypothesis | Making **Create account** the primary post-pay CTA and emphasizing **same checkout email** will increase the share of live Stripe payments that attach to an entitled Cognito user within 24h. |
| Exact change | `CheckoutSuccessPage` guest CTA flip + homepage `/?checkout=success` banner for guests (primary Create account, same-email copy). Files: `frontend/src/App.tsx`, `frontend/src/LandingPage.tsx`. |
| Primary metric | Live Stripe payments that become entitled users within 24h (Admin CRM / payment link rate). Proxy: signup completions after `checkout_return_success`. |
| Guardrail | Checkout start rate / Stripe payment success rate must not drop; no increase in support tickets about “paid but locked”. |
| Baseline | unknown — `STRIPE_RESTRICTED_READ_KEY` / GA4 secrets not set in agent environment |
| Target | Directional: higher create-account clicks from `/checkout/success` and fewer unmatched live payments over 7 days |
| Evaluation date | 2026-08-17 |
| Stop rule | If payment success rate falls or unlock complaints rise within 3 days → rollback |
| Rollback | `git revert` the EXP-001 commit on `main` and push; Amplify redeploys |
| Funnel stage | post-purchase activation / signup attach |
| Commit | `b26d7d0` |
| Amplify | job **221** SUCCEED (2026-08-10) |

---

## Completed / failed

_None yet (conversion experiments). Measurement repair 2026-08-13 logged above._
