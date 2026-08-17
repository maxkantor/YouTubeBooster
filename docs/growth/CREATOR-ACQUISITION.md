# Creator Acquisition Center

**Status:** Implemented in product. **Marketing sending is disabled.**  
Verified external paying customers: **0**. Immediate target: customer #1.

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
2. Config `CreatorAcquisition:MarketingSendingEnabled` = `true`
3. Campaign flag sending enabled and complaint pause off
4. SES identity **hello@youtubeboosterai.com** verified (`ses/outreach-from-email`)
5. Reply-To `hello@youtubeboosterai.com`
6. Custom MAIL FROM `bounce.youtubeboosterai.com` (configure in SES; not auto-created)
7. SSM `/youtubebooster/business/postal-address` set
8. Unsubscribe HMAC configured
9. Max named-batch approval, content hash unchanged
10. Max **5** emails per weekday (America/New_York), no weekend sends
11. No guessed emails, no prior send, no suppression

A campaign being enabled is **not** recipient approval. Preview never sends.

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

## Infra still required before first five sends

1. Verify SES identity `hello@youtubeboosterai.com` (and MAIL FROM subdomain).
2. SES inbound → encrypted S3 → Lambda posting `/api/public/acq/inbound`.
3. Outreach configuration set `yb-creator-acquisition` (delivery/bounce/complaint).
4. Put postal address in SSM.
5. Put Max’s test recipient in `outreach/test-recipient`.
6. Approve a COOK-001 batch of ≤5 English cooking prospects with **verified public business emails**.
7. Then set marketing sending enabled.

Do **not** run `daily-outreach-send.mjs` against the old roster.

## Lists

- `docs/growth/prospects/COOK-001-QUALIFIED.csv` — cooking, no emails
- `docs/growth/prospects/OTHER-001-QUALIFIED.csv` — other niches, no emails

Launch cooking first. Expand OTHER-001 only after COOK-001 produces evidence.

## Lambda

Backend routes are in the API. Upload `backend/youtubebooster-api.zip` after this change so Admin inspect/approve work in production. Frontend-only Amplify deploy is not sufficient for the new `/api/admin/crm/acquisition/*` routes.
