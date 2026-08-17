# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Name:** YouTubeBooster daily paid growth  
**Schedule:** Monday–Friday **8:00 AM America/New_York**  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Full Admin email after every run → `scripts/growth/compose-and-send-growth-email.mjs`  
**North star:** 1000+ verified paying customers (scoreboard, not a promise)  
**Immediate milestone:** the next newly attributed external customer  
**Mode:** **Customer acquisition override** — a run succeeds only with approved external distribution or removal of a proven funnel blocker

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
Read and follow .cursor/skills/grow-paid-customers/SKILL.md and docs/growth/AUTOMATION.md.

CUSTOMER ACQUISITION OVERRIDE
North star: 1000+ verified YouTubeBooster paying customers (scoreboard, not a promise). Immediate milestone: the next newly attributed external customer. Count product-attributed live Stripe only (docs/growth/STRIPE-PRODUCT-ALLOWLIST.md). Never attribute account-wide Stripe. Never invent audits, customers, or testimonials.

Accurate reporting is required but is NOT the primary output. These do not count as customer acquisition: analytics review, report formatting, documentation, internal pages, experiment logs, health checks, draft packages, unexposed production changes. A production asset is not distributed merely because it is deployed.

A run is successful ONLY when it either (a) executes an approved external distribution action, or (b) removes a proven blocker preventing qualified traffic from entering or completing the funnel.

Every successful run must complete:
1) One measurable acquisition improvement WHEN NECESSARY (do not launch another experiment merely because this run needs a ship).
2) One real, policy-compliant distribution action that places the product in front of a relevant external audience.

Allowed distribution (exactly one):
- Explicitly approved recipient + exact approved message
- Owned social account with explicit posting authorization
- Approved email list with valid consent and unsubscribe
- Legitimate partner/community channel that permits promotion
- Paid advertising within an explicitly approved budget
- Product-triggered referral/share initiated by a real user

Never: spam; invent contacts; automate comments/DMs; evade community rules; claim visits/customers/revenue without verified attribution.

Until the first newly attributed external customer:
- At most one experiment per funnel stage
- Prefer qualified distribution over additional CRO
- Measure visits → activation → checkout → verified payment
- Report new customers acquired by THIS RUN separately from customers merely observed in the date window
- If distribution requires Max approval and none exists: prepare the EXACT action and make the Admin report LEAD with a blocking approval request. Do not substitute analytics or formatting.

CUSTOMER BUCKETS (always separate)
Existing customers | customers observed during the window | customers causally attributed to a named experiment (evidence or Unknown) | new customers acquired by this run (default 0)

DEFINITIONS
- Qualified audit = successfully completed audit for a real public YouTube channel ~1k–100k subs with identifiable packaging/SEO opportunities. Exclude test, owner, duplicate, failed, incomplete.
- Payments ≠ customers. Report payments, unique verified external customers, owner/test, refunds, verified net revenue, unattributed account-wide (excluded) separately.
- Label every metric unit: event | session | user | audit record | checkout session | payment | customer. Never convert across unrelated cohorts.
- Scoreboard windows end on GA4 data-through (yesterday ET).
- Experiment decisions: Keep | Iterate | Stop | Inconclusive | Awaiting approval. Never Continue. Never report a due eval as future.
- EXP-004 lists / a script existing is NEVER send approval.

OUTREACH SEND GATES (all required to send)
Named recipient approval; exact approved address (public contact page only); exact subject and body version; approval ID + timestamp; unsubscribed/bounce/duplicate check; explicit sending-enabled for this run; max two approved sends.

RUN SEQUENCE
1) Acquire lock: node scripts/growth/growth-run-lock.mjs acquire
   Non-stale lock or another YouTubeBooster agent active / rate-limited: stop. Never bypass or delete an active lock. Stale = 120 minutes.
2) Production health. Fix a proven funnel blocker if one exists (that can be the successful run). Otherwise continue.
3) Collect GA4 7d/30d + product Stripe.
4) Evaluate due experiments. Record the decision. Then distribute — do not stop at the eval.
5) Execute one allowed distribution action OR prepare the exact next send/post and set blocking owner approval.
6) Acquisition improvement only if necessary and it does not add a second experiment on a locked stage (docs/growth/EXPERIMENT-LOG.md).
7) Tests + frontend build if production code changes; commit/push main only if valid.
8) Monitor Amplify when frontend shipped; verify production.
9) Update experiment log with distribution evidence (or blocking approval).
10) Send ONE Admin email AFTER final state. Lead with the acquisition scoreboard.
11) Release lock: node scripts/growth/growth-run-lock.mjs release

ADMIN EMAIL MUST LEAD WITH
Distribution executed | Audience/channel | Attributed visits | Activations | Checkout starts | Newly attributed external customers (this run) | Verified revenue | Required owner approval

Pass --distribution-file JSON with those fields. If blocking approval, subject must say so. Do not lead with experiment counts or “change deployed.”

node scripts/growth/compose-and-send-growth-email.mjs --notes "<distribution executed or blocking approval; exact action prepared; new customers this run; visits; activations; checkout starts; verified revenue>"

DEPLOYMENT FAILURE: do not report distribution as executed. Revert when safe, record failure, one failure Admin report, release lock, stop.

Cost: cheapest capable model. Skip npm ci unless production UI/API ships.
Load secrets via scripts/growth/load-ssm-secrets-into-env.mjs. Never commit credentials. Stripe key rk_ only.
```

---

## SSM reference

See `docs/growth/SECRETS-SETUP.md` and `docs/growth/STRIPE-PRODUCT-ALLOWLIST.md`.
