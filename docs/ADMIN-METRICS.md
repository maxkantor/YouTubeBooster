# Admin CRM metrics reference

## Data sources

| Metric | Source table | Filter |
|--------|--------------|--------|
| Total users | `ybai-users` (`sk=PROFILE`) | Count of profile rows |
| Active entitled (flag) | `ybai-users` | `purchased=true` and `userStatus=active` |
| Active live entitled | `ybai-users` entitlements | Active entitlements where `source != test_payment` |
| Demo users (unique) | `ybai-activity` `demo_completed` | Unique actors in selected range |
| Demo events (raw) | `ybai-activity` `demo_completed` | Raw event count in range |
| Paid live orders | `ybai-purchases` / `PAYMENT#` | `status=completed`, `amount>0`, `mode=live` |
| Revenue live | `PAYMENT#` | Sum of live paid amounts |
| Paid test orders | `PAYMENT#` | `status=completed`, `amount>0`, `mode!=live` |
| Revenue test | `PAYMENT#` | Sum of test paid amounts |
| Demo → paid % | Demos + payments | `live paid orders / total demos` |
| Funnel steps | `ybai-activity` | Unique actors per step (raw events shown separately) |
| GA4 visitors | Google Analytics | **Not stored in CRM** |

## Stripe live vs test

- Source of truth: `session.Livemode` / `event.Livemode` from Stripe.
- Stored on payment rows as `mode` = `live` | `test`.
- Missing/unknown `mode` is treated as **test** in revenue metrics until backfilled.
- Test payments do **not** grant production entitlements (`source=live_payment`).
- Webhook idempotency: `STRIPE_EVENT#{eventId}` rows prevent duplicate processing.

## GA4 vs CRM

GA4 counts anonymous visitors, sessions, and devices. CRM users are registered accounts (Cognito + DynamoDB profiles). They will not match.

## Email (Admin CRM)

| Address | SSM | Role |
|---------|-----|------|
| **From** `contact@youtubeboosterai.com` | `/youtubebooster/ses/from-email` | Verified SES sender. Recipients see this as From. |
| **Admin CRM inbox** | `/youtubebooster/admin/email` (also `ses/admin-email`) | Login identity + Reply-To + BCC of every CRM send. Recipient replies land here. |

Outbound Support/outreach mail is stored on the ticket thread (`ybai-support` MSG rows, `direction=outbound`). Continue replies from **Support → ticket → Send reply**. If a recipient replies to the Admin inbox, paste it with **Log recipient reply** (that also emails the Admin inbox).

Do not send outreach from a personal mailbox if you want the CRM thread to stay complete.

`POST /api/admin/crm/migrations/backfill-payment-livemode` (admin session required) re-reads Stripe Checkout Sessions and updates `mode` on existing `PAYMENT#` rows. Records are never deleted.
