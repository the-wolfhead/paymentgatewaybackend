import dotenv from 'dotenv';
dotenv.config();

// These must match what the code actually reads (previously this list checked
// PALMPAY_SECRET, which nothing uses, while never checking the vars the real
// PalmPay integration in palmpayService.js depends on).
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'PALMPAY_MERCHANT_ID',
  'PALMPAY_MERCHANT_PRIVATE_KEY',
  'PALMPAY_AUTH_TOKEN',
];

export function assertEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    // Fail loudly and clearly at boot instead of deep inside a random
    // request handler with a cryptic crypto/JWT error.
    console.error(
      `❌ Missing required environment variable(s): ${missing.join(', ')}\n` +
      `   See .env.example for the full list of variables this service needs.`
    );
    throw new Error(`Missing env variable(s): ${missing.join(', ')}`);
  }
}

export const env = process.env;
