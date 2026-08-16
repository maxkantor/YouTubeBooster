# Canonical growth metrics

Shared definitions used by funnel snapshots, Admin email scoreboard, agent summaries, and experiment reporting (`scripts/growth/lib/canonical-metrics.mjs`).

## Unit labels (mandatory in reports)

Every reported number must state whether it is an **event**, **session**, **user**, **audit record**, **checkout session**, **payment**, or **customer**. Never compute conversion rates across unrelated cohorts.

## Qualified audit

A **qualified audit** is a successfully completed audit for a real, publicly accessible YouTube channel with approximately **1,000–100,000** subscribers and identifiable packaging, discoverability, or SEO improvement opportunities.

**Exclude** from qualified counts: test, owner, duplicate, failed, and incomplete audits. Raw GA4 `audit_completed` **events** are not the same as qualified audit **records**.

## Payments vs customers vs revenue

Report separately. One customer can make multiple payments — never label payments as customers.

| Field | Unit | Rule |
|-------|------|------|
| Successful product-attributed live payments | payment / checkout session | Allowlist only |
| Unique verified external paying customers | customer | Distinct external customers among those payments |
| Owner / test payments | payment | Labeled; not external customers |
| Refunds | payment | Disclosed separately |
| Verified net revenue | USD | Product-attributed only |
| Unattributed account-wide payments | payment | Excluded from product revenue |
| Experiment-attributed purchases | payment | Evidence required; else Unknown |

## Units

| Metric | Unit | Source |
|--------|------|--------|
| `sessions` | sessions (events) | GA4 `session_start` |
| `qualified_landing_sessions` | sessions | GA4 `pagePath` sessions on EXP-002/003 eligible pages |
| `audit_starts` | **events** (not unique audits yet) | GA4 `audit_started` only |
| `audit_completions` | **events** | GA4 `audit_completed` only |
| `successful_live_payments` | payments | **Verified YouTubeBooster-attributed** live Checkout Sessions only (never account-wide Stripe). Baseline **0** until `reconciliationComplete`. |
| `unique_paying_customers` | customers | Unique **external** customers among verified attributed payments (baseline **0** until reconciliation). |
| `live_revenue` | USD | Verified attributed net live revenue (baseline **$0** until reconciliation). |
| `unattributed_stripe_payments` | payments | Live paid sessions lacking conclusive YouTubeBooster attribution — **not** product revenue |
| `entitled_paid_users` | users | Admin CRM (unavailable in growth scripts without CRM auth) |
| `activation_within_24h` | users | Admin CRM — required for EXP-001 |
| `experiment_attributed_paid` | payments | Unknown unless checkout metadata/UTM proves attribution |
| `pricing_viewers` | events | GA4 `pricing_viewed` |
| `checkout_starts` | events | GA4 `checkout_started` |

See **`docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`**. GetTrainMate and YouTubeBooster verified external paying customers are both **0** until reconciliation.

## Alias rules

- Do **not** sum overlapping aliases for the same action.
- Do **not** treat absence from a truncated top-events table as zero — query required funnel events explicitly.
- Frontend `purchase_completed` is a proxy only; Stripe is revenue truth.
- Email addresses never appear in snapshots, logs, or Admin emails.

## Completions vs starts

`audit_completed` may exceed `audit_started` in a window when:

1. Audits started before the window completed inside it (not a same-window cohort).
2. Historical showcase/demo completions were counted (fixed: default demo no longer fires `audit_completed`).
3. Remount/retry double-fires before attempt-id dedupe (fixed via sessionStorage attempt ids).

Until start and completion share an `audit_attempt_id` in the same window, **do not divide** `audit_completed` by `audit_started` (that produced a false 275% start-to-completion rate). Display conversion as **Unavailable**.
