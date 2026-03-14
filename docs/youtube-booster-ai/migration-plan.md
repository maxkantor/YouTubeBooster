# Migration Plan

## Objective
Move the current Python-based YouTube dashboard into a premium hosted product:

- React frontend on AWS Amplify
- .NET Lambda APIs behind API Gateway
- DynamoDB for product and CRM data
- SES for support and customer workflows
- SSM Parameter Store for secrets and config
- Stripe Checkout for one-time purchases

## What To Preserve
- channel analysis heuristics
- SEO scoring logic
- content suggestion patterns
- traffic opportunity framing
- product concept of overview, videos, suggestions, SEO, traffic tools, and runner

## What To Replace
- Flask routes
- server-rendered HTML dashboard
- monolithic browser script
- local file-based secrets and OAuth token storage
- local issue logs
- Elastic Beanstalk/Render-centric app structure

## Phase 1: Premium Shell + Funnel
Goal: launch a credible commercial product shell quickly.

Deliver:
- React marketing site
- free demo analysis flow
- paywall
- Stripe Checkout
- basic purchased user dashboard
- admin login and CRM summary scaffold

Implementation notes:
- React frontend can temporarily call a demo-analysis wrapper endpoint that still mirrors current Python logic or ports its heuristics as simple .NET services.
- Focus on conversion, onboarding, and purchase verification first.

## Phase 2: Core Logic Port to .NET
Goal: standardize analytics logic in .NET services.

Port:
- `api_client.py` behavior into YouTube data service abstractions
- `analyzer.py` into channel growth scoring service
- `seo_optimizer.py` into SEO audit and rewrite services
- `suggestions.py` into recommendation generators

Implementation notes:
- keep public DTOs stable
- write fixture-based tests for key scoring rules
- move from single-channel local assumptions to multi-tenant request handling

## Phase 3: CRM, Support, and Analytics
Goal: operational visibility and retention systems.

Deliver:
- admin CRM
- support inbox and SES replies
- event tracking dashboards
- saved reports and analysis history
- access overrides, notes, and funnel analysis

## Phase 4: Viral Growth + Report Sharing
Goal: make the product shareable and self-amplifying.

Deliver:
- dynamic OG image generation
- public shareable report pages
- downloadable branded reports
- example report library
- social proof and case study content loops

## Existing Logic Mapping

### Current Python Capability -> New Service
- channel lookup -> `IYouTubeChannelResolver`
- public video listing -> `IYouTubeVideoService`
- analytics scoring -> `IChannelAnalysisService`
- SEO audit -> `ISeoAuditService`
- content suggestions -> `IRecommendationService`
- traffic tools -> `ITrafficInsightsService`
- runner logging -> `IRunnerService` or dashboard activity stream

## Migration Risks
- Google OAuth flow for premium advanced features may require a separate multi-user auth/connect flow
- historic heuristics are lightweight and may need stronger AI prompting or ranking for premium quality
- free demo abuse needs rate limiting and caching
- report sharing requires careful access control to avoid leaking private paid data

## Practical Delivery Order
1. scaffold the new architecture
2. launch landing page + demo + paywall
3. wire Stripe purchase verification
4. add passwordless access
5. add saved reports and CRM
6. finish .NET port of all analysis logic
7. refine premium visuals and sharing loops

## External Credential TODOs
- Stripe secret key
- Stripe webhook secret
- SES sender identity
- SSM parameter path strategy
- YouTube API credentials strategy for hosted use
- optional AI provider key for premium recommendations
