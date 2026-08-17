---
name: grow-paid-customers
description: >-
  Acquisition-first paid-customer growth for YouTubeBooster AI. Every run must
  complete one ship (reversible production treatment or approved attributable
  acquisition action). Use for daily growth automation, qualified creator
  acquisition, founder outreach packages, mini-audit sharing, referral/distribution,
  GA4, product-attributed Stripe, Admin CRM, and reversible deploy-to-main experiments.
---

# Grow paid customers (YouTubeBooster AI)

Optimize for **verified YouTubeBooster-attributed Stripe purchases and revenue**, not vanity traffic.

Product: https://youtubeboosterai.com/  
Source of truth: **product-attributed Stripe only** (`docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`). Never count account-wide Stripe (may include GetTrainMate).  
Verified baseline until reconciliation proves otherwise: **0 external paying customers**.  
Preserve GA4 `G-P02EPD7EDB` (`frontend/index.html` + `frontend/src/lib/analytics.ts`). Never add a second GA4 install.

North star (not a promise): **1000+ verified YouTubeBooster paying customers**. Count product-attributed Stripe only. Leading 30-day indicators below are the near-term scoreboard.

Also follow **`docs/growth/AUTOMATION.md`** for the daily automation prompt, lock protocol, and ship definition.

## 30-day targets (targets, not promises)

| Metric | Target |
|--------|--------|
| Qualified completed channel audits | 100 |
| Pricing views | 20 |
| Checkout starts | 5 |
| Verified external paying customers | 3 |

## Definitions (mandatory)

### One ship

**One ship** = one reversible production treatment **or** one approved, attributable acquisition action.

Required but **not** additional ships: supporting tests, experiment-log updates, deployment verification, Admin report.

### Experiment evaluation

Evaluating an experiment is a **required decision**. Allowed labels: **Keep**, **Iterate**, **Stop**, **Inconclusive**, **Awaiting approval**. Never use **Continue**. Never report a due experiment as a future evaluation. A decision alone does **not** count as today’s ship unless it includes a reversible treatment change. After recording **keep-without-change** or **Inconclusive** with treatment unchanged, continue to the next applicable acquisition task.

### Production health

Fix critical production health first (e.g. missing homepage title, description, or canonical). After verification, continue to one acquisition ship **unless** the repair itself restores a broken acquisition path (then that repair may be today’s ship).

### Qualified audit

A **qualified audit** is a successfully completed audit for a real, publicly accessible YouTube channel with approximately **1,000–100,000** subscribers and identifiable packaging, discoverability, or SEO improvement opportunities.

**Exclude:** test, owner, duplicate, failed, and incomplete audits.

### Payments vs customers vs revenue

Report these **separately** (never label payments as customers):

| Field | Meaning |
|-------|---------|
| Successful product-attributed live payments | Checkout sessions / payments that pass the allowlist |
| Unique verified external paying customers | Distinct external customers among those payments |
| Owner / test payments | Explicitly labeled; not external customers |
| Refunds | Separately disclosed |
| Verified net revenue | Product-attributed only |
| Unattributed account-wide payments | Excluded from product revenue |
| Experiment-attributed purchases | Only with evidence (metadata/UTM); else Unknown |

One customer can make multiple payments.

### Metric units

Every metric must state its unit: **event** | **session** | **user** | **audit record** | **checkout session** | **payment** | **customer**.

Do **not** compute conversion rates across unrelated cohorts. Until same-cohort audit tracking exists, audit start→completion conversion is **Unavailable**.

### Sample paid report

Must use **fictional or sanitized** data. Must **not** imply a real creator was audited without inspection of public content.

## Acquisition-first rule (mandatory)

**Every scheduled run must complete one ship.**

These do **not** count by themselves:

- Reviewing analytics
- Updating the experiment log
- Waiting for more traffic
- Sending the Admin email
- Publishing another low-value SEO page
- Experiment evaluation with no treatment change

Active experiments lock **only** their locked funnel stage (see `docs/growth/EXPERIMENT-LOG.md`). They do **not** block independent outreach enablement, distribution, referral, creator partnerships, or other acquisition work that does not invalidate that stage.

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
2. Clear sample of the paid report (sanitized / fictional; e.g. MaxKantorCooking shape)
3. Shareable audit results with referral / UTM attribution
4. Ethical creator-referral program (owner approval before launch)
5. Post-audit lifecycle sequence copy (summary → priority issue → before/after → paid explanation)
6. Short demo-video script from a real audit
7. Qualified creator list + personalized founder outreach drafts (owner sends)
8. Partner pages (consultants, thumbnail designers, editors, communities)
9. Distribution from existing SEO pages into the audit
10. Free-preview → paid value demonstration
11. Repair audit-event or Stripe attribution when it restores a broken acquisition path

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

**Automation must not** submit forms, comment, or invent email addresses.

### Outreach send gates (all required)

A script existing or being enabled is **never** recipient approval. Do **not** run `scripts/growth/daily-outreach-send.mjs` unless **all** are true and recorded in the run notes:

1. Named recipient approval from Max
2. Exact approved address (public contact page only)
3. Exact approved subject and body version
4. Approval ID and timestamp
5. Unsubscribed / bounce / duplicate check passed
6. Explicit sending-enabled configuration for this run
7. Maximum **two** approved sends

EXP-004 lists are **not** send approval. Skip anyone marked **unsubscribed**. Rotate so the same creator is not emailed twice the same day.

Admin email must distinguish: prospect list created · drafts created · outreach actually sent · visits · audits · verified purchases.

## Daily workflow (strict order)

**Cost control:** Prefer the cheapest capable model. Skip `npm ci` / full builds unless shipping.

1. **Acquire lock** — `node scripts/growth/growth-run-lock.mjs acquire`. If a non-stale lock exists (stale = **120 minutes**), or another YouTubeBooster agent is active / rate-limited: **stop**. Never bypass or delete an active lock. Do not send a second report.
2. Verify production health (`scripts/growth/check-production-health.mjs`); fix critical issues first
3. Reconcile YouTubeBooster-specific Stripe (`collect-funnel-snapshot.mjs` + allowlist)
4. Read GA4 7d + 30d; read `docs/growth/EXPERIMENT-LOG.md` and recent commits
5. Evaluate due experiments; record keep / iterate / stop. Continue if keep-without-change
6. Review locked stages; identify the largest acquisition or revenue constraint
7. Score actions; select **exactly one** ship; define audience, channel, hypothesis, metric, guardrail, target, duration, rollback
8. Implement authorized repository changes (and/or outreach package)
9. Run tests + frontend production build; inspect diff
10. Commit + push `main` only when validation passes
11. Monitor Amplify `youtubebooster-ai-web` (`d2s1ju1o5ef9dw`); verify audit → pricing → checkout path (desktop + mobile)
12. On failure: do **not** report as shipped; revert when safe; record failure; send **one** failure Admin report; release lock; stop
13. Update experiment log with final commit / deployment
14. Email Admin via `compose-and-send-growth-email.mjs` (Decision-first; after final state)
15. **Release lock** — `node scripts/growth/growth-run-lock.mjs release`

## Funnel stages

Landing → source → audit starts → **qualified audit completions** → pricing views → checkout starts → **verified attributed purchases** → entitlement → returning users.

## Experiment concurrency

Never run two simultaneous experiments on the **same locked funnel stage**. See the locked-stage table in `docs/growth/EXPERIMENT-LOG.md`.

Acquisition / distribution / outreach packages may proceed in parallel when they do not invalidate an active treatment.

## Experiment definition (required when shipping)

Evidence · Hypothesis · Exact change · Primary metric · Guardrail · Baseline · Target · Evaluation date · Stop rule · Rollback · Funnel stage

## Deploy gate

1. Install deps if needed; run growth tests (`scripts/growth` `npm test`); frontend `npm run build`
2. Inspect diff — one change set; reversible; does not break active experiment treatments
3. Commit + push `main`
4. Monitor Amplify; smoke `/share`, `/demo`, `/sample-report`, pricing, checkout/success
5. On failure: revert when safe, record cause, failure Admin email, release lock, stop

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/growth/growth-run-lock.mjs` | Acquire / release / status (stale = 120m) |
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
