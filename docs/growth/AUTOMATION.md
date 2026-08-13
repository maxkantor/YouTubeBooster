# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Name:** YouTubeBooster daily paid growth  
**Schedule:** Monday–Friday **8:00 AM America/New_York**  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Full Admin email after every run → `scripts/growth/compose-and-send-growth-email.mjs`  
**Mode:** **Acquisition-first** — every run must complete one meaningful growth action

---

## Cost controls (do in Cursor UI)

1. **Model:** Cheapest capable model (e.g. Composer / Auto).
2. **Schedule:** Mon–Fri 8:00 AM Eastern.
3. **Spend limit:** Low hard limit on [billing](https://cursor.com/dashboard/billing).
4. Keep the cost paragraph in the prompt below.

---

## Finish / edit in Automations

1. Open **Automations** → **YouTubeBooster daily paid growth**
2. Replace **Agent instructions** with the prompt below
3. Confirm schedule **8:00 AM** Eastern
4. Secrets in Automation Secrets UI only — **never paste secret values into this file**
5. Leave **Active** On

### Automation secret *names* (values from SSM / IAM — not in git)

| Secret name | Source |
|-------------|--------|
| `GA4_PROPERTY_ID` | SSM `/youtubebooster/growth/ga4-property-id` |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | SSM `/youtubebooster/growth/google-analytics-credentials-json` |
| `STRIPE_RESTRICTED_READ_KEY` | SSM `/youtubebooster/growth/stripe-restricted-read-key` |
| `AWS_ACCESS_KEY_ID` | IAM |
| `AWS_SECRET_ACCESS_KEY` | IAM |
| `AWS_REGION` | `us-east-1` |

---

## Prompt (paste into Automations)

```
Read and follow .cursor/skills/grow-paid-customers/SKILL.md.

ACQUISITION-FIRST: Every run must complete one meaningful growth action. Reviewing analytics, updating the experiment log, waiting for traffic, sending Admin email, or publishing another low-value SEO page do NOT count by themselves.

Verified baseline until product Stripe reconciliation proves otherwise: 0 external paying customers. Never attribute account-wide Stripe to YouTubeBooster. Filter via docs/growth/STRIPE-PRODUCT-ALLOWLIST.md.

Preserve active experiments and their evaluation dates. Active experiments lock only their exact treatment/cohort — they do not block outreach packages, mini-audit sharing, referral/distribution, or other acquisition work.

30-day targets (not promises): 100 qualified completed audits, 20 pricing views, 5 checkout starts, 3 verified external paying customers.

Target: active creators ~1k–100k subs with visible packaging/SEO problems who prefer a one-time audit. No inactive/private/children/sensitive channels. No mass spam, fake social proof, or auto-sending outreach.

Run:
1) Production health
2) Product-specific Stripe reconcile + GA4 7d/30d
3) Experiment log + recent commits + locks
4) Pick largest acquisition/revenue constraint
5) Score actions; ship exactly ONE reversible action (prefer mini-audit share, sample paid report, outreach package, distribution, or attribution repair over generic SEO)
6) If outreach: write sanitized docs/growth/outreach package with 10 drafts + UTM links — do NOT send
7) Tests + frontend build; commit/push main only if valid; monitor Amplify; verify /share /demo /sample-report pricing checkout
8) Update experiment log
9) ALWAYS email Admin via:
node scripts/growth/compose-and-send-growth-email.mjs --notes "<Decision; growth action completed; asset created; distribution status; owner actions; audits-by-source notes; verified customers; next action>"

Admin notes must distinguish: prospect list created vs drafts created vs outreach actually sent vs visits vs audits vs verified purchases.

Cost: prefer cheapest model; skip npm ci unless shipping; still complete one meaningful growth action every run.

Load secrets via scripts/growth/load-ssm-secrets-into-env.mjs. Never commit credentials. Stripe key rk_ only.
```

---

## SSM reference

See `docs/growth/SECRETS-SETUP.md` and `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`.
