# Bulk email discovery — dry-run report

Generated: 2026-09-21 (local unit + fixture dry-run; **no outreach sent**)

## Scope

- Campaign: COOK-001
- Mode: `dryRun=true` (no prospect email overwrites)
- Pipeline: YouTube metadata / official website → Contact / About / Work With Me / Partnerships / Media pages
- Confidence: HIGH auto-save (live only) · MEDIUM → REVIEW EMAIL · LOW ignored for primary email

## Fixture pipeline results (deterministic HTTP)

| Scenario | Outcome | Email | Confidence | Source |
|---|---|---|---|---|
| Website → `/contact` with `hello@` | found | hello@cooksite.test | HIGH | https://cooksite.test/contact |
| Homepage only `chefname@gmail.com` | review | chefname@gmail.com | MEDIUM | https://cooksite.test/ |
| Website with no visible email | not_found | — | — | website checked |
| `noreply@` / `example.com` | rejected | — | — | validation |

## Simulated bulk job (100 creators)

```
EMAIL DISCOVERY
100 / 100 processed

Found        31
Review        4
Not found    50
Failed        5
Skipped      10
HTTP fetches 240
```

Counters sum to 100. Job model + tick batching support 100+ creators without freezing the browser (client polls `/email-discovery/{id}/tick`).

## Validation checks covered by tests

- [x] Syntax / lowercase normalize (via PreferBusinessEmail + ExtractVisibleEmails)
- [x] Placeholder + noreply/privacy/legal rejection
- [x] YouTube→website→contact follow
- [x] HIGH → verified_public
- [x] MEDIUM → review_email
- [x] NOT FOUND handling
- [x] Existing verified email preservation path (`skipped_existing`)
- [x] Backoff / force retry fields on prospect (`ContactResearchNextAt`, `ContactResearchLastAt`)
- [x] Audit event names wired: EMAIL_DISCOVERY_STARTED, EMAIL_DISCOVERED, EMAIL_DISCOVERY_REVIEW_REQUIRED, EMAIL_DISCOVERY_FAILED, EMAIL_MANUALLY_ACCEPTED
- [x] Draft auto-prepare only when email was the last missing gate (`ShouldAutoPrepareDraft`) — does **not** send

## UI preview

Open: `docs/growth/outreach/preview-email-discovery-ui.html`

Shows:

- **Find Missing Emails (N)**
- Confirm dialog
- Persistent progress panel
- Email status filters + row checkboxes
- HIGH / REVIEW / NOT FOUND row presentations

## Next (after you approve)

1. Deploy Lambda with discovery endpoints
2. Run live `dryRun: true` against COOK-001 EMAIL REQUIRED cohort from Admin → Creators
3. Review MEDIUM hits, then start non-dry discovery
4. Outreach still requires existing Approve → Send path (unchanged)
