# COOK-001 unblock send package — 2026-11-25

**Approval ID (requested):** `APR-20261125-cook001-unblock`  
**Requested at:** `2026-11-25T12:05:00Z` (Cursor daily growth automation)  
**Approver:** Max  
**Campaign:** `COOK-001` (strategy LOCKED)  
**Max sends this batch:** 2  
**Sending mode:** Named-recipient approval → Admin CRM approval batch → automatic weekday SES (marketingSendingEnabled already **true**; lifetime CRM **SENT 60**; **readyToSend 0** today because **approved 0** and deliverability advisory `health_advisory:unsubscribe_rate`).

## Why blocked

- Weekday-send **dry run** (2026-11-25): **SES accepted 0**; `stopReason=CONTACT_DISCOVERY_NO_PROGRESS`; pipeline **readyToSend 0** / **approved 0**.
- Two highest-fit drafts are **draft_ready** but lack **named-recipient approval** (EXP-004 lists ≠ approval).
- Do **not** send @thedefineddish / @lovelemonsfood (form-only / prior sends).

## Recipients (exact CRM drafts — approve these prospect IDs only)

### 1) The Aspiring Home Cook

| Field | Value |
|-------|--------|
| Prospect ID | `COOK-001-22a2f45a` |
| Handle | `@theaspiringhomecook` |
| Subscriber band | `1k_100k` (qualified) |
| Score | 100 |
| Contact status | `review_email` — confirm `trishavaz@gmail.com` is the channel business contact on https://theaspiringhomecook.com/ before approve |
| Public business email (CRM) | `trishavaz@gmail.com` |
| Subject | `Quick idea for The Aspiring Home Cook` |
| Template | `brand-v1` / `personalized_audit_v1` / subject variant A |

**Body (exact):**

```
Hi,

I was looking at The Aspiring Home Cook and noticed 16 of your last 8 public videos have very short descriptions for search.

I ran your channel through YouTubeBoosterAI and found a few other opportunities worth checking.

I put the results here:

View your free audit:
https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com/api/public/acq/go/cd55b562419f2c9533ad139dc8e5fbca

No signup required.

YouTubeBooster AI
```

### 2) Cooking from Spain

| Field | Value |
|-------|--------|
| Prospect ID | `COOK-001-06455456` |
| Handle | `@cookingfromspain` |
| Subscriber band | `100k_350k` (above strict COOK band — approve only if intentional stretch) |
| Score | 80 |
| Contact status | `verified_public` |
| Public business email (CRM) | `hello@cookingfromspain.com` (listed on channel / discovery) |
| Subject | `Quick idea for Cooking from Spain` |
| Template | `brand-v1` / `personalized_audit_v1` / subject variant A |

**Body (exact):**

```
Hi,

I was looking at Cooking from Spain and noticed 5 of your last 8 public videos have very short descriptions for search.

YouTubeBoosterAI can run a free public audit of your channel packaging (titles, descriptions, and search clarity).

Open your free audit here — no signup required:

View your free YouTube audit:
https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com/api/public/acq/go/14c07bffe084c122bf6148ac91cb3ba6

No signup required.

YouTubeBooster AI
```

## Owner steps after approval

1. Reply **approve `APR-20261125-cook001-unblock`** (or approve in Admin → Acquisition with prospect IDs above, max 2).
2. Next weekday growth run will SES-send; report **SES accepted this run** separately from lifetime **SENT 60**.