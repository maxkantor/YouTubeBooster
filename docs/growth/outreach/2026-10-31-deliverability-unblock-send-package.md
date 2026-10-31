# COOK-001 — deliverability pause unblock + named batch (max 2) — 2026-10-31

**Status:** BLOCKING owner approval — no SES sends until pause is cleared and this batch is explicitly approved.

## Why sending is paused

| Metric | Value | Policy |
|--------|-------|--------|
| Lifetime SES accepted (CRM) | 56–58 | — |
| Hard bounces (CRM) | 2 | Both tied to **@itdoesnttastelikechicken** (`hello@itdoesnttastelikechicken.com`) — initial send + follow-up on 2026-10-24 |
| Bounce rate | **≥3.0%** (2/58) | `OutreachPolicy.BounceStop` = 3% once `MinSendsForRate` (30) met |
| Automatic sending | **OFF** | `DELIVERABILITY SAFETY PAUSE` / `health_stop:bounce_rate` |
| SES accepted **this run** (2026-10-31) | **0** | Weekend + safety pause |

## Owner actions required (in order)

1. **Review bounces** in Admin CRM → confirm both bounces are the same suppressed address (no list hygiene issue beyond follow-up to a bouncing mailbox).
2. **Clear deliverability safety pause** (Admin acquisition settings / Lambda campaign state) so COOK-001 automatic sending can resume when rates are acceptable.
3. **Approve exactly two named recipients** below (new Approval ID + timestamp). Do **not** re-mail @thedefineddish, @lovelemonsfood, or @itdoesnttastelikechicken.

**Approval ID (placeholder until Max signs):** `APR-20261031-PENDING`  
**Approver:** Max  
**Campaign:** COOK-001 / EXP-004  
**Max sends after unblock:** 2 (weekday automation cap still applies)

## Proposed recipients (never contacted; drafts in CRM)

Addresses are **not** stored in git — confirm in Admin CRM before send.

| CRM ID | Handle | Score | Subject (CRM draft) | Public contact source |
|--------|--------|-------|---------------------|------------------------|
| COOK-001-06455456 | @cookingfromspain | 80 | Quick idea for Cooking from Spain | https://www.youtube.com/@cookingfromspain |
| COOK-001-22a2f45a | @theaspiringhomecook | 100 | Quick idea for The Aspiring Home Cook | https://theaspiringhomecook.com/2016/12/kulkuls.html |

**Excluded (do not send):** @cheaplazyvegan (score 64 — below COOK-001 qualification floor 70). @thedefineddish / @lovelemonsfood (already contacted).

## Send gates checklist (agent)

- [ ] Named recipient approval from Max (this file + Approval ID)
- [ ] Exact address verified on public contact page only (CRM)
- [ ] Exact subject/body version = CRM personalized draft for each ID
- [ ] Approval ID + timestamp recorded
- [ ] Unsubscribed / bounce / duplicate check passed
- [ ] Explicit sending-enabled for the run (pause cleared)
- [ ] Maximum two sends

## After approval

Run (weekday, pause cleared):

```bash
node scripts/growth/run-cook-001-weekday.mjs --max 2
```

Report **SES accepted this run** separately from **lifetime CRM SENT** (58).
