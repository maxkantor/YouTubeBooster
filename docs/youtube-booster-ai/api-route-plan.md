# API Route Plan

## Public Routes
- `POST /api/public/demo`
  - runs free demo analysis
  - returns preview findings, health score, gated module list, paywall copy
- `POST /api/public/support/contact`
  - marketing site contact form
  - stores ticket in DynamoDB
  - sends SES notification to admin inbox

## Checkout + Purchase
- `POST /api/checkout/session`
  - creates Stripe Checkout session for one-time payment
  - accepts email, channel input, price key, success URL, cancel URL
- `POST /api/webhooks/stripe`
  - verifies Stripe signature
  - records purchase
  - marks user as purchased
  - emits activity events

## Auth
- `POST /api/auth/magic-link`
  - request passwordless sign-in
- `POST /api/auth/magic-link/verify`
  - exchanges token for an HTTP-only user session
- `GET /api/auth/session`
  - returns current purchased-user session state
- `POST /api/auth/logout`
  - destroys the user session cookie

## User Dashboard
- `GET /api/user/dashboard/overview`
- `GET /api/user/onboarding`
- `POST /api/user/onboarding`
- `POST /api/user/onboarding/complete`
- `GET /api/user/videos`
- `GET /api/user/suggestions`
- `GET /api/user/seo/{videoId}`
- `POST /api/user/traffic-tools`
- `GET /api/user/reports`
- `GET /api/user/reports/{reportId}`
- `POST /api/user/reports/{reportId}/share`
- `GET /api/user/integrations/youtube/settings`
- `POST /api/user/integrations/youtube/settings`
  - collects buyer-provided Google/YouTube app settings during onboarding
  - stores settings per user, not as shared app-wide secrets
- `POST /api/user/support`
- `POST /api/user/events`

## Admin CRM
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/admin/logout`
- `GET /api/admin/dashboard/summary`
- `GET /api/admin/users`
- `GET /api/admin/users/{userId}`
- `POST /api/admin/users/{userId}/notes`
- `POST /api/admin/users/{userId}/grant-access`
- `POST /api/admin/users/{userId}/disable`
- `GET /api/admin/purchases`
- `GET /api/admin/demos`
- `GET /api/admin/funnel`
- `GET /api/admin/support/tickets`
- `GET /api/admin/support/tickets/{ticketId}`
- `POST /api/admin/support/tickets/{ticketId}/reply`

## OG / Share Routes
- `POST /api/og/render`
  - render or generate OG image metadata for marketing or report pages
- `GET /report/{shareId}`
  - public shareable report page
  - limited public content with CTA back into demo or purchase flow

## Non-Functional Requirements
- rate limit public demo and contact routes
- require authenticated user context for `/api/user/*`
- require protected admin session for `/api/admin/*`
- ensure webhook routes bypass frontend auth but validate signatures
