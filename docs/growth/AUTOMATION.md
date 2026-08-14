# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Name:** YouTubeBooster daily paid growth  
**Schedule:** Monday–Friday **8:00 AM America/New_York**  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Full Admin email after every run → `scripts/growth/compose-and-send-growth-email.mjs`  
**Mode:** **Acquisition-first** — every run must complete one meaningful growth action

---

## Rate limits / concurrent runs

Cursor may fail a scheduled run with **Rate limited — too many concurrent runs**.

This happens when another YouTubeBooster Cloud Agent or chat is already running (for example this IDE chat plus the 8:00 AM automation).

**Do this:**

1. Let other YouTubeBooster agents finish (or stop extra ones).
2. Open **YouTubeBooster daily paid growth** → **Run now**.
3. Do **not** start a second growth automation in parallel.
4. Prefer **one** YouTubeBooster cloud/agent job at a time on weekdays at 8:00 AM.

If a weekday 8:00 AM run fails for rate limit, treat it as a missed run: retry once after a few minutes. Do not spawn extra parallel retries.

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

Target: active creators ~1k–100k subs with visible packaging/SEO problems who prefer a one-time audit. No inactive/private/children/sensitive channels. No mass spam or fake social proof.

Run:
1) Production health
2) Product-specific Stripe reconcile + GA4 7d/30d
3) Experiment log + recent commits + locks
4) Pick largest acquisition/revenue constraint
5) Score actions; ship exactly ONE reversible action when needed
6) Send daily cooking outreach (max 2): node scripts/growth/daily-outreach-send.mjs — skips unsubscribed, rotates recipients, never invents emails
7) Tests + frontend build; commit/push main only if valid; monitor Amplify
8) Update experiment log
9) ALWAYS email Admin via:
node scripts/growth/compose-and-send-growth-email.mjs --notes "<Decision; growth action completed; outreach sent vs skipped unsubscribed; verified customers; next action>"

Admin notes must distinguish: prospect list created vs drafts created vs outreach actually sent vs visits vs audits vs verified purchases.

Cost: prefer cheapest model; skip npm ci unless shipping; still complete one meaningful growth action every run.

If this run is rate-limited or another YouTubeBooster agent is already active: stop. Do not start a second parallel growth job. The owner should click Run now after other agents finish.

Load secrets via scripts/growth/load-ssm-secrets-into-env.mjs. Never commit credentials. Stripe key rk_ only.
```

---

## SSM reference

See `docs/growth/SECRETS-SETUP.md` and `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`.
