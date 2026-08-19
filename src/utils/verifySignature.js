import { RsaUtil } from './rsaUtil.js';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;

/**
 * PalmPay notification signatures are sent in the JSON body as `sign`.
 * PalmPay's docs also note that the received sign is URL encoded, so it must
 * be URL-decoded before RSA verification.
 *
 * Signature string: all non-null/non-empty parameters except `sign`, sorted
 * by key, joined as key=value with `&`.
 */
const buildSignString = (payload) => {
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
  // decodeURIComponent handles PalmPay's URL-encoded Base64 (`%2B`, `%3D`, etc.).
  // Replace '+' only after decoding if the provider/form transport changed it
  // into a space (JSON normally does not, but this makes the verifier tolerant).
  return decodeURIComponent(String(sign)).replace(/ /g, '+');
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

    const signature = decodePalmPaySign(payload.sign);
    const signString = buildSignString(payload);

    // PalmPay's signature method signs the uppercase MD5 digest of the
    // sorted parameter string with RSA-SHA1. This mirrors the signing method
    // used by palmpayService.js for outbound PalmPay requests.
    const md5Str = crypto
      .createHash('md5')
      .update(signString, 'utf8')
      .digest('hex')
      .toUpperCase();

    const isValid = RsaUtil.verify(
      PALMPAY_PUBLIC_KEY,
      md5Str,
      signature
    );

    if (!isValid) {
      console.warn('PalmPay webhook: Signature verification failed');
      console.warn('PalmPay webhook sign string:', signString);
      console.warn('PalmPay webhook MD5 digest:', md5Str);
    }

    return isValid;
  } catch (error) {
    console.error('PalmPay webhook signature verification error:', error);
    return false;
  }
};

export { buildSignString };
