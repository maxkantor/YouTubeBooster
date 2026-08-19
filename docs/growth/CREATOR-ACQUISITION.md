# Creator Acquisition Center

**Status:** Implemented. COOK-001 weekday sending is **enabled**. Daily volume ramps **10 → 20 → 30** qualified emails on weekdays when SES health is acceptable. A draft is not distribution.

Admin UI: https://youtubeboosterai.com/admin/marketing/creator-acquisition

## Volume, ramp, and safety

Configuration (env, then Lambda `CreatorAcquisition:*`, then SSM `/youtubebooster/outreach/*`):

| Key | Default | Meaning |
|-----|---------|---------|
| `YTB_OUTREACH_DAILY_LIMIT` | `10` | Used only when ramp is disabled |
| `YTB_OUTREACH_MAX_LIMIT` | `30` | Hard cap; never auto-exceed |
| `YTB_OUTREACH_RAMP_ENABLED` | `true` | Stage from persisted `ACQRAMP#COOK-001` |
| `YTB_OUTREACH_COOLDOWN_DAYS` | `30` | Do not re-email the same prospect |

Ramp stages: **10 / 20 / 30** per Eastern weekday. Advance after **3 sending days** at the current stage **only if** at least **30** prior sends exist and:

- Bounce rate < 3%
- Complaint rate < 0.1%
- Unsubscribe rate < 2%

If the sample is too small, stay at the current stage and record `sample_too_small`. Bounce/complaint above threshold **stops** the day's send. Never ramp when health is unknown or unhealthy.

## Qualification (COOK-001 cooking segment)

Every send requires: public YouTube channel, cooking niche, upload in last 60 days, verified public business email (official site, not guessed/form-only), observation from public videos, no unsubscribe/hard bounce/spam-trap, no existing paying customer, not in cooldown. Additional niches can reuse the same gates with a different `PrimaryNiche` / campaign id.

## Copy and attribution

Variants **A** (audit-first) and **B** (opportunity-first), sticky 50/50 by prospect id. CTA uses `/api/public/acq/go/{token}` with `utm_source=founder_outreach`, `utm_medium=email`, `utm_campaign=cook_001`, `utm_content={A|B}`, `utm_term={safe prospect id}`, `utm_id={run date}`, `exp=004`, `seg=cooking`.

A customer counts only as a **verified YouTubeBooster-attributed** Stripe payment (see `STRIPE-PRODUCT-ALLOWLIST.md`). Audit completions, entitlements, and unattributed Stripe are not campaign customers.

## Experiment evaluation (EXP-004)

Remain **COLLECTING** until **100 qualified sends** or **14 calendar days** from 2026-08-13, unless deliverability forces STOP. Then KEEP / ITERATE / STOP / INCONCLUSIVE from click, audit, signup, checkout, verified customers, revenue, and delivery health.

## What shipped

- Prospect data model, scoring, dedup, public-contact rules
- Admin CRM views and bounded batch approval (max 30)
- Personalized public mini-review drafts (A/B)
- SES MIME builder (UTF-8, List-Unsubscribe, no open pixel, no PII tags)
- Weekday sender with ramp + health gates
- Cohort run ids (`COOK-001-yyyy-MM-dd`) persisted as `ACQRUN#…`
- Inbound reply ingest (sanitized preview → CRM thread)
- Sanitized CSVs with **no email addresses**

## Sending gates (all required)

1. SSM `/youtubebooster/outreach/marketing-sending-enabled` = `true`
2. Config `CreatorAcquisition:MarketingSendingEnabled` = `true` (Lambda `CreatorAcquisition__MarketingSendingEnabled`)
3. Campaign flag sending enabled and complaint pause off (`ACQFLAGS#COOK-001`)
4. SES identity **hello@youtubeboosterai.com** verified (`ses/outreach-from-email` or domain identity)
5. Reply-To `hello@youtubeboosterai.com`
6. Custom MAIL FROM `bounce.youtubeboosterai.com` (optional; do not block sends if domain identity is valid)
7. SSM `/youtubebooster/business/postal-address` set
8. Unsubscribe HMAC configured
9. Standing campaign approval while sending is enabled (named batches still supported)
10. Daily cap from ramp stage (default **10**, max **30**), weekdays only (America/New_York)
11. No guessed emails, cooldown 30 days, no suppression, no existing customers

Operator (does not backfill historical campaigns):

```bash
node scripts/growth/enable-cook-001-sending.mjs
# Future weekday cron / scheduled growth run uses the new daily limit.
# Do not run a one-off backfill send.
```

## Preferred sender (after SES is ready)

```
From: Max from YouTubeBooster <hello@youtubeboosterai.com>
Reply-To: hello@youtubeboosterai.com
```

Do not use Max’s personal mailbox in campaign headers.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/crm/acquisition/summary` | Admin |
| GET | `/api/admin/crm/acquisition/prospects` | Admin; emails visible only here |
| POST | `/api/admin/crm/acquisition/inspect` | Public demo inspect; no send |
| POST | `/api/admin/crm/acquisition/prospects/{id}/draft` | No send |
| POST | `/api/admin/crm/acquisition/preview` | Always `sent: false` |
| POST | `/api/admin/crm/acquisition/approvals` | Bounded batch |
| GET | `/api/public/acq/go/{token}` | Opaque click → share URL |
| GET/POST | `/api/public/acq/unsubscribe` | One-click |
| POST | `/api/public/acq/weekday-send` | Cron key; still no-op if sending disabled |
| POST | `/api/public/acq/inbound` | Inbound key; sanitized preview only |
| POST | `/api/public/acq/ses-events` | Bounce/complaint; no PII in tags |

## Infra notes

1. SES identity `hello@youtubeboosterai.com` is covered by the verified domain. Custom MAIL FROM is optional.
2. SES configuration set `yb-creator-acquisition` exists; add SNS/event destinations later for DELIVERED/bounce/complaint CRM updates.
3. Postal address is in SSM. Unsubscribe HMAC is required.
4. Conservative operator is the weekday cron; do not backfill historical lists. `run-cook-001-weekday.mjs` default `--max` is 10 (cap 30).
5. Increase volume only via the 10→20→30 ramp while bounce/complaint/unsubscribe rates stay healthy.

Do **not** run `daily-outreach-send.mjs` against the old roster.

## Discovery → CRM sync

Sanitized CSVs are git-safe summaries. **Production CRM** is populated separately:

```bash
# Probe public demo + upsert into Dynamo via Admin inspect (never sends email)
node scripts/growth/sync-creator-prospects-to-crm.mjs
```

Requires SSM `/youtubebooster/admin/email` and `/youtubebooster/admin/password` for Admin session. Uses the existing public demo API (`POST /api/public/demo`) as the discovery provider — no guessed emails, no CAPTCHA bypass.

Provider: **YouTubeBooster public demo** (YouTube Data API key in SSM when configured; otherwise quota placeholders are skipped).

- `docs/growth/prospects/COOK-001-QUALIFIED.csv` — cooking, no emails
- `docs/growth/prospects/OTHER-001-QUALIFIED.csv` — other niches, no emails

Launch cooking first. Expand OTHER-001 only after COOK-001 produces evidence.

## Lambda

Backend routes are in the API. Upload `backend/youtubebooster-api.zip` after this change so Admin inspect/approve work in production. Frontend-only Amplify deploy is not sufficient for the new `/api/admin/crm/acquisition/*` routes.
