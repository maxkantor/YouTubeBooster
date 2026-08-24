# YouTubeBooster AI — LOCKED growth strategy (7 days)

**Status:** LOCKED  
**Lock window:** 2026-08-24 → 2026-08-30 (America/New_York)  
**End-of-lock review:** 2026-08-31  
**Machine state:** `docs/growth/strategy-lock.json`

This document is the **authoritative operating system** for weekday growth runs during the lock. Do **not** rewrite, replace, or redesign the overall strategy until the review date.

Full specification origin: founder FINAL AUTONOMOUS GROWTH SYSTEM prompt (2026-08-24). Agents must follow that intent via this file + `strategy-lock.json` + `.cursor/skills/grow-paid-customers/SKILL.md`.

---

## North star

1. **Verified external paying customers** (product-attributed Stripe only)
2. **Verified external revenue**

Supporting: qualified sessions → audit start → audit complete → signup → pricing → checkout → paid → entitled.

Technical execution (commits, reports, SES accepts, “health OK”) is **not** growth.

---

## Locked acquisition plan (do not churn)

| Channel | Experiment | Rule |
|---------|------------|------|
| COOK-001 founder outreach | EXP-004 | Keep weekday sends; discover **new** 1k–100k cooking creators; official-site mailto only; cooldown/suppression |
| SEO main (form → /demo) | EXP-002 | Keep; evaluate by path; scheduled eval 2026-08-25 |
| `/youtube-channel-analyzer` | EXP-003 | Nested; measure separately; do not double-count paid into EXP-002 |
| Share / sample report | EXP-004 surfaces | Keep operational; track share → audit |
| Post-purchase activation | EXP-001 | Keep treatment; **Inconclusive** until real payments exist — do not redesign with zero paid users |

**Audience lock:** cooking YouTube creators ~1k–100k. Do not expand niches during this window unless the cooking pipeline is technically exhausted.

**SES ramp:** 10 → 20 → 30 only after configured healthy days + sample (do not rewrite ramp policy daily). Prefer quality over hitting quota.

---

## Daily loop (weekdays)

1. Read GA4, CRM, Stripe, SES/outreach history, experiments, acquisition memory  
2. Discover → verify contact → qualify → cooldown → send (within limit)  
3. Continue SEO within existing strategy (no mass new page farms)  
4. Production health check  
5. **Code/product change ONLY** if a lock exception applies (bug, broken audit/checkout/attribution/signup/entitlement, scheduled eval threshold, or accumulated evidence that cannot wait)  
6. Reconcile prior campaigns  
7. Update acquisition memory + experiment log  
8. Send Admin report with **reconciled** send ledger  

Valid outcome: **NO PRODUCT CHANGE — collecting data.**

---

## Authoritative metrics (source of truth)

| Metric | Source |
|--------|--------|
| Sessions / UTM / landing / GA4 events | GA4 |
| Audits / users / entitlement | Admin CRM |
| Payments / customers / refunds / revenue | Product Stripe allowlist |
| Sends / delivery / bounce / complaint | SES / mail log |

**Outreach ledger (must reconcile in every report):**

- **Today SES accepted** = authoritative “emails sent this run”  
- **Lifetime CRM SENT** = cumulative campaign sent count (label as lifetime)  
- Never show TODAY Sent = 0 while notes claim a send, unless scopes are labeled differently and both numbers match the ledger  

Do not compute sequential conversion rates from unrelated raw GA4 totals until same-cohort audit IDs exist.

---

## Allowed during lock (execution variants)

Recipient, personalization, copy variant, destination (`/demo`, `/share`, `/sample-report`, analyzer, SEO page), UTM, micro-segment.

## Forbidden during lock

New overall strategy, new niche expansion for its own sake, daily “ship something” CRO, redesigning EXP-001 with zero payments, treating Cursor automation rate limits as product failure.

---

## Product/code change exceptions

Only when: confirmed production bug; audit tracking wrong; Stripe attribution wrong; signup/audit/checkout/entitlement broken; critical path broken; scheduled experiment eval date/threshold; or accumulated evidence of a major funnel issue that cannot wait.

---

## End-of-lock review (2026-08-31)

Evaluate outreach + SEO + funnel with **7 complete days** of data. Identify **one** primary proven bottleneck. Make **one** primary strategic change if evidence supports it. Then start another stable measurement window.

---

## Cursor automation rate limit

Shared Cursor global run caps can block scheduled Automations. Record the failure; run manually when needed; **do not** change YouTubeBooster strategy because of it.
