# Creator Acquisition Center

**Status:** Implemented. COOK-001 weekday sending is **enabled** under send gates (verified public business email, named approval, postal footer, unsubscribe, suppression, max 5/weekday). A draft is not distribution.

Admin UI: https://youtubeboosterai.com/admin/marketing/creator-acquisition

## What shipped

- Prospect data model, scoring, dedup, public-contact rules
- Admin CRM views and bounded batch approval (max 25)
- Personalized public mini-review drafts
- SES MIME builder (UTF-8, List-Unsubscribe, no open pixel, no PII tags)
- Weekday sender endpoint that **sends zero** until every gate passes
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
9. Named-batch approval, content hash unchanged
10. Max **5** emails per weekday (America/New_York), no weekend sends; first batches should be **2**
11. No guessed emails, no prior send, no suppression

Conservative operator:

```bash
node scripts/growth/enable-cook-001-sending.mjs
node scripts/growth/run-cook-001-weekday.mjs --max 2
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
4. Conservative operator: `node scripts/growth/run-cook-001-weekday.mjs --max 2` (official mailto only; form-only skipped).
5. Increase volume only while bounce/complaint rates stay healthy.

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
