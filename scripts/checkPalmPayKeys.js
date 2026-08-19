// scripts/checkPalmPayKeys.js
//
// Every algorithm/encoding combination in verifySignature.js failing
// uniformly points at the wrong key being configured, most likely
// PALMPAY_PUBLIC_KEY holding YOUR OWN merchant public key (the counterpart
// to PALMPAY_MERCHANT_PRIVATE_KEY) instead of PalmPay's platform public key.
//
// This derives the public key that actually matches your configured private
// key, fingerprints it, and compares that fingerprint against whatever's
// configured in PALMPAY_PUBLIC_KEY. If they MATCH, that's a confirmed bug —
// go back to PalmPay's merchant dashboard and copy their "platform public
// key" / "notification public key" instead (not your own).
//
// Usage: node scripts/checkPalmPayKeys.js
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

function fingerprint(base64Key) {
  return crypto.createHash('sha256').update(base64Key.trim()).digest('hex').slice(0, 16);
}

const privateKeyB64 = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;
const configuredPublicKeyB64 = process.env.PALMPAY_PUBLIC_KEY;

if (!privateKeyB64) {
  console.error('❌ PALMPAY_MERCHANT_PRIVATE_KEY is not set');
  process.exit(1);
}
if (!configuredPublicKeyB64) {
  console.error('❌ PALMPAY_PUBLIC_KEY is not set');
  process.exit(1);
}

const privatePem = `-----BEGIN PRIVATE KEY-----\n${privateKeyB64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;

let derivedPublicKeyB64;
try {
  const privateKeyObj = crypto.createPrivateKey(privatePem);
  const derivedPublicKeyObj = crypto.createPublicKey(privateKeyObj);
  const derivedDer = derivedPublicKeyObj.export({ type: 'spki', format: 'der' });
  derivedPublicKeyB64 = derivedDer.toString('base64');
} catch (err) {
  console.error('❌ Could not parse PALMPAY_MERCHANT_PRIVATE_KEY:', err.message);
  process.exit(1);
}

const derivedFp = fingerprint(derivedPublicKeyB64);
const configuredFp = fingerprint(configuredPublicKeyB64);

console.log('Fingerprint of the public key matching your private key:', derivedFp);
console.log('Fingerprint of your configured PALMPAY_PUBLIC_KEY:       ', configuredFp);
console.log('');

if (derivedFp === configuredFp) {
  console.log('🚨 MATCH — PALMPAY_PUBLIC_KEY is your OWN merchant public key, not PalmPay\'s.');
  console.log('   Go to PalmPay\'s merchant dashboard and copy their platform/notification');
  console.log('   public key instead — the one THEY use to sign webhook callbacks, not the');
  console.log('   one they use to verify requests you send them.');
} else {
  console.log('✅ No match — PALMPAY_PUBLIC_KEY is not simply your own key by accident.');
  console.log('   The wrong-key hypothesis for THIS specific mix-up is ruled out.');
  console.log('   Next best step: re-copy PALMPAY_PUBLIC_KEY fresh from PalmPay\'s dashboard');
  console.log('   in case it was rotated, or confirm you\'re using the key for the same');
  console.log('   environment (prod vs sandbox) as PALMPAY_BASE_URL.');
}
