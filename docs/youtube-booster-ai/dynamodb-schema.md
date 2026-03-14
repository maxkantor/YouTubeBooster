# DynamoDB Schema Plan

## Overview
Use focused tables that optimize for product analytics, CRM workflows, and report retrieval.

## 1. `ybai-users`
Primary record for user identity and entitlement.

- PK: `USER#{userId}`
- SK: `PROFILE`

Attributes:
- `email`
- `displayName`
- `accessStatus` (`demo`, `purchased`, `disabled`, `manual`)
- `purchaseStatus`
- `primaryChannelId`
- `primaryChannelHandle`
- `createdAt`
- `lastActiveAt`
- `lastLoginAt`
- `onboardingCompletedAt`
- `magicLinkEnabled`
- `marketingConsent`

Related items under the same user partition:
- `SK = INTEGRATION#YOUTUBE`
- attributes:
  - `channelUrl`
  - `credentialsJson` or granular Google app fields
  - `updatedAt`
  - `storageModel`

Suggested GSIs:
- `GSI1PK = EMAIL#{email}`
- `GSI1SK = PROFILE`
- `GSI2PK = ACCESS_STATUS#{accessStatus}`
- `GSI2SK = lastActiveAt`

## 2. `ybai-purchases`
Stripe-linked purchase history for one-time payments.

- PK: `PURCHASE#{purchaseId}`
- SK: `DETAILS`

Attributes:
- `userId`
- `email`
- `stripeSessionId`
- `stripePaymentIntentId`
- `stripeCustomerId`
- `amount`
- `currency`
- `priceVersion`
- `couponCode`
- `status`
- `purchasedAt`
- `refundedAt`
- `notes`

Suggested GSIs:
- `GSI1PK = USER#{userId}`
- `GSI1SK = purchasedAt`
- `GSI2PK = EMAIL#{email}`
- `GSI2SK = purchasedAt`
- `GSI3PK = STRIPE_SESSION#{stripeSessionId}`
- `GSI3SK = DETAILS`

## 3. `ybai-demo-analyses`
Public and pre-purchase demo funnel records.

- PK: `DEMO#{demoId}`
- SK: `DETAILS`

Attributes:
- `email` optional
- `channelInput`
- `channelId`
- `channelTitle`
- `healthScore`
- `previewFindings`
- `gatedInsightsCount`
- `status`
- `startedAt`
- `completedAt`
- `paywallViewedAt`
- `checkoutStartedAt`
- `convertedPurchaseId`
- `ipHash`
- `userAgentHash`

Suggested GSIs:
- `GSI1PK = CHANNEL#{channelId}`
- `GSI1SK = completedAt`
- `GSI2PK = STATUS#{status}`
- `GSI2SK = startedAt`

## 4. `ybai-reports`
Saved premium reports and report-share pages.

- PK: `REPORT#{reportId}`
- SK: `DETAILS`

Attributes:
- `userId`
- `channelId`
- `channelTitle`
- `reportType`
- `visibility` (`private`, `shared`)
- `shareId`
- `healthScore`
- `summary`
- `sections`
- `createdAt`
- `updatedAt`
- `lastViewedAt`
- `exportStatus`

Suggested GSIs:
- `GSI1PK = USER#{userId}`
- `GSI1SK = createdAt`
- `GSI2PK = SHARE#{shareId}`
- `GSI2SK = DETAILS`
- `GSI3PK = CHANNEL#{channelId}`
- `GSI3SK = createdAt`

## 5. `ybai-support`
Support tickets and message threads.

- PK: `TICKET#{ticketId}`
- SK:
  - `DETAILS`
  - `MESSAGE#{timestamp}`
  - `NOTE#{timestamp}`

Attributes on details item:
- `userId` optional
- `email`
- `name`
- `subject`
- `message`
- `productArea`
- `channelUrl`
- `status`
- `priority`
- `createdAt`
- `updatedAt`
- `assignedAdmin`

Suggested GSIs:
- `GSI1PK = STATUS#{status}`
- `GSI1SK = updatedAt`
- `GSI2PK = EMAIL#{email}`
- `GSI2SK = createdAt`

## 6. `ybai-activity`
Append-only event stream for analytics and admin visibility.

- PK: `ACTIVITY#{eventDate}`
- SK: `EVENT#{timestamp}#{eventId}`

Attributes:
- `userId`
- `sessionId`
- `eventName`
- `page`
- `channelId`
- `reportId`
- `metadata`
- `createdAt`

Suggested GSIs:
- `GSI1PK = USER#{userId}`
- `GSI1SK = createdAt`
- `GSI2PK = EVENT#{eventName}`
- `GSI2SK = createdAt`

## 7. `ybai-admin`
Admin notes, access overrides, and operational records.

- PK: `ADMIN#{entityType}#{entityId}`
- SK:
  - `NOTE#{timestamp}`
  - `OVERRIDE#{timestamp}`
  - `AUDIT#{timestamp}`

Attributes:
- `adminUser`
- `note`
- `action`
- `createdAt`

## 8. `ybai-settings`
App-level settings and feature flags.

- PK: `SETTING#{key}`
- SK: `CURRENT`

Attributes:
- `value`
- `description`
- `updatedAt`
- `updatedBy`

Settings to store:
- active one-time purchase price
- support email destination
- demo rate limits
- feature flags
- landing page copy variants

## Notes
- Keep PII minimal.
- Hash public-demo IP and user-agent if stored for abuse tracking.
- Store generated report payloads in compressed JSON if they grow large.
- Move binary exports or OG image assets to S3 if needed; store references in DynamoDB.
- Encrypt buyer-provided Google/YouTube integration settings before persisting them.
