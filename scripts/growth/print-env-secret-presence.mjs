#!/usr/bin/env node
/**
 * Print which growth-related env vars are present (booleans only — never values).
 * Use in Cloud Agent / Automation runs to debug secret injection.
 */
const NAMES = [
  'GA4_PROPERTY_ID',
  'GOOGLE_ANALYTICS_CREDENTIALS_JSON',
  'STRIPE_RESTRICTED_READ_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'ADMIN_EMAIL',
  'SES_FROM_EMAIL'
];

const present = {};
for (const n of NAMES) {
  present[n] = Boolean(process.env[n] && String(process.env[n]).trim());
}

console.log(
  JSON.stringify(
    {
      ok: present.AWS_ACCESS_KEY_ID && present.AWS_SECRET_ACCESS_KEY && present.AWS_REGION,
      present,
      hint: present.AWS_ACCESS_KEY_ID
        ? 'AWS keys visible — if SES still fails, check IAM ses:SendEmail + ssm:GetParameter'
        : 'No AWS keys in env — add them on cursor.com/dashboard/cloud-agents → Environment → Secrets (not only in AUTOMATION.md)'
    },
    null,
    2
  )
);
