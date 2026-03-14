# Deployment Notes

## Preferred Path
Use Terraform under `infra/terraform/` as the primary infrastructure path for the new product.

The old Elastic Beanstalk and SAM files remain only as migration-era artifacts.

## Parameter Store Namespace

All hosted product secrets and operational settings should live under:

`/youtubebooster/...`

Core parameters:

- `/youtubebooster/ses/from-email`
- `/youtubebooster/ses/admin-email`
- `/youtubebooster/stripe/secret-key`
- `/youtubebooster/stripe/webhook-secret`
- `/youtubebooster/stripe/publishable-key`
- `/youtubebooster/stripe/price-lookup-key`
- `/youtubebooster/stripe/openai-api-key`
- `/youtubebooster/admin/email`
- `/youtubebooster/admin/password`
- `/youtubebooster/youtube/api-key`
- `/youtubebooster/admin/google/credentials-json`
- `/youtubebooster/admin/google/client-id`
- `/youtubebooster/admin/google/client-secret`
- `/youtubebooster/admin/google/project-id`
- `/youtubebooster/admin/google/auth-uri`
- `/youtubebooster/admin/google/token-uri`
- `/youtubebooster/admin/google/redirect-uri`
- `/youtubebooster/pricing/one-time-price`
- `/youtubebooster/pricing/currency`
- `/youtubebooster/features/enable-public-demo`
- `/youtubebooster/features/demo-rate-limit-per-hour`

## Deployment Order

1. Apply Terraform to create DynamoDB tables and placeholder SSM values.
2. Replace placeholder SSM values with real Stripe, SES, admin, and app-owned YouTube secrets.
3. Package and deploy the .NET Lambda backend.
4. Create or enable the Amplify frontend app.
5. Set `VITE_API_BASE_URL` to the deployed API endpoint.
6. Validate:
   - `/health`
   - `/api/public/demo`
   - `/api/checkout/session`
   - `/api/admin/login`

## Current App Behavior

The backend already consumes these Parameter Store paths for:

- YouTube public demo analysis
- admin-owned Google OAuth `credentials.json` equivalent for app-managed flows
- Stripe checkout secret
- Stripe webhook secret
- Stripe publishable key lookup
- SES sender and admin inbox
- admin credential verification

If values are missing, the app falls back safely for some flows:

- demo uses fallback preview copy when YouTube API key is missing
- checkout uses mock success behavior when Stripe secret is missing
- magic-link auth returns a direct testing link when SES email delivery is not configured
- support notifications no-op if SES email delivery is not configured

## Admin Google Credentials in SSM

The hosted stack should no longer rely on a file-based `credentials.json` for admin-owned Google app settings.

Preferred storage:

- store the full Google OAuth client payload as a secure string at `/youtubebooster/admin/google/credentials-json`

Optional granular fallback keys:

- `/youtubebooster/admin/google/client-id`
- `/youtubebooster/admin/google/client-secret`
- `/youtubebooster/admin/google/project-id`
- `/youtubebooster/admin/google/auth-uri`
- `/youtubebooster/admin/google/token-uri`
- `/youtubebooster/admin/google/redirect-uri`

This allows the backend to reconstruct the equivalent of `credentials.json` without relying on local files.

Buyer-provided Google or YouTube app settings should not be stored in SSM. Those belong to the purchasing user and should be collected in onboarding, stored per user in app data, and encrypted before persistence.

## Security Follow-Up

The current app now uses HTTP-only cookie sessions for purchased users and admins.

Next production hardening steps:

- replace raw admin password comparison with hash verification
- tighten cookie policy and expiry based on production domain/HTTPS behavior
- add CSRF/session expiry controls
- add API authorization middleware for admin-only routes
- add rate limiting for magic-link requests and verification attempts
