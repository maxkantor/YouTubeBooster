# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Name:** YouTubeBooster daily paid growth  
**Schedule:** Monday–Friday **8:00 AM America/New_York**  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Full Admin email after every run → `scripts/growth/compose-and-send-growth-email.mjs`  
**North star:** 1000+ verified paying customers (scoreboard, not a promise)  
**Mode:** **Acquisition-first** — every run must complete one meaningful customer-getting action

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

North star: 1000+ verified YouTubeBooster paying customers. That is a scoreboard, not a promise. Count product-attributed live Stripe only (docs/growth/STRIPE-PRODUCT-ALLOWLIST.md). Never attribute account-wide Stripe. Never invent audits, customers, or testimonials.

ACQUISITION-FIRST: every run must complete one meaningful customer-getting action. Reviewing analytics, updating the log, waiting, sending Admin email, or publishing another low-value SEO page do not count.

Today’s task order (do the first unfinished item, then stop after one ship):
1) Production health. If homepage title, description, or canonical is missing, fix that before any new landing page.
2) Evaluate experiments whose eval date is today or has passed. On the next run that is EXP-001 only unless another date is due. Keep, iterate, or stop. Record the result. If you evaluated, that is today’s action unless a keep/iterate decision requires one code change.
3) If homepage metadata is healthy and audit volume is still too low, ship ONE acquisition action that is not a new SEO article: mini-audit share, sample report, or referral/share UTMs. Target active creators ~1k–100k subs with visible packaging/SEO problems who prefer a one-time audit. Do not add another SEO landing while EXP-002 or EXP-003 is still in-flight.
4) If audits complete but checkout does not, ship ONE post-audit upgrade/pricing-clarity change. Do not start a second test on the same funnel stage.
5) Founder outreach: drafts and packages only unless Max has explicitly approved named recipients. EXP-004 lists are not send approval. Do not invent emails. Do not run daily-outreach-send.mjs unless this run’s notes name the approval id and the exact recipients. Otherwise drafts only. Cap 2, skip unsubscribed, rotate recipients.

Hard bans: mass spam; fake comments/engagement/testimonials; claiming a channel was reviewed without inspecting public content; auto DMs/forms/comments; payments/prices/auth/secrets; guaranteed-growth claims.

Preserve active experiment treatments. Independent acquisition may ship in parallel.

Run then:
- Product Stripe reconcile + GA4 7d/30d
- Tests + frontend build if shipping; commit/push main only if valid; monitor Amplify
- Update docs/growth/EXPERIMENT-LOG.md
- ALWAYS email Admin:
node scripts/growth/compose-and-send-growth-email.mjs --notes "<action shipped; audits; pricing views; checkout starts; paid this week vs 1000 north star; outreach sent vs drafts; eval result; blockers>"

Admin notes must distinguish: prospect list vs drafts vs sent vs visits vs audits vs verified purchases.

Cost: cheapest capable model. Skip npm ci unless shipping.

If rate-limited or another YouTubeBooster agent is already active: stop. Do not start a second parallel growth job.

Load secrets via scripts/growth/load-ssm-secrets-into-env.mjs. Never commit credentials. Stripe key rk_ only.
```

---

## SSM reference

See `docs/growth/SECRETS-SETUP.md` and `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`.
