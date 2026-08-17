---
name: grow-paid-customers
description: >-
  Customer-acquisition override for YouTubeBooster AI. Immediate milestone is the
  next newly attributed external customer. Every run must execute approved external
  distribution or remove a proven funnel blocker. Use for daily growth automation,
  qualified creator acquisition, founder outreach, GA4, product-attributed Stripe,
  Admin CRM, and reversible deploy-to-main work.
---

# Grow paid customers (YouTubeBooster AI)

Optimize for **verified YouTubeBooster-attributed Stripe purchases and revenue**, not vanity traffic.

Product: https://youtubeboosterai.com/  
Source of truth: **product-attributed Stripe only** (`docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`). Never count account-wide Stripe (may include GetTrainMate).  
Verified baseline until reconciliation proves otherwise: **0 external paying customers**.  
Preserve GA4 `G-P02EPD7EDB` (`frontend/index.html` + `frontend/src/lib/analytics.ts`). Never add a second GA4 install.

**North star** (scoreboard, not a promise): **1000+ verified YouTubeBooster paying customers**.  
**Immediate milestone:** the **next newly attributed external customer**.

Also follow **`docs/growth/AUTOMATION.md`**.

## Customer acquisition override (mandatory)

Accurate reporting is required but is **not** the primary output.

These **do not** count as customer acquisition:

- Analytics review
- Report formatting
- Documentation
- Internal pages
- Experiment-log updates
- Health checks
- Draft packages that are not sent
- Production changes that are deployed but not placed in front of an external audience

A production asset is **not** distributed merely because it is deployed.

### Every successful run must complete

1. **One measurable acquisition improvement, when necessary** (a reversible treatment that improves visits → activation → checkout → verified payment, or removal of a proven funnel blocker); **and**
2. **One real, policy-compliant distribution action** that places the product in front of a relevant **external** audience.

A run is successful **only** when it either:

- Executes an **approved external distribution** action; **or**
- **Removes a proven blocker** preventing qualified traffic from entering or completing the funnel.

### Allowed distribution channels (exactly one per run)

- An explicitly approved recipient and exact approved message
- An owned social account with explicit posting authorization
- An approved email list with valid consent and unsubscribe controls
- A legitimate partner or community channel that permits promotion
- Paid advertising within an explicitly approved budget
- A product-triggered referral/share action initiated by a **real user**

**Never:** spam; invent contacts; automate comments or DMs; evade community rules; claim visits, customers, or revenue without verified attribution.

### Until the first newly attributed external customer

- Run **no more than one experiment per funnel stage**.
- Prefer **qualified distribution** over additional CRO.
- Do **not** launch another experiment merely because the current run requires a ship.
- Measure **visits → activation → checkout → verified payment**.
- Report **new customers acquired by this run** separately from customers merely **observed** during its date window.
- If distribution requires Max’s approval and none exists: **prepare the exact action** and make the Admin report **lead with a blocking approval request**. Do not substitute another analytics or formatting task.

## 30-day targets (targets, not promises)

| Metric | Target |
|--------|--------|
| Qualified completed channel audits | 100 |
| Pricing views | 20 |
| Checkout starts | 5 |
| Verified external paying customers | 3 |

## Definitions (mandatory)

### Successful run vs supporting work

Supporting tests, experiment-log updates, deployment verification, and the Admin report are **required** when shipping but **do not** make the run successful.

### Experiment evaluation

Evaluating an experiment is a **required decision**. Allowed labels: **Keep**, **Iterate**, **Stop**, **Inconclusive**, **Awaiting approval**. Never use **Continue**. Never report a due experiment as a future evaluation. A decision alone does **not** satisfy distribution. After recording **keep-without-change** or **Inconclusive** with treatment unchanged, execute distribution (or file a blocking approval request).

### Production health

Fix critical production health first (e.g. missing homepage title, description, or canonical). After verification, continue to distribution. A health repair counts as the successful run **only** if it **removes a proven blocker** preventing qualified traffic from entering or completing the funnel.

### Qualified audit

A **qualified audit** is a successfully completed audit for a real, publicly accessible YouTube channel with approximately **1,000–100,000** subscribers and identifiable packaging, discoverability, or SEO improvement opportunities.

**Exclude:** test, owner, duplicate, failed, and incomplete audits.

### Customer buckets (never collapse)

| Bucket | Meaning |
|--------|---------|
| Existing customers | Verified external paying customers already on the books before this run |
| Customers observed during the window | Verified external customers whose payment timestamp falls in the GA4/Stripe window (may predate this run’s action) |
| Experiment-attributed customers | Verified external customers with evidence tying the purchase to a named experiment (metadata/UTM); else **Unknown** |
| New customers acquired by this run | Verified external customers **causally attributed to this run’s distribution or blocker-removal** (evidence required). Default **0**. |

Payments ≠ customers. One customer can make multiple payments.

### Metric units

Every metric must state its unit: **event** | **session** | **user** | **audit record** | **checkout session** | **payment** | **customer**.

Do **not** compute conversion rates across unrelated cohorts. Until same-cohort audit tracking exists, audit start→completion conversion is **Unavailable**.

### Sample paid report

Must use **fictional or sanitized** data. Must **not** imply a real creator was audited without inspection of public content.

## Target customer

Prioritize active small creators who:

- Publish consistently
- Have roughly **1,000–100,000** subscribers
- Show visible title, thumbnail, positioning, or search problems
- Will act on practical recommendations
- Cannot justify an expensive consultant
- Prefer a **one-time audit** over another subscription

Do **not** target inactive, abandoned, private, children-focused, or sensitive channels.

## Prioritized actions (until first new customer)

Score with `(expected customer impact × confidence × strategic fit) ÷ effort`. Prefer distribution. Do not pick a new CRO experiment just to have a ship.

1. Execute an **approved** named-recipient send (max 2; exact subject/body; public address only)
2. Post from an **owned social account** with explicit posting authorization
3. Send to an **approved email list** with consent + unsubscribe
4. Publish in a **legitimate partner/community channel** that permits promotion
5. Run **paid ads** only inside an explicitly approved budget
6. Enable a **real-user** referral/share action (not agent-fabricated)
7. Remove a **proven** funnel blocker (broken audit path, missing canonical that blocks SEO, checkout failure)
8. Prepare the **exact** next distribution action and **block on Max’s approval** if none of the above is authorized

**Hard bans:** mass automated outreach, fake comments/testimonials/engagement, generic spam, claiming a channel was reviewed without inspecting public content, auto-sending DMs/emails/forms/comments without explicit authorization.

Also never auto-change: product price, Stripe config, auth, AWS infra, privacy/legal, medical/financial/guaranteed-growth claims, ad spend, refund policies, production secrets.

## Founder outreach send gates (all required)

A script existing or being enabled is **never** recipient approval. Draft packages are **not** distribution.

Do **not** run `scripts/growth/daily-outreach-send.mjs` unless **all** are true and recorded in the run notes:

1. Named recipient approval from Max
2. Exact approved address (public contact page only)
3. Exact approved subject and body version
4. Approval ID and timestamp
5. Unsubscribed / bounce / duplicate check passed
6. Explicit sending-enabled configuration for this run
7. Maximum **two** approved sends

EXP-004 lists are **not** send approval. Skip anyone marked **unsubscribed**. Rotate so the same creator is not emailed twice the same day.

## Daily workflow (strict order)

**Cost control:** Prefer the cheapest capable model. Skip `npm ci` / full builds unless a production treatment ships.

1. **Acquire lock** — `node scripts/growth/growth-run-lock.mjs acquire`. If a non-stale lock exists (stale = **120 minutes**), or another YouTubeBooster agent is active / rate-limited: **stop**. Never bypass or delete an active lock. Do not send a second report.
2. Verify production health; fix **proven funnel blockers** first
3. Collect GA4 7d + 30d (data-through = yesterday ET) + product Stripe
4. Evaluate due experiments (Keep / Iterate / Stop / Inconclusive / Awaiting approval)
5. **Distribution:** execute an allowed channel **or** prepare the exact action and mark **blocking owner approval**
6. Acquisition improvement only if necessary and it does not add a second experiment on a locked stage
7. Tests + frontend production build if production code changes; inspect diff
8. Commit + push `main` only when validation passes
9. Monitor Amplify `youtubebooster-ai-web` (`d2s1ju1o5ef9dw`) when frontend shipped
10. On failure: do **not** report distribution as executed; revert when safe; one failure Admin report; release lock; stop
11. Update experiment log with final commit / deployment / distribution evidence
12. Email Admin via `compose-and-send-growth-email.mjs` **after final state**. Lead with the acquisition scoreboard (below).
13. **Release lock** — `node scripts/growth/growth-run-lock.mjs release`

## Admin report lead (mandatory)

The email **must lead** with:

- Distribution executed (yes/no + what)
- Audience/channel
- Attributed visits
- Activations
- Checkout starts
- Newly attributed external customers (**this run**)
- Verified revenue
- Required owner approval (blocking vs none)

Then distinguish:

- Existing customers
- Customers observed during the experiment window
- Customers causally attributed to a specific experiment
- New customers acquired by the current run

## Funnel stages

Visits → activation (qualified audit / signup attach as labeled) → checkout starts → **verified attributed payment**.

Landing → source → audit starts → **qualified audit completions** → pricing views → checkout starts → **verified attributed purchases** → entitlement → returning users.

## Experiment concurrency

Until the first newly attributed external customer: **at most one experiment per funnel stage**. See `docs/growth/EXPERIMENT-LOG.md`. Do not start a new experiment to satisfy the run.

## Experiment definition (required when a treatment ships)

Evidence · Hypothesis · Exact change · Primary metric · Guardrail · Baseline · Target · Evaluation date · Stop rule · Rollback · Funnel stage

## Deploy gate

1. Growth tests (`scripts/growth` `npm test`); frontend `npm run build` if UI changed
2. Inspect diff — reversible; does not break active treatments; distribution evidence or blocking approval is explicit
3. Commit + push `main` when production code or docs that the automation reads must ship
4. On failure: revert when safe, record cause, failure Admin email, release lock, stop

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
| `docs/growth/outreach/` | Founder outreach packages (drafts until send gates pass) |

## Secrets (never commit)

See `docs/growth/SECRETS-SETUP.md`. Stripe key must remain read-only (`rk_…`).

## Admin CRM

Operational signal only. Do not confuse GA4 visitors with CRM users (`docs/ADMIN-METRICS.md`).
