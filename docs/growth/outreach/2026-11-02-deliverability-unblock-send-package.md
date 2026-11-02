# COOK-001 deliverability unblock — owner approval package

**Date (ET):** 2026-11-02  
**Campaign:** COOK-001  
**Pause reason:** `bounce_rate` (CRM: 2 bounces / 58 SES-accepted = 3.45%, threshold ≥3% with n≥30)  
**Lifetime CRM:** 58 sent · 23 delivered · 2 bounced · 1 click · 0 verified customers  

Sending is **held** (`automaticSending: false`, `DELIVERABILITY SAFETY PAUSE`). Weekday-send returned `health_stop:bounce_rate` / `DELIVERABILITY_PAUSE`. **Do not send** until Max clears the pause and approves the named batch below.

---

## Required owner actions (blocking)

1. **Deliverability review:** Confirm bounce sources (both bounces tied to `@itdoesnttastelikechicken` in prior runs). Decide: suppress handle permanently, accept risk, or wait for delivery stats to age out of the 58-send window.
2. **Re-enable COOK-001 automatic sending** (Admin → Acquisition) **only after** pause rationale is accepted.
3. **Named-recipient approval (max 2)** for the exact drafts below — public mailto only; not EXP-004 list approval alone.

**Proposed approval ID:** `APR-20261102-cook001-unblock` (mint on approve in Admin CRM)

---

## Approved send batch (exact — after pause clear)

| # | Prospect ID | Handle | Public email (contact page) | Subject (locked draft) |
|---|-------------|--------|----------------------------|-------------------------|
| 1 | `COOK-001-06455456` | `@cookingfromspain` | `hello@cookingfromspain.com` | Quick idea for Cooking from Spain |
| 2 | `COOK-001-22a2f45a` | `@theaspiringhomecook` | `trishavaz@gmail.com` | Quick idea for The Aspiring Home Cook |

**Do not send:** `@thedefineddish`, `@lovelemonsfood`, `@itdoesnttastelikechicken`, `@cheaplazyvegan` (cooldown/suppression/bounce history).

**Body version:** CRM `textPreview` for each prospect ID (personalized audit link via `/api/public/acq/go/…`). Re-draft in Admin if content hash changed since 2026-11-02.

**Send gates checklist:** named approval ✓ (this doc) · public address ✓ · subject/body ✓ (CRM draft) · approval ID (pending mint) · unsub/bounce/dup check at send time · explicit sending enabled after pause clear · max 2.

---

## Post-send measurement (7d)

- CRM: delivery, click, COOK-001 cohort `audit_started`, checkout_started, verified product-attributed Stripe customer (default 0).
- GA4 sitewide (label units): sessions, audit_started events, pricing_viewed, checkout_started — do not merge CRM clicks with GA4 sessions without disclosure.
