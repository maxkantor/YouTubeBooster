# Acquisition approve/send fix report (2026-09-21)

## Symptom
Creators showing **READY FOR APPROVAL** (e.g. The Recipe Critic) looked broken: clicking the green status did nothing; users could not find Approve / Send.

## Root causes
1. **Layout:** Huge email preview rendered *above* Approve buttons. The green **READY FOR APPROVAL** badge looked like the CTA; real buttons were below the fold.
2. **Silent failures:** Approve API errors were written to the parent page behind the open drawer, so failed approvals looked like no-ops.
3. **Gate mismatch:** Backend `ApproveBatchAsync` rejects uploads older than 60 days; UI previously still labeled those rows READY FOR APPROVAL.

## Aggressive fix
| Area | Change |
|------|--------|
| Drawer | Sticky **Approve & Send** / **Approve (queue only)** above the fold; email preview collapsed behind “click to expand” |
| Errors | `drawerError` / `drawerNote` shown inside the drawer |
| Creators table | Inline **Approve & Send** + **Approve** on READY rows; **Send Now** on APPROVED |
| Readiness | UI `isReadyForApproval` aligned with backend (incl. 60-day upload gate) |
| Tests | `acqVisibleActions` matrix + workflow tests — **23/23 pass** |

## How to approve and send (after Amplify deploy)
1. Filter **Ready for approval** (or find the green row).
2. On the row: **Approve & Send** (immediate SES) or **Approve** (queue only).
3. Or open the drawer — buttons are at the top, not under the preview.
4. Queued sends also appear under **Approvals** → Send.

## Test coverage added
- READY exposes `approve_and_send` + `approve`
- Stale upload (>60d) is NOT ready
- REVIEW_EMAIL Accept/Reject/Source
- EMAIL_REQUIRED / NOT_FOUND / NEEDS_REVIEW / APPROVED row strategies
- Existing workflow suite still green

Shipped via frontend push (Amplify). No Lambda change required for this UX/gate alignment.
