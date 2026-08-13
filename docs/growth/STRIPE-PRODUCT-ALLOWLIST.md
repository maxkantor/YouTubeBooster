# Stripe product attribution (YouTubeBooster AI)

## Critical rule

The Stripe account may contain payments from **multiple applications** (including GetTrainMate).

**Never** treat an account-wide Stripe live-payment query as YouTubeBooster revenue or customers.

Include a payment only when it is **conclusively attributed** to YouTubeBooster AI.

## Verified business baselines (until reconciliation completes)

| Product | Verified external paying customers |
|---------|------------------------------------|
| YouTubeBooster AI | **0** |
| GetTrainMate | **0** |

Do **not** overwrite these baselines from an unfiltered Stripe list.

While `reconciliationComplete` is `false` in `scripts/growth/config/stripe-allowlist.json` (or env `STRIPE_YB_RECONCILIATION_COMPLETE` is not `true`), growth scoreboards report:

- verified successful live payments = **0**
- verified unique external paying customers = **0**
- verified net live revenue = **$0.00**

Diagnostic buckets (unattributed / other-app / excluded) may still be shown separately.

## Conclusive attribution signals

A live Checkout Session counts as **YouTubeBooster-attributed** only if **all** of the following hold:

1. `livemode === true`
2. `status === complete` and `payment_status === paid`
3. Not fully refunded (when refund data is available)
4. Not excluded as owner/self, smoke/setup test, or duplicate Charge/PaymentIntent representation
5. At least one positive match below, and **no** conflicting other-app identity:

| Signal | Source | Notes |
|--------|--------|-------|
| `metadata.app === youtubeboosterai` | Checkout Session (+ PaymentIntent metadata) | **Primary** — set by backend checkout create |
| `metadata.brand === YouTubeBoosterAI` | Checkout Session | Supporting |
| Catalog `price` / `product` ID on allowlist | Line items | Empty until catalog prices exist |
| Payment Link ID on allowlist | Session / link | Optional |
| Success URL host in allowlist | `success_url` | Supporting; not sufficient alone if `app` missing |

Payments that are live+paid but fail attribution → **`Unattributed Stripe payment`** (not YouTubeBooster revenue/customers).

## Allowlist file

`scripts/growth/config/stripe-allowlist.json`

Override without editing the file (comma-separated; no secrets required for IDs):

| Env | Purpose |
|-----|---------|
| `STRIPE_YB_PRODUCT_IDS` | Allowlisted Product IDs |
| `STRIPE_YB_PRICE_IDS` | Allowlisted Price IDs |
| `STRIPE_YB_PAYMENT_LINK_IDS` | Allowlisted Payment Link IDs |
| `STRIPE_YB_EXCLUDED_CUSTOMER_IDS` | Owner/self Stripe customer IDs to exclude |
| `STRIPE_YB_EXCLUDED_EMAIL_HASHES` | SHA-256 hex (full or first 16 chars) of normalized emails to exclude |
| `STRIPE_YB_RECONCILIATION_COMPLETE` | `true` only after human reconciliation |

Optional SSM (loaded by `load-ssm-secrets-into-env.mjs` when present):

- `/youtubebooster/growth/stripe-product-ids`
- `/youtubebooster/growth/stripe-price-ids`
- `/youtubebooster/growth/stripe-payment-link-ids`
- `/youtubebooster/growth/stripe-excluded-customer-ids`
- `/youtubebooster/growth/stripe-reconciliation-complete`

## Current checkout shape

Backend creates Checkout Sessions with **inline `price_data`** (product name `YouTube Booster AI`) and stamps:

```text
metadata.app = youtubeboosterai
metadata.brand = YouTubeBoosterAI
```

There may be **no** durable catalog Price/Product ID on historical sessions. Metadata.app is therefore the conclusive app key today. Catalog IDs should be added to the allowlist when introduced.

## Exclusions

- Other application payments
- Owner / self purchases (`excludedCustomerIds` / email hashes)
- Setup and smoke-test purchases (metadata flags)
- Refunded payments (excluded from net revenue; fully refunded excluded from payment counts)
- Test-mode payments
- Duplicate Charge vs PaymentIntent vs Checkout Session double-counting (growth scripts count Checkout Sessions only, once per `session.id`)
- Unknown product attribution → Unattributed

## Reporting fields

| Field | Meaning |
|-------|---------|
| `verifiedSuccessfulLivePayments` | Attributed + external + not excluded; **forced to baseline until reconciliation** |
| `verifiedUniquePayingCustomers` | Unique external customers among verified payments |
| `unattributedLivePayments` | Live paid sessions without conclusive YouTubeBooster attribution |
| `otherAppLivePayments` | Live paid sessions clearly tagged for another app |
| `excludedOwnerOrSmokePayments` | Matched owner/smoke exclusion rules |
| `accountWideLivePaidSessions` | Diagnostic only — never use as YouTubeBooster revenue |
