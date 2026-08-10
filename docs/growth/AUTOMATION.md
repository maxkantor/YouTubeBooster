# Cursor Automation — YouTubeBooster Daily Paid Customer Growth

**Name:** YouTubeBooster daily paid growth  
**Schedule:** Monday–Friday **8:00 AM America/New_York** (prefer weekdays to cut cost; daily is OK)  
**Repo:** `maxkantor/YouTubeBooster` · branch `main`  
**Notify:** Full Admin email after every run → `scripts/growth/compose-and-send-growth-email.mjs`  
**Cost:** Prefer cheapest capable model; measure+email most days; ship only when justified

---

## Cost controls (do in Cursor UI)

1. **Model:** Use the cheapest capable model (e.g. Composer / Auto — not Grok High unless needed).
2. **Schedule:** Prefer Mon–Fri 8:00 AM Eastern over every day.
3. **Spend limit:** [cursor.com/dashboard/billing](https://cursor.com/dashboard/billing) → enable on-demand if needed → set a **low hard spend limit** (e.g. $10–$20/month for this automation’s room). Cloud Agents need a little headroom under the limit to start.
4. **Instructions:** Keep the cost paragraph in the prompt below (measure+stop unless shipping).

---

## Finish / edit in Automations

1. Open **Automations** (left sidebar robot icon) → **YouTubeBooster daily paid growth**
2. Paste/replace **Agent instructions** with the prompt below
3. Set model to a cheaper option
4. Confirm schedule shows **8:00 AM EDT/EST** (not 4:00 AM)
5. Secrets stay in the Automation Secrets UI only — **never paste secret values into this markdown file**
6. Leave **Active** On

### Automation secret *names* (values from SSM / IAM — not in git)

| Secret name | Source |
|-------------|--------|
| `GA4_PROPERTY_ID` | SSM `/youtubebooster/growth/ga4-property-id` |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | SSM `/youtubebooster/growth/google-analytics-credentials-json` |
| `STRIPE_RESTRICTED_READ_KEY` | SSM `/youtubebooster/growth/stripe-restricted-read-key` |
| `AWS_ACCESS_KEY_ID` | IAM (cloud agent) |
| `AWS_SECRET_ACCESS_KEY` | IAM (cloud agent) |
| `AWS_REGION` | `us-east-1` |

Copy from SSM to clipboard when needed:

```powershell
aws ssm get-parameter --name /youtubebooster/growth/ga4-property-id --region us-east-1 --query Parameter.Value --output text | Set-Clipboard
aws ssm get-parameter --name /youtubebooster/growth/google-analytics-credentials-json --with-decryption --region us-east-1 --query Parameter.Value --output text | Set-Clipboard
aws ssm get-parameter --name /youtubebooster/growth/stripe-restricted-read-key --with-decryption --region us-east-1 --query Parameter.Value --output text | Set-Clipboard
```

---

## Prompt (paste into Automations)

```
Read and follow .cursor/skills/grow-paid-customers/SKILL.md.

Cost control: Prefer the cheapest capable model. On most runs: collect metrics, health-check, update experiment log notes if needed, email Admin, and stop. Only implement/deploy when there is a clear leak, no same-stage conflict, and the change is tiny. Skip npm ci / full builds unless shipping.

Review current GA4, Stripe, application funnel, experiment history (docs/growth/EXPERIMENT-LOG.md), production health, and recent repository changes.

Never run two simultaneous conversion experiments on the same funnel stage. While an experiment is gathering data, you may implement independent acquisition, SEO, reliability, tracking, or funnel-repair improvements that do not invalidate the active experiment.

If traffic is too low to evaluate conversion, prioritize qualified customer acquisition—high-intent SEO pages, creator partnerships, referral mechanics, lifecycle email, and tracked cross-promotion—before additional homepage optimization.

When shipping: select one small reversible change most likely to increase verified paid customers. Implement it, validate it, deploy directly to main only when all checks pass, verify production, and record the result in docs/growth/EXPERIMENT-LOG.md.

Always end the run by sending a FULL Admin email (not a one-line smoke note) via:
node scripts/growth/compose-and-send-growth-email.mjs --notes "<what was reviewed; what shipped or why nothing shipped; blockers; next eval date>"
That script includes GA4/Stripe snapshot windows, production health, and active experiments automatically. Do this even on skipped or no-op days.

Load secrets from Automation env / SSM via scripts/growth/load-ssm-secrets-into-env.mjs (GA4_PROPERTY_ID, GOOGLE_ANALYTICS_CREDENTIALS_JSON, STRIPE_RESTRICTED_READ_KEY). Never commit credentials. Stripe key must remain read-only (rk_…). AWS credentials are required for SSM load and Admin email.
```

---

## SSM reference (source of truth — no values in git)

| Env / purpose | SSM path |
|---------------|----------|
| `GA4_PROPERTY_ID` | `/youtubebooster/growth/ga4-property-id` |
| `GOOGLE_ANALYTICS_CREDENTIALS_JSON` | `/youtubebooster/growth/google-analytics-credentials-json` |
| `STRIPE_RESTRICTED_READ_KEY` | `/youtubebooster/growth/stripe-restricted-read-key` |
| Admin inbox | `/youtubebooster/admin/email` |
| SES from | `/youtubebooster/ses/from-email` |

See `docs/growth/SECRETS-SETUP.md`.
