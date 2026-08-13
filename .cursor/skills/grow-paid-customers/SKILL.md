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
Source of truth for conversion: **verified YouTubeBooster-attributed Stripe live payments** (never account-wide Stripe; Admin CRM live orders as secondary).  
Preserve existing GA4 (`G-P02EPD7EDB` in `frontend/index.html` + `frontend/src/lib/analytics.ts`). Never add a second GA4 install.

## Daily workflow

**Cost control:** Prefer the cheapest capable model. On most runs: collect metrics, health-check, note anything useful in the experiment log if needed, email Admin, and **stop**. Only implement/deploy when there is a clear leak, no same-stage conflict, and the change is tiny. Skip `npm ci` / full production builds unless shipping.

1. Read experiment history: `docs/growth/EXPERIMENT-LOG.md`
2. Collect funnel evidence (7d + 30d when secrets exist):
   ```bash
   node scripts/growth/load-ssm-secrets-into-env.mjs   # optional: pull from AWS SSM
   node scripts/growth/collect-funnel-snapshot.mjs
   node scripts/growth/check-production-health.mjs
   ```
3. Compute stage rates; pick the **largest meaningful leak** with enough volume.
4. **Low-traffic rule:** If traffic is too low to evaluate conversion, prioritize **qualified customer acquisition**—high-intent SEO pages, creator partnerships, referral mechanics, lifecycle email, and tracked cross-promotion—**before** additional homepage optimization.
5. Skip conversion experiments that would conflict with an `active` experiment on the **same funnel stage** (see concurrency rule below). Other experiment statuses: do not repeat `completed` / `failed` without new evidence.
6. If no clear, tiny ship candidate: email Admin and end the run (do not force a change).
7. Otherwise choose **exactly one** production change using:
   `Priority = expected paid-customer impact × confidence × strategic fit ÷ effort`
8. Define the experiment block (required fields below), implement, validate, deploy.
9. Append the result to `docs/growth/EXPERIMENT-LOG.md`.
10. **Email Admin** a full run summary (required every run, including no-op / skipped days):
   ```bash
   node scripts/growth/compose-and-send-growth-email.mjs --notes "What shipped (or why nothing shipped); blockers; next eval."
   ```
   This script refreshes the funnel snapshot, runs health checks, includes active experiments from `docs/growth/EXPERIMENT-LOG.md`, and emails Admin via SES. Prefer it over a hand-written short body. Recipient is SSM `/youtubebooster/admin/email`.

## Funnel stages to measure

Landing sessions → traffic source → audit starts → audit completions → result views → signup completions → checkout starts → **successful Stripe purchases** → revenue → returning users.

Prefer Admin CRM activity + **YouTubeBooster-attributed** Stripe when GA4 API secrets are missing. Never invent baselines. **Never** count account-wide Stripe live payments as this product’s revenue (shared accounts may include GetTrainMate). See `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`. Verified external paying customers baseline remains **0** until reconciliation is marked complete.

## Experiment concurrency

**Never run two simultaneous conversion experiments on the same funnel stage.**

While an experiment is gathering data, the agent **may** implement independent **acquisition, SEO, reliability, tracking, or funnel-repair** improvements that do **not** invalidate the active experiment.

Do **not** idle until the evaluation date if other high-value non-conflicting work exists.

## Allowed action types

Landing positioning · free-audit activation · audit-result usefulness · paid-upgrade presentation · signup friction · checkout friction · trust · purchase-intent SEO · internal conversion CTAs · referral loops · lifecycle email · cross-promo attribution · qualified acquisition (when volume is too low for CRO).

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
| Funnel stage | Yes (for concurrency checks) |

## Deploy gate

Before push to `main`:

1. Install deps; run available tests; lint if configured
2. Full production frontend build (`frontend`: `npm ci` / `npm run build`)
3. Inspect diff — one change set; reversible; does not invalidate an active same-stage experiment
4. Commit + push `main`
5. Monitor Amplify app `youtubebooster-ai-web` (`d2s1ju1o5ef9dw`)
6. Verify production desktop + mobile; smoke audit → checkout path
7. On failure: revert, record cause in the log

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/growth/collect-funnel-snapshot.mjs` | GA4 + Stripe + notes gaps |
| `scripts/growth/check-production-health.mjs` | Live `/health` + homepage + robots |
| `scripts/growth/append-experiment.mjs` | Helper to append a log entry |
| `scripts/growth/verify-ssm-secrets.mjs` | Confirm SSM params exist (no value dump) |
| `scripts/growth/put-ssm-secrets.ps1` | One-time put of secrets from env → SSM |
| `scripts/growth/load-ssm-secrets-into-env.mjs` | Load SSM into process env for collectors |
| `scripts/growth/notify-admin-email.mjs` | Low-level SES send (subject + body) |
| `scripts/growth/compose-and-send-growth-email.mjs` | Full Admin email: snapshot + health + active experiments + notes |
| `scripts/growth/lib/canonical-metrics.mjs` | Shared metric definitions, explicit event maps, reconciliation |
| `docs/growth/METRICS.md` | Canonical metric documentation |

## Secrets (never commit)

**Env / Cursor Automation names:**

- `GA4_PROPERTY_ID`
- `GOOGLE_ANALYTICS_CREDENTIALS_JSON` (service account JSON string)
- `STRIPE_RESTRICTED_READ_KEY` (read-only restricted key — never full `sk_live`)

**AWS SSM (prefix `/youtubebooster/growth/`):**

| Env | SSM path | Type |
|-----|----------|------|
| `GA4_PROPERTY_ID` | `/youtubebooster/growth/ga4-property-id` | String |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | `/youtubebooster/growth/google-analytics-credentials-json` | SecureString |
| `STRIPE_RESTRICTED_READ_KEY` | `/youtubebooster/growth/stripe-restricted-read-key` | SecureString |

Grant the Google service account **Viewer** on GA4 property `G-P02EPD7EDB` (Admin → Property access management). See `docs/growth/SECRETS-SETUP.md`.

If missing, continue with health checks + code/CRM evidence and mark baselines `unknown`.

## Admin CRM

Use Admin CRM funnel/drop-off and live vs test revenue as operational signal. Do not confuse GA4 visitors with CRM users (`docs/ADMIN-METRICS.md`).
