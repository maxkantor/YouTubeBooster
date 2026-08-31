# YouTubeBooster AI — LOCKED growth strategy (7 days)

**Status:** LOCKED  
**Lock window:** 2026-08-31 → 2026-09-06 (America/New_York)  
**End-of-lock review:** 2026-09-07  
**Machine state:** `docs/growth/strategy-lock.json`

This document is the **authoritative operating system** for weekday growth runs during the lock. Do **not** rewrite, replace, or redesign the overall strategy until the review date.

---

## North star

1. **Verified external paying customers** (product-attributed Stripe only)
2. **Verified external revenue**

Immediate milestone: the **next newly attributed external customer**. 1000+ is the scoreboard, not a same-week promise.

Technical execution (commits, reports, SES accepts, “health OK”) is **not** growth.

---

## Lock-review finding (2026-08-31)

Prior window (2026-08-24 → 2026-08-30): COOK-001 distributed; **0 clicks**; SEO landing sessions **0/7d**; **12 pricing views** and **4 checkout starts** with **0 paid**.

**One primary bottleneck:** checkout started → paid. Signup-before-pay was extra friction on the only step that was moving.

**One primary change this lock:** restore **guest Stripe checkout** (email → Checkout). Sign-up remains optional after payment (EXP-001). COOK-001 cooking 1k–100k continues. No new SEO CRO. No niche expansion. No price change.

---

## Locked acquisition plan (do not churn)

| Channel | Experiment | Rule |
|---------|------------|------|
| COOK-001 founder outreach | EXP-004 | Keep weekday sends; discover **new** 1k–100k cooking creators; official-site mailto only; cooldown/suppression |
| SEO main (form → /demo) | EXP-002 | Keep; do not add a second Acquisition/SEO treatment |
| `/youtube-channel-analyzer` | EXP-003 | Nested; measure separately |
| Share / sample report | EXP-004 surfaces | Keep operational |
| Post-purchase activation | EXP-001 | Keep; guest checkout is the intended paid entry |
| Checkout conversion | Lock change | Guest email → Stripe; do not re-impose signup-before-pay this window |

**Audience lock:** cooking YouTube creators ~1k–100k.

**SES ramp:** 10 → 20 → 30 only after configured healthy days + sample. Prefer quality over hitting quota.

---

## Daily loop (weekdays)

1. Read GA4, CRM, Stripe, SES/outreach history, experiments, acquisition memory  
2. Discover → verify contact → qualify → cooldown → send (within limit)  
3. Continue SEO within existing strategy (no mass new page farms)  
4. Production health check  
5. **Code/product change ONLY** if a lock exception applies  
6. Reconcile prior campaigns  
7. Update acquisition memory + experiment log  
8. Send Admin report with **reconciled** send ledger  

Valid outcome: **NO PRODUCT CHANGE — collecting data.**

---

## Authoritative metrics

| Metric | Source |
|--------|--------|
| Sessions / UTM / landing / GA4 events | GA4 |
| Audits / users / entitlement | Admin CRM |
| Payments / customers / refunds / revenue | Product Stripe allowlist |
| Sends / delivery / bounce / complaint | SES / mail log |

**Outreach ledger:** Today SES accepted vs lifetime CRM SENT — never contradict Agent Notes.

---

## Product/code change exceptions

Only when: confirmed production bug; audit tracking wrong; Stripe attribution wrong; signup/audit/checkout/entitlement broken; critical path broken; scheduled experiment eval; or accumulated evidence of a major funnel issue that cannot wait.

---

## End-of-lock review (2026-09-07)

Evaluate: COOK-001 clicks, guest checkout starts, completed Stripe sessions, verified attributed payments. Identify **one** primary bottleneck. Make **one** primary change if evidence supports it.
