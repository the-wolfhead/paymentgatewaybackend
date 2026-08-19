import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;

// Every algorithm/encoding/key-format combination below failing UNIFORMLY is
// a strong signal that the wrong key is configured, not the wrong scheme —
// most likely PALMPAY_PUBLIC_KEY got set to your own merchant public key
// (the counterpart to PALMPAY_MERCHANT_PRIVATE_KEY, which PalmPay uses to
// verify requests YOU send) instead of PalmPay's own platform public key
// (which YOU need to verify the signatures THEY send on webhooks). Both are
// just base64 RSA keys sitting on the same dashboard page — easy to swap.
//
// This logs a short, non-secret fingerprint of whatever key is actually
// configured, once, so you can confirm it matches what PalmPay's dashboard
// shows for "platform/notification public key" without pasting the real
// key anywhere. Compute the same fingerprint yourself from the dashboard
// value with:
//   echo -n "<the key from PalmPay's dashboard>" | openssl dgst -sha256
if (PALMPAY_PUBLIC_KEY) {
  const fingerprint = crypto
    .createHash('sha256')
    .update(PALMPAY_PUBLIC_KEY.trim())
    .digest('hex')
    .slice(0, 16);
  console.log(`[PalmPay] Configured PALMPAY_PUBLIC_KEY fingerprint: ${fingerprint}`);
} else {
  console.error('[PalmPay] PALMPAY_PUBLIC_KEY is not set at all');
}

/**
 * PalmPay payment-result notification signature verification.
 *
 * PalmPay sends `sign` in the JSON body. The value is URL encoded and must be
 * URL-decoded before Base64/RSA verification.
 *
 * PalmPay's documented notification parameter table lists exactly these
 * fields: orderId, orderNo, appId, currency, amount, orderStatus,
 * completeTime, payer, payMethod (plus sign itself, which is excluded from
 * the signed string). In practice, the raw payload PalmPay sends also
 * contains additional fields not in that table (e.g. orderType, sessionId,
 * status, tntCode, transType) — it isn't confirmed whether those extra
 * fields are part of what PalmPay actually signed or are just extra data
 * riding along in the same JSON body. Rather than bet on one interpretation,
 * verifyPalmPaySignature() below tries BOTH constructions against every
 * algorithm/key variant, and logs exactly which one succeeds.
 */
export const buildSignString = (payload = {}) => {
  return Object.keys(payload)
    .filter((key) => {
      if (key === 'sign') return false;
      const value = payload[key];
      return value !== undefined && value !== null && String(value).trim() !== '';
    })
    .sort()
    .map((key) => `${key}=${String(payload[key]).trim()}`)
    .join('&');
};

// Exactly PalmPay's documented "payment result notification" parameter
// table — see the field list in their docs. `sign` is excluded (never
// part of what it signs); `payer`/`payMethod` are optional and only
// included if actually present.
const DOCUMENTED_NOTIFICATION_FIELDS = [
  'orderId', 'orderNo', 'appId', 'currency', 'amount',
  'orderStatus', 'completeTime', 'payer', 'payMethod',
];

export const buildDocumentedFieldsSignString = (payload = {}) => {
  return DOCUMENTED_NOTIFICATION_FIELDS
    .filter((key) => {
      const value = payload[key];
      return value !== undefined && value !== null && String(value).trim() !== '';
    })
    .sort()
    .map((key) => `${key}=${String(payload[key]).trim()}`)
    .join('&');
};

const decodePalmPaySign = (sign) => {
  let decoded = String(sign);
  // PalmPay documents URLDecoder.decode(sign, "UTF-8"). Decode repeatedly
  // only when the string is still percent-encoded, without changing normal
  // Base64 characters.
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(decoded); i += 1) {
    decoded = decodeURIComponent(decoded);
  }
  return decoded.replace(/ /g, '+');
};

const publicKeyCandidates = (key) => {
  const trimmed = String(key || '').trim();
  const candidates = [trimmed];

  // PALMPAY_PUBLIC_KEY is normally a base64-encoded DER public key. Support
  // both SubjectPublicKeyInfo (PUBLIC KEY) and PKCS#1 (RSA PUBLIC KEY).
  const compact = trimmed.replace(/\s+/g, '');
  if (!compact.includes('BEGIN')) {
    candidates.push(
      `-----BEGIN PUBLIC KEY-----\n${compact.match(/.{1,64}/g)?.join('\n') || compact}\n-----END PUBLIC KEY-----`
    );
    candidates.push(
      `-----BEGIN RSA PUBLIC KEY-----\n${compact.match(/.{1,64}/g)?.join('\n') || compact}\n-----END RSA PUBLIC KEY-----`
    );
  }

  return [...new Set(candidates)];
};

const verifyWithKey = (publicKey, data, signature, algorithm) => {
  try {
    const verifier = crypto.createVerify(algorithm);
    verifier.update(data, 'utf8');
    verifier.end();
    return verifier.verify(publicKey, signature);
  } catch {
    return false;
  }
};

const verifyRawDigest = (publicKey, digestBuffer, signature, algorithm) => {
  try {
    const verifier = crypto.createVerify(algorithm);
    verifier.update(digestBuffer);
    verifier.end();
    return verifier.verify(publicKey, signature);
  } catch {
    return false;
  }
};

export const verifyPalmPaySignature = (payload) => {
  try {
    if (!PALMPAY_PUBLIC_KEY) {
      console.error('PalmPay webhook: PALMPAY_PUBLIC_KEY is not configured');
      return false;
    }

    if (!payload || typeof payload !== 'object' || !payload.sign) {
      console.warn('PalmPay webhook: Missing sign or payload');
      return false;
    }

    const signatureBase64 = decodePalmPaySign(payload.sign);
    const signature = Buffer.from(signatureBase64, 'base64');
    if (!signature.length) {
      console.warn('PalmPay webhook: decoded sign is not valid Base64');
      return false;
    }

    const allFieldsSignString = buildSignString(payload);
    const documentedFieldsSignString = buildDocumentedFieldsSignString(payload);

    // PalmPay's signing flow uses an MD5 digest of the canonical parameter
    // string. Keep the uppercase digest used by PalmPay's examples and also
    // support the byte-level representation used by some PalmPay SDKs.
    const digestsFor = (signString) => {
      const md5Upper = crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
      return {
        md5Upper,
        md5Lower: md5Upper.toLowerCase(),
        md5Bytes: Buffer.from(md5Upper, 'hex'),
      };
    };

    const signStringCandidates = [
      { label: 'ALL-FIELDS', signString: allFieldsSignString },
      { label: 'DOCUMENTED-FIELDS-ONLY', signString: documentedFieldsSignString },
    ];

    const keys = publicKeyCandidates(PALMPAY_PUBLIC_KEY);

    for (const candidate of signStringCandidates) {
      const { md5Upper, md5Lower, md5Bytes } = digestsFor(candidate.signString);

      const variants = [
        // Current PalmPay integrations commonly use SHA256withRSA for RSA2.
        { algorithm: 'RSA-SHA256', data: md5Upper, label: 'RSA-SHA256/MD5-UPPER' },
        { algorithm: 'RSA-SHA256', data: md5Lower, label: 'RSA-SHA256/MD5-LOWER' },
        { algorithm: 'RSA-SHA1', data: md5Upper, label: 'RSA-SHA1/MD5-UPPER' },
        { algorithm: 'RSA-SHA1', data: md5Lower, label: 'RSA-SHA1/MD5-LOWER' },
      ];

      for (const key of keys) {
        for (const variant of variants) {
          if (verifyWithKey(key, variant.data, signature, variant.algorithm)) {
            console.log(`PalmPay webhook signature verified using ${candidate.label} / ${variant.label}`);
            return true;
          }
        }

        // Compatibility with SDKs that RSA-sign the raw MD5 bytes rather than
        // the printable MD5 hex string.
        if (verifyRawDigest(key, md5Bytes, signature, 'RSA-SHA256')) {
          console.log(`PalmPay webhook signature verified using ${candidate.label} / RSA-SHA256/MD5-BYTES`);
          return true;
        }
        if (verifyRawDigest(key, md5Bytes, signature, 'RSA-SHA1')) {
          console.log(`PalmPay webhook signature verified using ${candidate.label} / RSA-SHA1/MD5-BYTES`);
          return true;
        }
      }
    }

    console.warn('PalmPay webhook: Signature verification failed');
    console.warn('PalmPay webhook sign string (all fields):', allFieldsSignString);
    console.warn('PalmPay webhook sign string (documented fields only):', documentedFieldsSignString);
    console.warn('PalmPay webhook decoded signature length:', signature.length);
    return false;
  } catch (error) {
    console.error('PalmPay webhook signature verification error:', error);
    return false;
  }
};
