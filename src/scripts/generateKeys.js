// src/scripts/generateKeys.js
//
// package.json's "generate-keys" script pointed here, but this file never
// existed — `npm run generate-keys` would fail with "Cannot find module".
import { RsaUtil } from '../config/rsaUtil.js';

const { privateKey, publicKey } = RsaUtil.generateKeyPair();

console.log('=== RSA Key Pair (base64, PKCS#8/SPKI DER) ===\n');
console.log('PRIVATE KEY (keep secret — set as PALMPAY_MERCHANT_PRIVATE_KEY):');
console.log(privateKey);
console.log('\nPUBLIC KEY (share with PalmPay / counterparties):');
console.log(publicKey);
