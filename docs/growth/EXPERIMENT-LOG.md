# YouTubeBooster AI — paid customer growth experiment log

Agents must append every experiment here. Do not delete history.

## Active

- **EXP-001** — post-checkout guest activation — eval **2026-08-17 Inconclusive**; **2026-08-19** growth report now reads `ybai-purchases` + `ybai-users` entitlements (no PII). Still **0** verified product-attributed payments. Next eval on first verified checkout/payment or **2026-08-24**. Funnel stage: post-purchase activation
- **EXP-002** — SEO/growth pages: above-the-fold channel form → `/demo` (early read **2026-08-18**; full eval **Tuesday, August 25, 2026** / `2026-08-25`) — funnel stage: acquisition / SEO (**main** treatment)
- **EXP-003** — `/youtube-channel-analyzer` — **reclassified nested** under EXP-002 (same Acquisition/SEO locked stage; page remains live; not independently collecting) — eval **2026-08-19** page-level only
- **EXP-004** — mini-audit share + sample paid report — **awaiting owner completion**: P04/P05 approved (`APR-2026-08-19-P04-P05`) but **0 emails sent** (P04 has no public email; marketing send blocked without postal address). Not collecting outreach click data yet

## Locked stages (do not launch overlapping treatments)

Use this table before starting a new experiment or CRO change. Two active experiments may not share the same **locked stage**. Independent work on a different stage is allowed when it does not invalidate an active treatment.

| Experiment | Locked stage | Notes |
|------------|--------------|--------|
| EXP-001 | Post-purchase activation | Guest activation after checkout |
| EXP-002 | Acquisition / SEO | Eligible SEO + compare pages with on-page form (excludes analyzer URL) |
| EXP-003 | Acquisition / SEO (`/youtube-channel-analyzer`) | Same broad stage as EXP-002; page-level eval OK; form-UI lift nested — see overlap |
| EXP-004 | Founder outreach / acquisition distribution | Share + sample report for outreach; not send approval |

Until the first newly attributed external customer: **at most one experiment per funnel stage**. Prefer qualified distribution over additional CRO. Do not launch another experiment merely because a run needs a ship.

Do **not** start another Acquisition/SEO landing or form CRO while EXP-002 or EXP-003 is in-flight. Do **not** start another post-purchase activation test while EXP-001 is in-flight. Outreach draft packages may proceed under EXP-004 rules without changing EXP-002/003 treatments.

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

### 2026-08-19 — EXP-004 P04/P05 approval recorded; sends blocked

| Field | Value |
|-------|--------|
| Status | EXP-004 still **not collecting** outreach sends. Approval ID `APR-2026-08-19-P04-P05`. |
| Distribution | **Not executed.** P04: no public business email (contact form only). P05: public business mailto confirmed on hellosohla.com; send blocked until SSM `/youtubebooster/business/postal-address` is set. |
| SSM | `/youtubebooster/outreach/marketing-sending-enabled` = `true`. Weekday COOK-001 sender still requires Lambda config `CreatorAcquisition:MarketingSendingEnabled` (unset) plus named batch approval. |
| SES | Domain `youtubeboosterai.com` verified. `hello@youtubeboosterai.com` covered by domain identity. Custom MAIL FROM `bounce.youtubeboosterai.com` not configured. |
| CRM reporting | Growth snapshot now scans Dynamo `ybai-purchases` + `ybai-users` entitlements (no emails in snapshots). |
| Emails sent | **0** |
| Verified customers | **0** |


### 2026-08-17 — Creator Acquisition Center (EXP-004 distribution system; sending disabled)

| Field | Value |
|-------|--------|
| Status | EXP-004 still **awaiting owner approval** for sends. Acquisition CRM shipped; **0 emails sent**. |
| Hypothesis | A bounded, approval-gated cooking outreach system (inspect → verified public contact → personalized mini-review → max 5 weekday sends) will produce customer #1 without mass spam. |
| Exact change | Admin → Marketing → Creator Acquisition; scoring/dedup/contact rules; SES MIME + unsubscribe; inbound ingest; sanitized COOK-001 / OTHER-001 CSVs (no emails). Marketing sending remains disabled. |
| Funnel stage | Founder outreach / acquisition distribution (EXP-004). Does not alter EXP-001/002/003 treatments. |
| Distribution | **Not executed.** Blocking Max approval + SES identity `hello@youtubeboosterai.com` + postal address + marketing-sending flag. |
| Guardrail | Preview never sends. Scheduler sends 0 when gates fail. No guessed emails. No PII in SES tags. |
| Primary metric | After first approved batch: unique attributed clicks → qualified audits → checkout → product-attributed customers. |
| Verified customers | **0** |
| Rollback | Revert this commit; do not enable SSM `outreach/marketing-sending-enabled`. |

### 2026-08-17 — Sample-report acquisition iterate + EXP-003 reclassify

| Field | Value |
|-------|--------|
| Status | EXP-004 sample-report **Iterate** (page only); outreach still **awaiting owner approval**. EXP-003 **reclassified nested**. EXP-001 **Inconclusive** (unchanged). EXP-002 **Keep**. |
| Hypothesis | An above-the-fold “Audit my channel” form on `/sample-report` (sanitized sample, UTM `utm_source=sample_report`) will start real audits from creators who open the paid-shape sample, vs burying the CTA below sample content. |
| Target | Active creators ~1k–100k subscribers. |
| Funnel stage | Acquisition / sample-report surface (does not add a second Acquisition/SEO CRO). |
| Baseline | 7d through 2026-08-16: 18 session_start events, 3 audit_started events, 6 audit_completed events (raw; not qualified records), 2 pricing_viewed, 0 checkout_started. Verified external customers 0. EXP-003 landing sessions 0/7d. |
| Primary metric | `sample_report_audit_click` → `audit_started` (source `sample_report`) **events**. |
| Secondary | `sample_report_view`; qualified completed audits (records, not raw events); checkout_started events; new customers this run. |
| Evaluation date | 2026-08-24 |
| KEEP | Treatment stays if sample_report_audit_click > 0 or no regression on `/demo`. |
| ITERATE | If views occur but zero audit clicks after 7d. |
| STOP | If `/sample-report` or `/demo` breaks; revert this commit. |
| Locked surface | `/sample-report` form; EXP-002 SEO form pages unchanged. |
| Reversal | Revert the sample-report + SeoAuditEntryForm extra-props commit. |
| Distribution | **Not executed.** Deployed asset is not distribution. Blocking owner approval for named-recipient send. |
| Exact change | `SampleReportPage` above-the-fold `SeoAuditEntryForm` submit “Audit my channel”; UTM params; `sample_report_view` / `sample_report_audit_click`; sanitized copy (not a named-creator customer audit). EXP-003 status → nested. |
| Commit | `a6699ae` |
| Amplify | job **247** SUCCEED (2026-08-17) |
| Production verification | Live `/sample-report` hydrates title “Sample YouTube growth audit”; above-the-fold “Audit my channel”; sanitized cooking-niche sample (no named-creator customer claim). `/demo` showcase OK. Health OK. |

### 2026-08-17 — EXP-001 evaluation (keep) + productivity/education outreach package to main

| Field | Value |
|-------|--------|
| Status | EXP-001 **Inconclusive** (treatment unchanged); outreach package **shipped to main** (drafts only) |
| EXP-001 evidence | 7d: 0 checkout_started events, 0 verified external paying customers, 0 verified net revenue; 30d: same. `activation_within_24h` **Unavailable** — Admin CRM not queryable and no product-attributed live payments to measure. Account-wide Stripe shows 1 unattributed live payment (7d) / 2 (30d) — excluded from product metrics. |
| EXP-001 decision | **Inconclusive** — primary metric unmeasurable; treatment remains active; re-evaluate when first verified checkout/payment occurs or 2026-08-24, whichever is sooner. |
| Ship (acquisition) | Merge `docs/growth/outreach/2026-08-14-productivity-education-outreach.md` to `main` — 10 productivity/education prospects (~968–112k subs) with public API–verified observations, personalized DM drafts, follow-ups, UTM campaign `acq_2026_08_14`. Complements food list (`2026-08-14-review.md`). **Not sent** — owner must send from Admin CRM. |
| Primary metric | `mini_audit_share_viewed` (utm `founder_outreach` / `acq_2026_08_14`) → `audit_started` → qualified `audit_completed` after owner sends. |
| Guardrail | No auto-send; does not alter EXP-001/002/003/004 treatments. |
| Funnel stage | acquisition / distribution (founder outreach enablement) |
| GA4 baseline (2026-08-17) | 7d: 18 sessions, 3 audit_started events, 6 audit_completed events, 2 pricing_viewed events, 0 checkout_started. 30d: 42 sessions, 4 audit_started, 11 audit_completed, 2 pricing_viewed, 0 checkout_started. Qualified audit volume still far below 100/30d target. |

### 2026-08-14 — Productivity/education founder outreach package (acquisition-first)

| Field | Value |
|-------|--------|
| Status | completed (outreach enablement — drafts only; merged to main 2026-08-17) |
| Evidence | Verified external paying customers = 0; 11 audit completions / 30d but 0 checkout starts; 2026-08-13 food outreach still `draft` / not sent; need diversified qualified prospects in productivity/education. |
| Hypothesis | A second outreach segment (productivity/education, ~1k–112k subs) with public-data observations + `/share` UTMs will give Max more qualified founder-send options than waiting on organic traffic alone. |
| Exact change | `docs/growth/outreach/2026-08-14-productivity-education-outreach.md` — 10 prospects, personalized drafts + follow-ups, UTM campaign `acq_2026_08_14`. No product code changes. |
| Primary metric | `mini_audit_share_viewed` (utm `founder_outreach` / `acq_2026_08_14`) → `audit_started` → qualified `audit_completed` after owner sends. |
| Guardrail | No auto-send; does not alter EXP-001/002/003/004 treatments; Stripe remains product-attributed only. |
| Baseline | 0 founder-sent productivity/education outreach; 0 verified external paying customers. |
| Target | Directional: first owner-sent links from this package produce mini-audit views + audit starts within 7 days of send. |
| Evaluation date | 2026-08-21 |
| Stop rule | Spam complaints or `/share` failures → pause package; do not auto-send. |
| Rollback | Delete or archive outreach markdown; no deploy rollback needed. |
| Funnel stage | acquisition / distribution (founder outreach enablement; independent of active CRO experiments) |

### 2026-08-13 — EXP-004 Mini-audit share + sample report (acquisition-first)

| Field | Value |
|-------|--------|
| Status | awaiting owner approval |
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
| Commit | `78b2429` |
| Amplify | job **238** SUCCEED |

**Outreach:** A Cursor task prompt is **not** approval of recipients or copy. The 2026-08-13 list (Budget Bytes, Damn Delicious, Simply Recipes, and other drafts) is **superseded and not approved**. Replacement review: `docs/growth/outreach/2026-08-14-review.md` — status `draft` until Max explicitly approves specific recipients and messages. Do not send, submit forms, or comment.

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
| Status | nested |
| Evaluation decision | Keep |
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
| Evaluation decision | Inconclusive |
| Evaluation reason | Admin CRM activation data remains unavailable |
| Evidence | Guest Stripe checkout is primary path (`feat(checkout): guest Stripe`). `CheckoutSuccessPage` prioritizes **Sign in** over **Create account** for unauthenticated buyers. CRM docs track unmatched payments / email mismatch. GA4/Stripe API secrets unavailable in agent env — baseline unknown from APIs; code+CRM path evidence only. Recent CRO already polished landing; SEO CTA changes risk repeating 3a3e5d3 without purchase data. |
| Hypothesis | Making **Create account** the primary post-pay CTA and emphasizing **same checkout email** will increase the share of live Stripe payments that attach to an entitled Cognito user within 24h. |
| Exact change | `CheckoutSuccessPage` guest CTA flip + homepage `/?checkout=success` banner for guests (primary Create account, same-email copy). Files: `frontend/src/App.tsx`, `frontend/src/LandingPage.tsx`. |
| Primary metric | Live Stripe payments that become entitled users within 24h (Admin CRM / payment link rate). Proxy: signup completions after `checkout_return_success`. |
| Guardrail | Checkout start rate / Stripe payment success rate must not drop; no increase in support tickets about “paid but locked”. |
| Baseline | unknown — `STRIPE_RESTRICTED_READ_KEY` / GA4 secrets not set in agent environment |
| Target | Directional: higher create-account clicks from `/checkout/success` and fewer unmatched live payments over 7 days |
| Evaluation date | 2026-08-17 (evaluated Inconclusive; next eval on first verified payment or 2026-08-24) |
| Stop rule | If payment success rate falls or unlock complaints rise within 3 days → rollback |
| Rollback | `git revert` the EXP-001 commit on `main` and push; Amplify redeploys |
| Funnel stage | post-purchase activation / signup attach |
| Commit | `b26d7d0` |
| Amplify | job **221** SUCCEED (2026-08-10) |

---

## Completed / failed

_None yet (conversion experiments). Measurement repair 2026-08-13 logged above._
