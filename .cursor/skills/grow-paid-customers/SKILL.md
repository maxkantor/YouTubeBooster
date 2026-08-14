---
name: grow-paid-customers
description: >-
  Acquisition-first paid-customer growth for YouTubeBooster AI. Every run must
  complete one meaningful growth action (not analytics-only). Use for daily
  growth automation, qualified creator acquisition, founder outreach packages,
  mini-audit sharing, referral/distribution, GA4, product-attributed Stripe,
  Admin CRM, and reversible deploy-to-main experiments.
---

# Grow paid customers (YouTubeBooster AI)

Optimize for **verified YouTubeBooster-attributed Stripe purchases and revenue**, not vanity traffic.

Product: https://youtubeboosterai.com/  
Source of truth: **product-attributed Stripe only** (`docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`). Never count account-wide Stripe (may include GetTrainMate).  
Verified baseline until reconciliation proves otherwise: **0 external paying customers**.  
Preserve GA4 `G-P02EPD7EDB` (`frontend/index.html` + `frontend/src/lib/analytics.ts`). Never add a second GA4 install.

## 30-day targets (targets, not promises)

| Metric | Target |
|--------|--------|
| Qualified completed channel audits | 100 |
| Pricing views | 20 |
| Checkout starts | 5 |
| Verified external paying customers | 3 |

## Acquisition-first rule (mandatory)

**Every scheduled run must complete one meaningful growth action.**

These do **not** count by themselves:

- Reviewing analytics
- Updating the experiment log
- Waiting for more traffic
- Sending the Admin email
- Publishing another low-value SEO page

Active experiments lock **only** their exact treatment and cohort. They do **not** block independent outreach enablement, distribution, referral, creator partnerships, or other acquisition work.

## Target customer

Prioritize active small creators who:

- Publish consistently
- Have roughly **1,000–100,000** subscribers
- Show visible title, thumbnail, positioning, or search problems
- Will act on practical recommendations
- Cannot justify an expensive consultant
- Prefer a **one-time audit** over another subscription

Do **not** target inactive, abandoned, private, children-focused, or sensitive channels.

## Prioritized acquisition actions

Score with `(expected customer impact × confidence × strategic fit) ÷ effort`, then pick **exactly one**:

1. Personalized mini-audit sharing page (one useful observation + CTA to full free audit)
2. Clear sample of the paid report (e.g. MaxKantorCooking)
3. Shareable audit results with referral / UTM attribution
4. Ethical creator-referral program (owner approval before launch)
5. Post-audit lifecycle sequence copy (summary → priority issue → before/after → paid explanation)
6. Short demo-video script from a real audit
7. Qualified creator list + personalized founder outreach drafts (owner sends)
8. Partner pages (consultants, thumbnail designers, editors, communities)
9. Distribution from existing SEO pages into the audit
10. Free-preview → paid value demonstration
11. Repair audit-event or Stripe attribution

**Hard bans:** mass automated outreach, fake comments/testimonials/engagement, generic spam, claiming a channel was reviewed without inspecting public content, auto-sending DMs/emails/forms/comments without explicit authorization.

Also never auto-change: product price, Stripe config, auth, AWS infra, privacy/legal, medical/financial/guaranteed-growth claims, ad spend, refund policies, production secrets.

## Founder outreach package (when selected)

Create a sanitized package under `docs/growth/outreach/` with **10** prospects:

- Public channel URL
- Visible growth issue
- One genuinely useful observation (from public data only)
- Personalized outreach draft
- Public contact route if available
- UTM-tagged audit / mini-audit URL
- Follow-up draft
- Tracking status (`draft` / `approved` / `sent_by_owner` / …)

**Automation must not** submit forms, comment, or invent email addresses. Owner-approved daily cooking outreach may send **at most 2** SES emails via `scripts/growth/daily-outreach-send.mjs` to roster addresses that were copied from public contact pages. Skip anyone marked **unsubscribed**. Rotate so the same creator is not emailed twice the same day.

Admin email must distinguish: prospect list created · drafts created · outreach actually sent · visits · audits · verified purchases.

## Daily workflow

**Cost control:** Prefer the cheapest capable model. Skip `npm ci` / full builds unless shipping. Always still complete one meaningful growth action (code asset, outreach package, distribution enablement, or measurement repair that unblocks acquisition).

1. Verify production health (`scripts/growth/check-production-health.mjs`)
2. Reconcile YouTubeBooster-specific Stripe (`collect-funnel-snapshot.mjs` + allowlist)
3. Read GA4 7d + 30d; read `docs/growth/EXPERIMENT-LOG.md` and recent commits
4. Review active experiment locks (exact treatment/cohort only)
5. Identify the largest acquisition or revenue constraint
6. Score actions; select **exactly one** reversible action; define audience, channel, hypothesis, metric, guardrail, target, duration, rollback
7. Implement authorized repository changes (and/or outreach package)
8. Run tests + frontend production build; inspect diff
9. Commit + push `main` only when validation passes
10. Monitor Amplify `youtubebooster-ai-web` (`d2s1ju1o5ef9dw`); verify audit → pricing → checkout path (desktop + mobile)
11. Revert if verification fails; append experiment log
12. Email Admin via `compose-and-send-growth-email.mjs` with Decision-first acquisition report

## Funnel stages

Landing → source → audit starts → **qualified audit completions** → pricing views → checkout starts → **verified attributed purchases** → entitlement → returning users.

## Experiment concurrency

Never run two simultaneous **conversion** experiments on the **same funnel stage treatment**.  
Acquisition / distribution / outreach packages may proceed in parallel when they do not invalidate an active treatment.

## Experiment definition (required when shipping)

Evidence · Hypothesis · Exact change · Primary metric · Guardrail · Baseline · Target · Evaluation date · Stop rule · Rollback · Funnel stage

## Deploy gate

1. Install deps if needed; run growth tests (`scripts/growth` `npm test`); frontend `npm run build`
2. Inspect diff — one change set; reversible; does not break active experiment treatments
3. Commit + push `main`
4. Monitor Amplify; smoke `/share`, `/demo`, `/sample-report`, pricing, checkout/success
5. On failure: revert and record cause

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/growth/collect-funnel-snapshot.mjs` | GA4 + attributed Stripe |
| `scripts/growth/check-production-health.mjs` | Live health + key routes |
| `scripts/growth/compose-and-send-growth-email.mjs` | Full Admin email |
| `scripts/growth/lib/canonical-metrics.mjs` | Metric definitions |
| `scripts/growth/config/stripe-allowlist.json` | Product attribution allowlist |
| `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md` | Attribution rules |
| `docs/growth/outreach/` | Founder outreach packages (drafts only) |

## Secrets (never commit)

See `docs/growth/SECRETS-SETUP.md`. Stripe key must remain read-only (`rk_…`).

## Admin CRM

Operational signal only. Do not confuse GA4 visitors with CRM users (`docs/ADMIN-METRICS.md`).
