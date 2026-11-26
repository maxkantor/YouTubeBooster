# COOK-001 named send approval — 2026-11-26

**Proposed approval ID:** `APR-20261126-cook001-two`  
**Timestamp:** awaiting Max approval (package prepared 2026-11-26 UTC)  
**Approver:** Max (required before any SES send)  
**Campaign:** `COOK-001` (cooking creators ~1k–100k, official-site `mailto` only)  
**Sender (intended):** YouTubeBooster CRM SES (`contact@youtubeboosterai.com` per current config)  
**UTM:** `utm_source=founder_outreach&utm_medium=dm&utm_campaign=COOK-001`  
**Max sends this batch:** 2  

## Preconditions (must be true at send time)

1. SSM `/youtubebooster/business/postal-address` populated (CAN-SPAM). Cloud agent run 2026-11-26 could not read this parameter — confirm on production send host.
2. Outreach cron key + Admin CRM session available on send host (cloud agent lacked `/youtubebooster/admin/*` and cron key).
3. Unsubscribed / bounce / duplicate / cooldown checks pass in CRM for each handle.
4. Explicit **sending-enabled** for this approval ID recorded in CRM.
5. All seven founder outreach send gates in `grow-paid-customers` skill satisfied.

## Recipients (no addresses in git)

| ID | Handle | Est. subs | Official contact source | Mailto verification (2026-11-26) |
|----|--------|-----------|-------------------------|--------------------------------|
| R01 | @thecafesucrefarine | ~1.4k | https://thecafesucrefarine.com/contact-us/ | **Confirmed** — public `mailto` on official contact page (HTTP 200). |
| R02 | @bowlofdelicious | ~978 | https://www.bowlofdelicious.com/about/ | **Confirmed** — public `mailto` on official About page (contact page is form-only). |

**Do not send** to any address not returned from the live page at send time. Store addresses only in CRM at send.

## Approved subjects (exact)

| ID | Subject |
|----|---------|
| R01 | `Public note on @thecafesucrefarine packaging` |
| R02 | `Public note on @bowlofdelicious descriptions` |

## Personalized body (version `2026-11-26-v1` — do not alter without new approval)

**R01 — @thecafesucrefarine**

Hi — I looked at @thecafesucrefarine publicly. Recent uploads show moderate engagement (~2.1% on the last window we could see) with room to sharpen title payoff and description depth for search. I’d test one payoff-first title plus a tighter description on the next café-style recipe before changing format. Public-data mini audit (no login):  
`https://youtubeboosterai.com/share?channel=%40thecafesucrefarine&utm_source=founder_outreach&utm_medium=dm&utm_campaign=COOK-001&utm_content=R01`

**R02 — @bowlofdelicious**

Hi — I checked @bowlofdelicious publicly. Health score from public data is ~70/100 — engagement is moderate and several recent descriptions look thin for discoverability. I’d keep the recipe the same but test a clearer payoff line in the description on the next bowl-style upload. Mini audit:  
`https://youtubeboosterai.com/share?channel=%40bowlofdelicious&utm_source=founder_outreach&utm_medium=dm&utm_campaign=COOK-001&utm_content=R02`

## Owner action to unblock

Reply **approve `APR-20261126-cook001-two`** (or edit subjects/body version above) so the next growth run may execute SES for R01+R02 only. EXP-004 list presence is **not** send approval.