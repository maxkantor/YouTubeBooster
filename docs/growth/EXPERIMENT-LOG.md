# YouTubeBooster AI — paid customer growth experiment log

Agents must append every experiment here. Do not delete history.

## Active

**EXP-001** — Post-checkout guest activation (same-email signup). Shipped 2026-08-10 (`b26d7d0`, Amplify job 221). Funnel stage: post-purchase activation / signup attach. **Evaluation date: 2026-08-17.** Do not ship same-stage CRO until complete. Full definition in log below.

## Log

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

_None yet._
