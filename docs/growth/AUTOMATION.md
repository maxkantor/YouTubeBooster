# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Name:** YouTubeBooster daily paid growth  
**Schedule:** Monday–Friday **8:00 AM America/New_York**  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Full Admin email after every run → `scripts/growth/compose-and-send-growth-email.mjs`  
**North star:** 1000+ verified paying customers (scoreboard, not a promise)  
**Mode:** **Acquisition-first** — every run must complete **one ship** (defined below)

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

**Growth-run lock:** Before collecting data or changing files, acquire the repo lock via `node scripts/growth/growth-run-lock.mjs acquire`. If a **non-stale** lock exists, stop without sending a second report. Never bypass or delete an active lock. Stale lock age is **120 minutes**. Release with `node scripts/growth/growth-run-lock.mjs release` only after the Admin email (or failure report) is sent.

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
Read and follow .cursor/skills/grow-paid-customers/SKILL.md and docs/growth/AUTOMATION.md definitions.

North star: 1000+ verified YouTubeBooster paying customers. Scoreboard, not a promise. Count product-attributed live Stripe only (docs/growth/STRIPE-PRODUCT-ALLOWLIST.md). Never attribute account-wide Stripe. Never invent audits, customers, or testimonials.

DEFINITIONS (mandatory)
- One ship = one reversible production treatment OR one approved, attributable acquisition action. Supporting tests, experiment-log updates, deployment verification, and the Admin report are required but do NOT count as additional ships.
- Experiment evaluation is a required decision. A decision alone does NOT count as today’s ship unless it includes a reversible treatment change. After recording keep-without-change, continue to the next applicable acquisition task.
- Qualified audit = successfully completed audit for a real, publicly accessible YouTube channel with ~1,000–100,000 subscribers and identifiable packaging, discoverability, or SEO improvement opportunities. Exclude test, owner, duplicate, failed, and incomplete audits.
- Report separately: successful product-attributed live payments; unique verified external paying customers; owner/test payments; refunds; verified net revenue; unattributed account-wide payments (excluded); experiment-attributed purchases only with evidence. Payments ≠ customers.
- Label every metric unit: event | session | user | audit record | checkout session | payment | customer. Never compute conversion rates across unrelated cohorts.
- Subject counts only experiments that are collecting (status active, not awaiting approval). EXP-004 awaiting approval is not collecting outreach data.
- Scoreboard windows must end on GA4 data-through (yesterday ET), never the incomplete report day.
- Decision must name: what shipped (or none), owning experiment, EXP-001 result if due, verified customers, verified net revenue.
- Change-deployed block is required: change, experiment, URL, primary metric, attribution, commit, Amplify, production verification.
- Sample paid report must use fictional or sanitized data and must not imply a real creator was audited without inspection.

ACQUISITION-FIRST: every run must complete one ship. These alone do not count: reviewing analytics, updating the log, waiting, sending Admin email, publishing another low-value SEO page, or an evaluation with no treatment change.

RUN SEQUENCE (strict)
1) Acquire growth-run lock: node scripts/growth/growth-run-lock.mjs acquire
   If a non-stale lock exists, or another YouTubeBooster agent is active / rate-limited: stop. Do not send a second report. Never bypass or delete an active lock. Stale = older than 120 minutes.
2) Production health (scripts/growth/check-production-health.mjs). Fix critical production health first (e.g. missing homepage title/description/canonical). After verification, continue to one acquisition ship unless the repair itself restores a broken acquisition path (then that repair may be today’s ship).
3) Collect GA4 7d/30d + product Stripe reconcile.
4) Evaluate experiments whose eval date is today or has passed. Record Keep, Iterate, Stop, Inconclusive, or Awaiting approval. Never use Continue. Never report a due experiment as a future evaluation. A decision alone is not the ship; if keep-without-change, continue.
5) Select and ship ONE action from the first unfinished item below.
6) Tests + frontend build if shipping; commit/push main only if valid.
7) Monitor Amplify; verify production.
8) Update docs/growth/EXPERIMENT-LOG.md with final commit/deployment.
9) Send ONE Admin email (success or failure — see below).
10) Release lock: node scripts/growth/growth-run-lock.mjs release

Today’s task order (first unfinished → one ship):
1) Production health repair when critical metadata/path is broken (counts as ship only if it restores a broken acquisition path; otherwise fix then continue).
2) Due experiment evals (required; not a ship unless a treatment change ships from the decision).
3) If homepage metadata is healthy and qualified audit volume is still too low, ship ONE acquisition action that is not a new SEO article: mini-audit share, sample report, or referral/share UTMs. Target active creators ~1k–100k subs with visible packaging/SEO problems who prefer a one-time audit. Do not add another SEO landing while EXP-002 or EXP-003 is still in-flight on Acquisition/SEO.
4) If qualified audits complete but checkout does not, ship ONE post-audit upgrade/pricing-clarity change. Do not start a second test on the same locked funnel stage (see EXPERIMENT-LOG locked-stage table).
5) Founder outreach: drafts and packages by default.

OUTREACH SEND GATES (all required — a script existing or being enabled is NEVER recipient approval)
Do not run daily-outreach-send.mjs unless ALL of the following are true and recorded in this run’s notes:
- Named recipient approval from Max
- Exact approved address (public contact page only; never invent emails)
- Exact approved subject and body version
- Approval ID and timestamp
- Unsubscribed / bounce / duplicate check passed
- Explicit sending-enabled configuration for this run
- Maximum two approved sends
EXP-004 lists are not send approval. Cap 2, skip unsubscribed, rotate recipients. Otherwise drafts only.

Hard bans: mass spam; fake comments/engagement/testimonials; claiming a channel was reviewed without inspecting public content; auto DMs/forms/comments; payments/prices/auth/secrets; guaranteed-growth claims.

Preserve active experiment treatments. Independent acquisition may ship in parallel only when it does not invalidate a locked stage (see docs/growth/EXPERIMENT-LOG.md locked-stage table).

DEPLOYMENT FAILURE
If build, deployment, or production verification fails: do not report the action as shipped. Revert when safe, record the failure, send one failure Admin report, release the lock, and stop.

ALWAYS email Admin once at the end (after final state):
node scripts/growth/compose-and-send-growth-email.mjs --notes "<one ship or failure; qualified audits; pricing views; checkout starts; payments vs customers vs revenue; outreach sent vs drafts; eval result; blockers>"

Admin notes must distinguish: prospect list vs drafts vs sent vs visits vs audits vs verified purchases. Label metric units.

Cost: cheapest capable model. Skip npm ci unless shipping.

Load secrets via scripts/growth/load-ssm-secrets-into-env.mjs. Never commit credentials. Stripe key rk_ only.
```

---

## SSM reference

See `docs/growth/SECRETS-SETUP.md` and `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`.
