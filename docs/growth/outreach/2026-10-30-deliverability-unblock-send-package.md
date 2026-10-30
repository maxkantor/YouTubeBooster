# COOK-001 — deliverability unblock + next send package (2026-10-30)

**Status:** BLOCKING owner approval — not send approval.

## Why sends are held

- CRM **DELIVERABILITY SAFETY PAUSE** (`health_stop:bounce_rate`).
- Lifetime COOK-001: **58** SES-accepted sends · **2** bounced · **23** delivered · **1** tracked click · **0** paid.
- Bounce rate **2/58 ≈ 3.45%** (at/above **3%** stop threshold).
- Weekday-send dry-run **2026-10-30:** `attempted=0`, `stopReason=DELIVERABILITY_PAUSE`.
- **SES accepted this run: 0** (distribution not executed).

## Required owner actions (in order)

1. **Review bounces** in Admin → Marketing → Creator Acquisition (identify hard-bounce addresses; suppress bad mailto if needed). Known bounce example in CRM: `@itdoesnttastelikechicken` / `hello@itdoesnttastelikechicken.com`.
2. **Clear deliverability pause** and re-enable automatic COOK-001 sending (or explicit named-batch approval after pause clears).
3. **Named batch approval (max 2)** for never-contacted cooking prospects with **verified public mailto** (probed 2026-10-30):

| Prospect ID | Handle | Verified address (public contact page) | Contact source |
|-------------|--------|----------------------------------------|----------------|
| COOK-001-5c797243 | @cheaplazyvegan | hello@thecheaplazyvegan.com | Official site contact |
| COOK-001-06455456 | @cookingfromspain | hello@cookingfromspain.com | Official site contact |

4. After approval: run weekday COOK-001 send (automation or `node scripts/growth/run-cook-001-weekday.mjs --max 2`) — system will **Prepare Draft** personalized copy before SES.

## Explicitly NOT approved this run

- Re-mail **@thedefineddish** / **@lovelemonsfood** (already contacted 2026-10-09 and 2026-10-14; CRM marks duplicate).
- Any send while pause is active.

## Send gates checklist (for Max when approving)

- [ ] Named recipient approval (handles + addresses above)
- [ ] Exact subject/body after Prepare Draft in Admin preview
- [ ] New approval ID + timestamp recorded
- [ ] Unsub/bounce/duplicate check passed in CRM
- [ ] Marketing sending enabled + pause cleared
- [ ] Max **2** sends
