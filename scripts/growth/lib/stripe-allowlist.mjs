/**
 * Load YouTubeBooster Stripe attribution allowlist from config + env/SSM overrides.
 * Never contains API keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, '../config/stripe-allowlist.json');

function splitCsv(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * @param {{ configPath?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function loadStripeAllowlist(opts = {}) {
  const env = opts.env || process.env;
  const configPath = opts.configPath || env.STRIPE_YB_ALLOWLIST_PATH || DEFAULT_PATH;
  /** @type {Record<string, any>} */
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    file = {};
  }

  const productIds = uniq([
    ...(file.productIds || []),
    ...splitCsv(env.STRIPE_YB_PRODUCT_IDS)
  ]);
  const priceIds = uniq([...(file.priceIds || []), ...splitCsv(env.STRIPE_YB_PRICE_IDS)]);
  const paymentLinkIds = uniq([
    ...(file.paymentLinkIds || []),
    ...splitCsv(env.STRIPE_YB_PAYMENT_LINK_IDS)
  ]);
  const excludedCustomerIds = uniq([
    ...(file.excludedCustomerIds || []),
    ...splitCsv(env.STRIPE_YB_EXCLUDED_CUSTOMER_IDS)
  ]);
  const excludedEmailHashesSha256Prefix16 = uniq([
    ...(file.excludedEmailHashesSha256Prefix16 || []),
    ...splitCsv(env.STRIPE_YB_EXCLUDED_EMAIL_HASHES).map((h) => h.toLowerCase().slice(0, 16))
  ]);

  const reconEnv = (env.STRIPE_YB_RECONCILIATION_COMPLETE || '').trim().toLowerCase();
  const reconciliationComplete =
    reconEnv === 'true' || reconEnv === '1'
      ? true
      : reconEnv === 'false' || reconEnv === '0'
        ? false
        : file.reconciliationComplete === true;

  const baselines = file.verifiedBaselines?.YouTubeBooster || {
    verifiedExternalPayingCustomers: 0,
    verifiedSuccessfulLivePayments: 0,
    verifiedNetLiveRevenueUsd: 0
  };

  return {
    appKey: file.appKey || 'youtubeboosterai',
    brand: file.brand || 'YouTubeBoosterAI',
    productNameContains: file.productNameContains || ['YouTube Booster AI'],
    successUrlHosts: file.successUrlHosts || ['youtubeboosterai.com'],
    productIds,
    priceIds,
    paymentLinkIds,
    excludedCustomerIds,
    excludedEmailHashesSha256Prefix16,
    smokeTestMetadataFlags: file.smokeTestMetadataFlags || ['smoke_test', 'setup_test', 'internal_test'],
    reconciliationComplete,
    verifiedBaselines: {
      YouTubeBooster: {
        verifiedExternalPayingCustomers: Number(baselines.verifiedExternalPayingCustomers) || 0,
        verifiedSuccessfulLivePayments: Number(baselines.verifiedSuccessfulLivePayments) || 0,
        verifiedNetLiveRevenueUsd: Number(baselines.verifiedNetLiveRevenueUsd) || 0
      },
      GetTrainMate: {
        verifiedExternalPayingCustomers:
          Number(file.verifiedBaselines?.GetTrainMate?.verifiedExternalPayingCustomers) || 0
      }
    },
    configPath,
    hasCatalogAllowlist: productIds.length + priceIds.length + paymentLinkIds.length > 0
  };
}
