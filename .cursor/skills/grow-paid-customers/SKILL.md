---
name: grow-paid-customers
description: >-
  Autonomous paid-customer growth for YouTubeBooster AI. Selects and ships one
  small reversible experiment to increase verified Stripe purchases and revenue.
  Use for daily growth runs, Monday–Friday automation, CRO, funnel leaks, GA4,
  Stripe, Admin CRM funnel, or deploy-to-main conversion experiments.
---

# Grow paid customers (YouTubeBooster AI)

Optimize for **verified Stripe purchases and revenue**, not traffic, clicks, or cosmetics.

Product: https://youtubeboosterai.com/  
Source of truth for conversion: **Stripe live payments** (Admin CRM live orders as secondary).  
Preserve existing GA4 (`G-P02EPD7EDB` in `frontend/index.html` + `frontend/src/lib/analytics.ts`). Never add a second GA4 install.

## Daily workflow

1. Read experiment history: `docs/growth/EXPERIMENT-LOG.md`
2. Collect funnel evidence (7d + 30d when secrets exist):
   ```bash
   node scripts/growth/collect-funnel-snapshot.mjs
   node scripts/growth/check-production-health.mjs
   ```
3. Compute stage rates; pick the **largest meaningful leak** with enough volume.
4. Skip experiments already `active`, `completed`, or `failed` unless new evidence justifies a retry.
5. Choose **exactly one** action using:
   `Priority = expected paid-customer impact × confidence × strategic fit ÷ effort`
6. Define the experiment block (required fields below), implement, validate, deploy **one** change.
7. Append the result to `docs/growth/EXPERIMENT-LOG.md`.

## Funnel stages to measure

Landing sessions → traffic source → audit starts → audit completions → result views → signup completions → checkout starts → **successful Stripe purchases** → revenue → returning users.

Prefer Admin CRM activity + Stripe when GA4 API secrets are missing. Never invent baselines.

## Allowed action types

Landing positioning · free-audit activation · audit-result usefulness · paid-upgrade presentation · signup friction · checkout friction · trust · purchase-intent SEO · internal conversion CTAs · referral loops · lifecycle email · cross-promo attribution.

## Hard bans (never auto-change)

Product price · Stripe config · authentication system · AWS infra · privacy/legal · medical/financial/guaranteed-growth claims · ad spend · bulk outreach.

## Truth rules

- Do not fabricate CTR, retention, impressions, projected subs/views, testimonials, customer counts, or revenue.
- Public YouTube data ≠ private YouTube Studio analytics.
- Do not claim paid customers increased until Stripe confirms.

## Experiment definition (required)

| Field | Required |
|-------|----------|
| Evidence | Yes |
| Hypothesis | Yes |
| Exact change | Yes |
| Primary metric | Yes (prefer live Stripe purchases or checkout→purchase) |
| Guardrail metric | Yes |
| Baseline | Yes (or `unknown — missing data source`) |
| Target | Yes |
| Evaluation date | Yes |
| Stop rule | Yes |
| Rollback procedure | Yes |

## Deploy gate

Before push to `main`:

1. Install deps; run available tests; lint if configured
2. Full production frontend build (`frontend`: `npm ci` / `npm run build`)
3. Inspect diff — one experiment only; reversible
4. Commit + push `main`
5. Monitor Amplify app `youtubebooster-ai-web` (`d2s1ju1o5ef9dw`)
6. Verify production desktop + mobile; smoke audit → checkout path
7. On failure: revert, record cause in the log

Never ship a second experiment while the previous lacks enough data **unless** fixing a broken funnel.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/growth/collect-funnel-snapshot.mjs` | GA4 + Stripe + notes gaps |
| `scripts/growth/check-production-health.mjs` | Live `/health` + homepage + robots |
| `scripts/growth/append-experiment.mjs` | Helper to append a log entry |

## Secrets (never commit)

- `GA4_PROPERTY_ID`
- `GOOGLE_ANALYTICS_CREDENTIALS_JSON` (service account JSON string)
- `STRIPE_RESTRICTED_READ_KEY` (read-only restricted key)

If missing, continue with health checks + code/CRM evidence and mark baselines `unknown`.

## Admin CRM

Use Admin CRM funnel/drop-off and live vs test revenue as operational signal. Do not confuse GA4 visitors with CRM users (`docs/ADMIN-METRICS.md`).
