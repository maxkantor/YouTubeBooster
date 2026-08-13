# Canonical growth metrics

Shared definitions used by funnel snapshots, Admin email scoreboard, agent summaries, and experiment reporting (`scripts/growth/lib/canonical-metrics.mjs`).

## Units

| Metric | Unit | Source |
|--------|------|--------|
| `sessions` | sessions (events) | GA4 `session_start` |
| `qualified_landing_sessions` | sessions | GA4 `pagePath` sessions on EXP-002/003 eligible pages |
| `audit_starts` | **events** (not unique audits yet) | GA4 `audit_started` only |
| `audit_completions` | **events** | GA4 `audit_completed` only |
| `pricing_viewers` | events | GA4 `pricing_viewed` |
| `checkout_starts` | events | GA4 `checkout_started` |
| `successful_live_payments` | payments | **Verified YouTubeBooster-attributed** live Checkout Sessions only (never account-wide Stripe). Baseline **0** until `reconciliationComplete`. |
| `unique_paying_customers` | customers | Unique **external** customers among verified attributed payments (baseline **0** until reconciliation). |
| `live_revenue` | USD | Verified attributed net live revenue (baseline **$0** until reconciliation). |
| `unattributed_stripe_payments` | payments | Live paid sessions lacking conclusive YouTubeBooster attribution — **not** product revenue |
| `entitled_paid_users` | users | Admin CRM (unavailable in growth scripts without CRM auth) |
| `activation_within_24h` | users | Admin CRM — required for EXP-001 |
| `experiment_attributed_paid` | payments | Unknown unless checkout metadata/UTM proves attribution |

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

Report both period event totals and (when available) cohort conversion for audits started in-period. Do not divide unrelated totals and call it a conversion rate.
