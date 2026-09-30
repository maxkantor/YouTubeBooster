# Inbound email (hello@youtubeboosterai.com)

## Case determination (2026-09-30)

Live Route53 zone `Z014959831X1D2E7R4FQ` for `youtubeboosterai.com`:

- **No prior MX** (no WorkMail / Google Workspace / Microsoft 365 mailbox)
- SES domain identity verified for **sending** only
- Account already had active SES receipt rule set `INBOUND_MAIL` (other products)

**CASE C** → configure AWS SES Email Receiving (first-time inbound).

## MX change

| | |
|---|---|
| Before | *(none — replies to hello@ were undeliverable)* |
| After | `10 inbound-smtp.us-east-1.amazonaws.com` |
| Replaces existing mailbox? | **No** |

## Path

```
Internet
→ MX (SES inbound, us-east-1)
→ receipt rule `youtubebooster-hello-inbound` (recipient hello@youtubeboosterai.com)
→ S3 `youtubebooster-inbound-mail-718522948657` prefix `hello/`
→ Lambda `youtubebooster-inbound-mail`
→ POST /api/public/acq/inbound (X-Outreach-Inbound-Key)
→ RecordInboundAsync → prospect REPLIED + Contacts ticket thread
→ Acquisition Inbox
```

## Ops

- Ensure key: `node scripts/growth/ensure-inbound-key.mjs`
- Wire / repair: `node scripts/growth/wire-inbound-email.mjs` (dry-run) then `--apply`
- Do **not** replace MX if dry-run reports CASE A
