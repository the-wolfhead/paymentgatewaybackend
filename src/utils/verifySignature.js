/**
 * PalmPay webhook signature verification.
 *
 * PalmPay signs notification bodies with their platform private key.
 * You verify using PALMPAY_PUBLIC_KEY (platform/notification public key
 * from the PalmPay merchant dashboard — NOT your merchant public key).
 *
 * Documented flow (same as merchant request signing, inverted):
 *   1. Take all body fields except `sign` (non-empty)
 *   2. Sort by key, join as key=value&key2=value2
 *   3. MD5 hex uppercase of that string
 *   4. RSA verify the Base64 signature against that MD5 digest
 *
 * Production notifications may include extra fields; we try:
 *   - all non-empty fields except sign
 *   - documented payment-result fields only
 * Algorithms tried: RSA-SHA1 (classic) and RSA-SHA256 (RSA2).
 */
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const PALMPAY_PUBLIC_KEY = (process.env.PALMPAY_PUBLIC_KEY || '').trim();

/** Skip verification only when explicitly allowed (local/dev). Never in production. */
const ALLOW_SKIP =
  process.env.PALMPAY_SKIP_WEBHOOK_VERIFY === 'true' &&
  process.env.NODE_ENV !== 'production';

const DOCUMENTED_NOTIFICATION_FIELDS = [
  'orderId',
  'orderNo',
  'appId',
  'currency',
  'amount',
  'orderStatus',
  'completeTime',
  'payer',
  'payMethod',
  // Payout notifications may include these
  'sessionId',
  'message',
  'errorMsg',
  'fee',
];

function keyFingerprint(key) {
  return crypto.createHash('sha256').update(String(key).trim()).digest('hex').slice(0, 16);
}

if (PALMPAY_PUBLIC_KEY) {
  console.log(`[PalmPay] PALMPAY_PUBLIC_KEY fingerprint: ${keyFingerprint(PALMPAY_PUBLIC_KEY)}`);
} else {
  console.error(
    '[PalmPay] PALMPAY_PUBLIC_KEY is not set — webhook signatures cannot be verified. ' +
      'Copy the PLATFORM / notification public key from the PalmPay dashboard.'
  );
}

/**
 * Canonical string: sorted key=value pairs, excluding empty values and `sign`.
 */
export function buildSignString(payload = {}, { onlyKeys } = {}) {
  const keys = onlyKeys
    ? onlyKeys.filter((k) => k !== 'sign')
    : Object.keys(payload).filter((k) => k !== 'sign');

  return keys
    .filter((key) => {
      const value = payload[key];
      if (value === undefined || value === null) return false;
      // Objects/arrays: stable JSON for rare nested fields
      if (typeof value === 'object') {
        return String(JSON.stringify(value)).trim() !== '';
      }
      return String(value).trim() !== '';
    })
    .sort()
    .map((key) => {
      const value = payload[key];
      const str =
        typeof value === 'object' ? JSON.stringify(value) : String(value).trim();
      return `${key}=${str}`;
    })
    .join('&');
}

export function buildDocumentedFieldsSignString(payload = {}) {
  return buildSignString(payload, { onlyKeys: DOCUMENTED_NOTIFICATION_FIELDS });
}

/**
 * Decode PalmPay `sign` (often URL-encoded Base64).
 */
export function decodePalmPaySign(sign) {
  if (sign == null) return '';
  let decoded = String(sign);
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(decoded); i += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      break;
    }
  }
  // Some gateways turn + into space during form encoding
  return decoded.replace(/ /g, '+');
}

function toPemCandidates(key) {
  const trimmed = String(key || '').trim();
  if (!trimmed) return [];

  const candidates = [];
  if (trimmed.includes('BEGIN')) {
    candidates.push(trimmed);
    return candidates;
  }

  const compact = trimmed.replace(/\s+/g, '');
  const lines = compact.match(/.{1,64}/g)?.join('\n') || compact;
  candidates.push(`-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`);
  candidates.push(`-----BEGIN RSA PUBLIC KEY-----\n${lines}\n-----END RSA PUBLIC KEY-----`);
  // Also try raw base64 buffer via createPublicKey
  candidates.push(compact);
  return [...new Set(candidates)];
}

function verifyRsa(publicKeyMaterial, data, signatureB64, algorithm) {
  try {
    const verifier = crypto.createVerify(algorithm);
    if (Buffer.isBuffer(data)) {
      verifier.update(data);
    } else {
      verifier.update(String(data), 'utf8');
    }
    verifier.end();
    const sig = Buffer.from(signatureB64, 'base64');
    return verifier.verify(publicKeyMaterial, sig);
  } catch {
    return false;
  }
}

function verifyRsaKeyObject(keyInput, data, signatureB64, algorithm) {
  try {
    let keyObj;
    if (typeof keyInput === 'string' && !keyInput.includes('BEGIN')) {
      // SPKI DER base64
      keyObj = crypto.createPublicKey({
        key: Buffer.from(keyInput.replace(/\s+/g, ''), 'base64'),
        format: 'der',
        type: 'spki',
      });
    } else {
      keyObj = crypto.createPublicKey(keyInput);
    }
    const verifier = crypto.createVerify(algorithm);
    if (Buffer.isBuffer(data)) verifier.update(data);
    else verifier.update(String(data), 'utf8');
    verifier.end();
    return verifier.verify(keyObj, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Verify a PalmPay webhook payload.
 * @param {object} payload - parsed JSON body (must include `sign` or rely on header)
 * @param {object} [options]
 * @param {string} [options.signatureHeader] - optional Signature header value
 * @returns {boolean}
 */
export function verifyPalmPaySignature(payload = {}, options = {}) {
  try {
    if (ALLOW_SKIP) {
      console.warn(
        '[PalmPay] PALMPAY_SKIP_WEBHOOK_VERIFY=true — skipping signature check (non-production only)'
      );
      return true;
    }

    if (!PALMPAY_PUBLIC_KEY) {
      console.error('[PalmPay] webhook rejected: PALMPAY_PUBLIC_KEY not configured');
      return false;
    }

    const rawSign =
      payload.sign ??
      payload.Signature ??
      payload.signature ??
      options.signatureHeader ??
      null;

    if (!rawSign) {
      console.warn('[PalmPay] webhook missing sign field and Signature header');
      return false;
    }

    const signature = decodePalmPaySign(rawSign);
    if (!signature) {
      console.warn('[PalmPay] webhook sign empty after decode');
      return false;
    }

    // Body without sign for string building
    const bodyForSign = { ...payload };
    delete bodyForSign.sign;
    delete bodyForSign.Signature;
    delete bodyForSign.signature;

    const allFieldsSignString = buildSignString(bodyForSign);
    const documentedFieldsSignString = buildDocumentedFieldsSignString(bodyForSign);

    const digestsFor = (signString) => {
      const md5Upper = crypto
        .createHash('md5')
        .update(signString, 'utf8')
        .digest('hex')
        .toUpperCase();
      const md5Lower = md5Upper.toLowerCase();
      const md5Bytes = Buffer.from(md5Upper, 'hex');
      return { md5Upper, md5Lower, md5Bytes, plain: signString };
    };

    const signCandidates = [
      { label: 'ALL-FIELDS', ...digestsFor(allFieldsSignString) },
      { label: 'DOCUMENTED-FIELDS', ...digestsFor(documentedFieldsSignString) },
    ];

    // Also try signing the raw sorted string without MD5 (some gateways)
    signCandidates.push({
      label: 'ALL-FIELDS-PLAIN',
      md5Upper: allFieldsSignString,
      md5Lower: allFieldsSignString,
      md5Bytes: Buffer.from(allFieldsSignString, 'utf8'),
      plain: allFieldsSignString,
    });

    const keyMaterials = toPemCandidates(PALMPAY_PUBLIC_KEY);
    const algorithms = ['RSA-SHA1', 'RSA-SHA256'];

    for (const cand of signCandidates) {
      const dataVariants = [
        { label: 'MD5-UPPER', data: cand.md5Upper },
        { label: 'MD5-LOWER', data: cand.md5Lower },
        { label: 'MD5-BYTES', data: cand.md5Bytes },
        { label: 'PLAIN', data: cand.plain },
      ];

      for (const key of keyMaterials) {
        for (const algo of algorithms) {
          for (const dv of dataVariants) {
            if (verifyRsa(key, dv.data, signature, algo)) {
              console.log(
                `[PalmPay] signature OK (${cand.label} / ${algo} / ${dv.label})`
              );
              return true;
            }
            if (verifyRsaKeyObject(key, dv.data, signature, algo)) {
              console.log(
                `[PalmPay] signature OK via KeyObject (${cand.label} / ${algo} / ${dv.label})`
              );
              return true;
            }
          }
        }
      }
    }

    console.warn('[PalmPay] signature verification FAILED');
    console.warn('  sign string (all):', allFieldsSignString.slice(0, 200));
    console.warn('  sign string (doc):', documentedFieldsSignString.slice(0, 200));
    console.warn('  signature length:', signature.length);
    console.warn(
      '  Tip: ensure PALMPAY_PUBLIC_KEY is PalmPay PLATFORM public key, not your merchant key. ' +
        `Current key fingerprint: ${keyFingerprint(PALMPAY_PUBLIC_KEY)}`
    );
    return false;
  } catch (error) {
    console.error('[PalmPay] signature verification error:', error.message);
    return false;
  }
}

/**
 * Express middleware: verify PalmPay webhook signature on req.body.
 * Rejects with 401 plain text (PalmPay expects simple responses).
 */
export function requirePalmPayWebhookSignature(req, res, next) {
  const headerSig =
    req.headers['signature'] ||
    req.headers['Signature'] ||
    req.headers['x-palmpay-signature'];

  const ok = verifyPalmPaySignature(req.body || {}, {
    signatureHeader: headerSig ? String(headerSig) : undefined,
  });

  if (!ok) {
    return res.status(401).send('Invalid signature');
  }
  return next();
}

export default {
  verifyPalmPaySignature,
  requirePalmPayWebhookSignature,
  buildSignString,
  buildDocumentedFieldsSignString,
  decodePalmPaySign,
};
