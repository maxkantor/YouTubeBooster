# COOK-001 unblock send package — 2026-11-24

**Status:** Awaiting Max approval (blocking)  
**Approval ID (proposed):** `APR-20261124-cook001-unblock`  
**Timestamp:** 2026-11-24T12:15:00Z (automation run)  
**Campaign:** COOK-001 (cooking, 1k–100k)  
**Max sends if approved:** 2 (named recipients only)

## Why sending stopped (verified CRM, not invented)

| Metric | Value |
|--------|-------|
| Lifetime CRM SES accepted | 60 |
| Delivered (CRM) | 25 |
| Bounced (CRM) | 2 |
| Unsubscribed identities (CRM `outreachStatus`) | 4 |
| Unsubscribe rate (4 / 60 distinct contacted) | **6.7%** (≥ `UnsubscribeStop` 2%) |
| Weekday-send this run | **0** (`health_advisory:unsubscribe_rate`; `readyToSend` 0) |
| Newly attributed customers this run | **0** |

Sending is **not** hard-paused on bounce (2 bounces &lt; 3% stop), but **unsubscribe_rate** is above policy. Automatic mode continues discovery only; **no SES accepted** until inventory is approved and health is acknowledged.

## Do NOT send (prior deliverability / policy)

- `@thedefineddish`
- `@lovelemonsfood`
- `@itdoesnttastelikechicken`

## Proposed named recipients (max 2)

Owner must confirm **exact public business mailto** on the official contact/source page before any send. Addresses stay in CRM only — not in git.

| Priority | Prospect ID | Handle | Score | Contact source | Draft subject (CRM) |
|----------|-------------|--------|-------|----------------|---------------------|
| 1 | `COOK-001-06455456` | @cookingfromspain | 80 | Public channel / site per CRM `contactSourceUrl` | Personalization in CRM draft |
| 2 | `COOK-001-22a2f45a` | @theaspiringhomecook | 100 | https://theaspiringhomecook.com/ (verify mailto on live contact route) | Quick idea for The Aspiring Home Cook |

Alternate if #2 has no verified mailto at approval time:

| Priority | Prospect ID | Handle | Score | Notes |
|----------|-------------|--------|-------|-------|
| Alt | `COOK-001-39614992` | @hetalshomefoodrecipes | 83 | `verified_public` contact status in CRM |

## Exact owner actions required

1. **Deliverability:** Acknowledge unsubscribe advisory (4/60) — confirm whether to hold COOK-001 at 0/day until rate improves or approve **max 2** careful sends with current copy.
2. **Recipient approval:** Reply with approval ID `APR-20261124-cook001-unblock`, the two handles above (or substitutes from Alt), and confirmation you copied each address from the public contact page only.
3. **Approve drafts** in Admin CRM for those prospect IDs, then re-run weekday send (or authorize automation to execute on the next cron).

## Send gates checklist (all required)

- [ ] Named recipient approval from Max  
- [ ] Exact approved address (public contact page only)  
- [ ] Exact approved subject and body version (CRM personalized draft)  
- [ ] Approval ID + timestamp recorded  
- [ ] Unsubscribed / bounce / duplicate check passed  
- [ ] `marketingSendingEnabled` true (currently **true**)  
- [ ] ≤ 2 approved sends in this batch  