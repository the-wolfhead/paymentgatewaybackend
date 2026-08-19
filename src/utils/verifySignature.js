import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;

/**
 * PalmPay payment-result notification signature verification.
 *
 * PalmPay sends `sign` in the JSON body. The value is URL encoded and must be
 * URL-decoded before Base64/RSA verification.
 *
 * The signed parameter string contains every non-null/non-empty parameter
 * except `sign`, sorted by parameter name, joined as key=value with `&`.
 * PalmPay may include additional fields beyond the fields shown in the basic
 * notification table (for example orderType, sessionId, status, tntCode and
 * transType). We MUST preserve and sign those fields too.
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

    const signString = buildSignString(payload);

    // PalmPay's signing flow uses an MD5 digest of the canonical parameter
    // string. Keep the uppercase digest used by PalmPay's examples and also
    // support the byte-level representation used by some PalmPay SDKs.
    const md5Upper = crypto
      .createHash('md5')
      .update(signString, 'utf8')
      .digest('hex')
      .toUpperCase();
    const md5Lower = md5Upper.toLowerCase();
    const md5Bytes = Buffer.from(md5Upper, 'hex');

    const keys = publicKeyCandidates(PALMPAY_PUBLIC_KEY);
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
          console.log(`PalmPay webhook signature verified using ${variant.label}`);
          return true;
        }
      }

      // Compatibility with SDKs that RSA-sign the raw MD5 bytes rather than
      // the printable MD5 hex string.
      if (verifyRawDigest(key, md5Bytes, signature, 'RSA-SHA256')) {
        console.log('PalmPay webhook signature verified using RSA-SHA256/MD5-BYTES');
        return true;
      }
      if (verifyRawDigest(key, md5Bytes, signature, 'RSA-SHA1')) {
        console.log('PalmPay webhook signature verified using RSA-SHA1/MD5-BYTES');
        return true;
      }
    }

    console.warn('PalmPay webhook: Signature verification failed');
    console.warn('PalmPay webhook sign string:', signString);
    console.warn('PalmPay webhook MD5 digest:', md5Upper);
    console.warn('PalmPay webhook decoded signature length:', signature.length);
    return false;
  } catch (error) {
    console.error('PalmPay webhook signature verification error:', error);
    return false;
  }
};
