# Sanitized prospect lists

These CSVs are safe for git. They **must not** contain email addresses.

Contact status values:

- `verified_public` — business email stored only in Admin CRM / DynamoDB
- `Contact route available — automated email unavailable` — official form; do not submit
- `source_recorded_unverified` — public page recorded; email not copied into git
- `none` — no eligible public business contact yet

Approval status is `none` until Max approves a batch in Admin → Marketing → Creator Acquisition.

Regenerate:

```bash
node scripts/growth/discover-creator-prospects.mjs
```
