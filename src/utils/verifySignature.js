// src/utils/verifySignature.js
import { RsaUtil } from './rsaUtil.js';
import dotenv from 'dotenv';

dotenv.config();

const PALMPAY_PUBLIC_KEY = process.env.PALMPAY_PUBLIC_KEY;

const buildSignString = (obj) => {
  const data = { ...obj };
  delete data.sign;        // Never include 'sign' in the verification string

  return Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('&');
};

export const verifyPalmPaySignature = (req) => {
  try {
    const signature = req.headers['sign'] || req.headers['signature'];
    const payload = req.body;

    if (!signature || !payload) {
      console.warn('PalmPay webhook: Missing signature or payload');
      return false;
    }

    const signString = buildSignString(payload);
    const isValid = RsaUtil.verify(PALMPAY_PUBLIC_KEY, signString, signature);

    if (!isValid) {
      console.warn('PalmPay webhook: Signature verification failed');
    }

    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};
