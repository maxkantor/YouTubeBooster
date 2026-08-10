# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Schedule:** Monday–Friday 8:00 AM America/New_York  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Email Admin after every run (`scripts/growth/notify-admin-email.mjs` → SSM `/youtubebooster/admin/email`)

## Prompt (paste into Automations)

```
Read and follow .cursor/skills/grow-paid-customers/SKILL.md.

Review current GA4, Stripe, application funnel, experiment history (docs/growth/EXPERIMENT-LOG.md), production health, and recent repository changes.

Never run two simultaneous conversion experiments on the same funnel stage. While an experiment is gathering data, you may implement independent acquisition, SEO, reliability, tracking, or funnel-repair improvements that do not invalidate the active experiment.

If traffic is too low to evaluate conversion, prioritize qualified customer acquisition—high-intent SEO pages, creator partnerships, referral mechanics, lifecycle email, and tracked cross-promotion—before additional homepage optimization.

Select one small reversible change most likely to increase verified paid customers. Implement it, validate it, deploy directly to main only when all checks pass, verify production, and record the result in docs/growth/EXPERIMENT-LOG.md.

Always end the run by emailing Admin a plain-text summary via:
node scripts/growth/notify-admin-email.mjs --subject "[YouTubeBoosterAI] Growth run — <date>" --body-file <summary.txt>
Include what was reviewed, what shipped (or why nothing shipped), metrics/blockers, and next eval date. Do this even on skipped or no-op days.

Load secrets via scripts/growth/load-ssm-secrets-into-env.mjs or Automation secrets (GA4_PROPERTY_ID, GOOGLE_ANALYTICS_CREDENTIALS_JSON, STRIPE_RESTRICTED_READ_KEY). Never commit credentials. Stripe key must remain read-only (rk_…). AWS credentials (or SSM access) are also required for the Admin email script.
```

## Secrets

**Already in AWS SSM** (preferred source for collectors + Admin email):

| Env | SSM path |
|-----|----------|
| `GA4_PROPERTY_ID` | `/youtubebooster/growth/ga4-property-id` |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | `/youtubebooster/growth/google-analytics-credentials-json` |
| `STRIPE_RESTRICTED_READ_KEY` | `/youtubebooster/growth/stripe-restricted-read-key` |
| Admin inbox | `/youtubebooster/admin/email` |
| SES from | `/youtubebooster/ses/from-email` |

Mirror the three growth names as Cursor Automation secrets if the cloud agent cannot call AWS SSM. See `docs/growth/SECRETS-SETUP.md`.
