/**
 * PalmPay Open API client (NG).
 *
 * Deposit (collect):  POST /api/v2/payment/merchant/createorder
 * Payout (withdraw):  POST /api/v2/merchant/payment/payout
 * Merchant balance:   POST /api/v2/merchant/payment/balance/query  (override via env)
 * Bank list:          POST /api/v2/general/merchant/queryBankList
 * Resolve account:    POST /api/v2/payment/merchant/payout/queryBankAccount
 * Payout status:      POST /api/v2/merchant/payment/payout/queryStatus (override via env)
 *
 * Auth: Bearer PALMPAY_AUTH_TOKEN + RSA-SHA1 Signature of MD5(sorted body).
 */
import axios from 'axios';
import crypto from 'crypto';
import { RsaUtil } from '../utils/rsaUtil.js';

const BASE_URL = (process.env.PALMPAY_BASE_URL || 'https://open-gw-sandbox.palmpay-inc.com').replace(
  /\/$/,
  ''
);
const MERCHANT_ID = process.env.PALMPAY_AUTH_TOKEN || process.env.PALMPAY_MERCHANT_ID;
const MERCHANT_PRIVATE_KEY = process.env.PALMPAY_MERCHANT_PRIVATE_KEY;

const PATHS = {
  createOrder: '/api/v2/payment/merchant/createorder',
  payout: '/api/v2/merchant/payment/payout',
  /** PalmPay balance query — path can vary by account type; override if your dashboard differs */
  merchantBalance:
    process.env.PALMPAY_BALANCE_PATH || '/api/v2/merchant/payment/balance/query',
  bankList: '/api/v2/general/merchant/queryBankList',
  queryBankAccount: '/api/v2/payment/merchant/payout/queryBankAccount',
  payoutStatus:
    process.env.PALMPAY_PAYOUT_STATUS_PATH || '/api/v2/merchant/payment/payout/queryStatus',
};

function assertConfigured() {
  if (!MERCHANT_ID) {
    throw new Error('PALMPAY_AUTH_TOKEN (merchant auth token) is not configured');
  }
  if (!MERCHANT_PRIVATE_KEY) {
    throw new Error('PALMPAY_MERCHANT_PRIVATE_KEY is not configured');
  }
}

function buildSignString(params) {
  return Object.keys(params)
    .filter((key) => {
      const val = params[key];
      return val !== undefined && val !== null && String(val).trim() !== '';
    })
    .sort()
    .map((key) => `${key}=${String(params[key]).trim()}`)
    .join('&');
}

function generateSignature(body) {
  const strA = buildSignString(body);
  const md5Str = crypto.createHash('md5').update(strA, 'utf8').digest('hex').toUpperCase();
  return RsaUtil.sign(MERCHANT_PRIVATE_KEY, md5Str);
}

function baseBody(extra = {}) {
  return {
    requestTime: Date.now(),
    version: 'V1.1',
    nonceStr: crypto.randomBytes(16).toString('hex'),
    ...extra,
  };
}

function scrub(body) {
  const out = { ...body };
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined || out[k] === null || String(out[k]).trim() === '') {
      delete out[k];
    }
  });
  return out;
}

/**
 * Signed POST to PalmPay. Returns response.data.
 * Throws with PalmPay respMsg when respCode is not success.
 */
async function signedRequest(path, payload, { requestId } = {}) {
  assertConfigured();
  const id = requestId || `PP_${Date.now()}`;
  const requestBody = scrub(baseBody(payload));
  const signature = generateSignature(requestBody);
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = {
    Accept: 'application/json, text/plain, */*',
    CountryCode: process.env.PALMPAY_COUNTRY_CODE || 'NG',
    Authorization: `Bearer ${MERCHANT_ID}`,
    Signature: signature,
    'Content-Type': 'application/json',
  };

  try {
    console.log(`[${id}] PalmPay → ${path}`, JSON.stringify({ ...requestBody, /* no secrets */ }));
    const response = await axios({
      method: 'POST',
      url,
      headers,
      data: requestBody,
      timeout: Number(process.env.PALMPAY_TIMEOUT_MS) || 20000,
    });
    console.log(`[${id}] PalmPay ←`, JSON.stringify(response.data));

    const code = response.data?.respCode;
    if (code && code !== '00000000' && code !== '00000') {
      const err = new Error(
        response.data?.respMsg || response.data?.message || `PalmPay error ${code}`
      );
      err.palmpay = response.data;
      err.code = code;
      throw err;
    }
    return response.data;
  } catch (error) {
    if (error.palmpay) throw error;
    console.error(`[${id}] PalmPay Error:`, error.response?.data || error.message);
    const err = new Error(
      error.response?.data?.respMsg ||
        error.response?.data?.message ||
        error.message ||
        'PalmPay request failed'
    );
    err.palmpay = error.response?.data;
    err.status = error.response?.status;
    throw err;
  }
}

/** Naira → PalmPay minimum units (kobo-style: 100 = ₦1) */
export function toPalmPayAmount(naira) {
  return Math.round(Number(naira) * 100);
}

export function fromPalmPayAmount(units) {
  return Number(units || 0) / 100;
}

/* ── Collect (deposit) ───────────────────────────────────────────────────── */

export const palmPayCreateDeposit = async (orderData) => {
  const requestId = `PP_DEP_${Date.now()}`;
  return signedRequest(
    PATHS.createOrder,
    {
      amount: toPalmPayAmount(orderData.amount),
      currency: 'NGN',
      notifyUrl: `${(process.env.BASE_URL || '').replace(/\/$/, '')}/api/webhooks/palmpay`,
      orderId: String(orderData.orderNo).slice(0, 32),
      title: orderData.title || 'Appointment Payment',
      description: orderData.description || 'Medical Appointment Payment',
      callBackUrl:
        orderData.returnUrl ||
        `${(process.env.BASE_URL || 'https://paymentgatewaybackend-580i.onrender.com').replace(/\/$/, '')}/api/payment/success`,
      goodsDetails: orderData.goodsDetails || '[{"goodsId":"1"}]',
    },
    { requestId }
  );
};

/* ── Payout (withdrawal to bank / MMO) ───────────────────────────────────── */

/**
 * Initiate merchant balance payout to a bank or PalmPay account.
 * @see https://docs.palmpay.com/en-us/pay-outs/initiate-merchant-payment.md
 */
export const palmPayInitiatePayout = async ({
  orderId,
  amount,
  payeeName,
  payeeBankCode,
  payeeBankAccNo,
  payeePhoneNo,
  remark,
  title,
  description,
}) => {
  const requestId = `PP_PAYOUT_${Date.now()}`;
  const notifyUrl = `${(process.env.BASE_URL || '').replace(/\/$/, '')}/api/webhooks/palmpay-payout`;

  return signedRequest(
    PATHS.payout,
    {
      orderId: String(orderId).slice(0, 32),
      title: title || 'Wallet withdrawal',
      description: description || 'User wallet withdrawal',
      payeeName: payeeName || 'Beneficiary',
      payeeBankCode: String(payeeBankCode),
      payeeBankAccNo: String(payeeBankAccNo).replace(/\s+/g, ''),
      ...(payeePhoneNo ? { payeePhoneNo: String(payeePhoneNo) } : {}),
      amount: toPalmPayAmount(amount),
      currency: 'NGN',
      notifyUrl,
      remark: remark != null ? String(remark) : 'withdrawal',
    },
    { requestId }
  );
};

/**
 * Query payout / transfer result by merchant orderId.
 */
export const palmPayQueryPayoutStatus = async (orderId) => {
  return signedRequest(PATHS.payoutStatus, {
    orderId: String(orderId).slice(0, 32),
  });
};

/* ── Merchant balance (PalmPay float) ────────────────────────────────────── */

/**
 * Query PalmPay merchant account balances (available / frozen / unsettled).
 * Amounts returned in Naira (converted from PalmPay minimum units).
 */
export const palmPayQueryMerchantBalance = async () => {
  const merchantId =
    process.env.PALMPAY_MERCHANT_ID || process.env.PALMPAY_AUTH_TOKEN || MERCHANT_ID;

  const data = await signedRequest(PATHS.merchantBalance, {
    merchantId: String(merchantId),
  });

  const raw = data?.data || data || {};
  const available = fromPalmPayAmount(
    raw.availableBalance ?? raw.available_balance ?? raw.available
  );
  const frozen = fromPalmPayAmount(raw.frozenBalance ?? raw.frozen_balance ?? raw.frozen);
  const current = fromPalmPayAmount(
    raw.currentBlance ?? raw.currentBalance ?? raw.current_balance ?? raw.total
  );
  const unSettle = fromPalmPayAmount(
    raw.unSettleBalance ?? raw.unsettleBalance ?? raw.unsettled
  );

  return {
    availableBalance: available,
    frozenBalance: frozen,
    currentBalance: current || available + frozen,
    unSettleBalance: unSettle,
    currency: 'NGN',
    raw: data,
  };
};

/* ── Bank list & name enquiry ────────────────────────────────────────────── */

export const palmPayQueryBankList = async (businessType = 0) => {
  const data = await signedRequest(PATHS.bankList, {
    businessType: String(businessType),
  });
  const list = data?.data;
  if (Array.isArray(list)) return list;
  if (list && typeof list === 'object') {
    // Some environments return a single object or { banks: [] }
    if (Array.isArray(list.banks)) return list.banks;
    if (list.bankCode) return [list];
  }
  return [];
};

export const palmPayQueryBankAccount = async ({ bankCode, bankAccNo }) => {
  const data = await signedRequest(PATHS.queryBankAccount, {
    bankCode: String(bankCode),
    bankAccNo: String(bankAccNo).replace(/\s+/g, ''),
  });
  const payload = data?.data || {};
  const status = payload.Status || payload.status || '';
  const success = String(status).toLowerCase() === 'success';
  return {
    success,
    accountName: payload.accountName || payload.AccountName || null,
    errorMessage: payload.errorMessage || payload.ErrorMessage || null,
    raw: data,
  };
};

export default {
  palmPayCreateDeposit,
  palmPayInitiatePayout,
  palmPayQueryPayoutStatus,
  palmPayQueryMerchantBalance,
  palmPayQueryBankList,
  palmPayQueryBankAccount,
  toPalmPayAmount,
  fromPalmPayAmount,
};
