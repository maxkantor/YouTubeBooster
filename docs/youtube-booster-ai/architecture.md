# YouTube Booster AI Architecture

## Product Goal
`YouTube Booster AI` is a hosted premium creator-growth product with:

- a public marketing site
- a free demo analysis flow
- a one-time Stripe purchase flow
- a post-purchase onboarding wizard
- a premium user dashboard
- an internal admin CRM
- support workflows via SES
- dynamic OG image generation for marketing and shared reports

The hosted product sells access to the software, not source code and not recurring subscriptions.

## Recommended Deployment Topology

### Frontend
- React + TypeScript
- Hosted in AWS Amplify
- Public routes:
  - `/`
  - `/demo`
  - `/pricing`
  - `/report/:shareId`
  - `/checkout/success`
  - `/checkout/cancel`
- Authenticated routes:
  - `/app`
  - `/app/onboarding`
  - `/app/report/:reportId`
  - `/app/settings`
- Admin routes:
  - `/admin/login`
  - `/admin`
  - `/admin/users`
  - `/admin/purchases`
  - `/admin/support`
  - `/admin/analytics`

### Backend
- .NET 8 Lambda functions behind API Gateway
- ASP.NET Core minimal APIs packaged for Lambda
- Route groups:
  - `public`
  - `checkout`
  - `webhooks`
  - `auth`
  - `user`
  - `admin`
  - `support`
  - `og`

### Data
- DynamoDB tables for users, purchases, demos, reports, support, activity, settings, and admin notes

### Messaging
- SES for contact form delivery, support ticket notifications, and admin replies

### Secrets and Config
- AWS Systems Manager Parameter Store
- Secrets never exposed to the client
- Public frontend only receives safe config values such as API base URL and Stripe publishable key

### Observability
- CloudWatch Logs for API execution
- CloudWatch Metrics for:
  - demo starts
  - demo completions
  - paywall views
  - checkout starts
  - purchases
  - onboarding completions
  - report generations
  - support submissions

## System Boundaries

### Public Funnel
1. Visitor lands on marketing page.
2. Visitor enters a channel URL or handle.
3. Public demo endpoint runs lightweight analysis.
4. Frontend renders a premium-looking preview report.
5. Premium recommendations and exports are gated.
6. User enters checkout with Stripe Checkout.

### Purchase + Access
1. Stripe Checkout session is created by backend.
2. Stripe webhook confirms payment success.
3. Backend creates or updates the user record.
4. User receives a magic-link sign-in email or a local testing link fallback when SES is not configured.
5. User completes onboarding, including entering any buyer-owned Google/YouTube app settings required for advanced access.
6. User unlocks dashboard access.

### Premium Usage
1. User runs full reports and accesses saved report history.
2. User can revisit dashboards and reports later.
3. Admin CRM tracks usage, support, purchases, and drop-off points.

## Product Surfaces

### Marketing Site
- premium hero
- social proof placeholders
- example report preview
- sticky CTA
- pricing section
- FAQ
- requirements block
- contact form

### Demo Flow
- accepts channel URL or handle
- returns:
  - health score
  - engagement snapshot
  - top content sample
  - a few findings
  - a few AI recommendations
- gated premium cards:
  - detailed growth plan
  - content calendar ideas
  - title rewrites
  - traffic leak diagnostics
  - downloadable PDF report

### User Dashboard
- Overview
- Videos
- Suggestions
- SEO Optimizer
- Traffic Tools
- Continuous Runner
- saved analysis history
- export actions
- user-owned integrations settings for Google/YouTube access

### Admin CRM
- summary metrics
- user management
- purchase management
- support inbox
- funnel analytics
- manual access controls
- notes and audit trail

## Auth Strategy

### User Auth
- passwordless email auth preferred
- identity tied to purchase email
- current implementation uses HTTP-only cookie sessions after magic-link verification
- optional “claim your purchase” flow if checkout happened before account creation

### Admin Auth
- dedicated `/admin/login`
- admin credentials or auth secret references stored in SSM Parameter Store
- current implementation uses server-created HTTP-only admin session cookies
- protected admin routes and APIs

### Integration Ownership
- app-wide/admin-owned secrets live in SSM Parameter Store
- buyer-provided Google or YouTube app settings are collected during onboarding
- buyer-provided settings must be stored per user in app data, not in global SSM paths
- per-user integration records should be encrypted before persistence in DynamoDB

## Viral / Sharing Strategy
- public example reports
- dynamic OG images for report shares
- shareable snippets from demo results
- built-in social card previews
- CTA in shared report pages that sends cold traffic back into the free demo

## Migration Principle
Preserve the business logic concepts from the current Python app:
- channel analysis
- SEO heuristics
- content suggestions
- traffic opportunities

Replace the old runtime and delivery stack:
- Flask -> .NET Lambda APIs
- server-rendered dashboard -> React app
- file-based state -> DynamoDB
- local secrets -> SSM Parameter Store
- ad hoc support -> CRM + SES workflows
