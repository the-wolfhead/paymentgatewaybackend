/**
 * PalmPay Open API client (NG).
 *
 * Deposit (collect):  POST /api/v2/payment/merchant/createorder
 * Payout (withdraw):  POST /api/v2/merchant/payment/payout
 * Merchant balance:   POST /api/v2/merchant/manage/account/queryBalance
 * Bank list:          POST /api/v2/general/merchant/queryBankList
 * Resolve account:    POST /api/v2/payment/merchant/payout/queryBankAccount
 * Payout status:      POST /api/v2/merchant/payment/queryPayStatus
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
  /** Official docs: /api/v2/merchant/manage/account/queryBalance */
  merchantBalance:
    process.env.PALMPAY_BALANCE_PATH || '/api/v2/merchant/manage/account/queryBalance',
  bankList: '/api/v2/general/merchant/queryBankList',
  queryBankAccount: '/api/v2/payment/merchant/payout/queryBankAccount',
  /** Official docs: /api/v2/merchant/payment/queryPayStatus */
  payoutStatus:
    process.env.PALMPAY_PAYOUT_STATUS_PATH || '/api/v2/merchant/payment/queryPayStatus',
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
/**
 * PalmPay orderStatus (data dictionary):
 *   0 = unpaid, 1 = paying, 2 = success, 3 = fail, 4 = close
 */
export function mapPalmPayOrderStatus(orderStatus) {
  const n = Number(orderStatus);
  if (n === 2) return 'SUCCESS';
  if (n === 3 || n === 4) return 'FAILED';
  if (n === 0 || n === 1) return 'PENDING';
  return 'PENDING';
}

/**
 * Initiate merchant balance payout to a bank or PalmPay account.
 * Path: POST /api/v2/merchant/payment/payout
 * @see https://docs.palmpay.com/en-us/pay-outs/initiate-merchant-payment.md
 *
 * Required: orderId, payeeBankAccNo, amount, currency, notifyUrl, remark
 * Required (NG): payeeBankCode
 * amount is in Naira; converted to minimum units (100 = ₦1).
 */
export const palmPayInitiatePayout = async ({
  orderId,
  amount,
  payeeName,
  payeeBankCode,
  payeeBankAccNo,
  payeePhoneNo,
  payeeEmail,
  remark,
  title,
  description,
}) => {
  const requestId = `PP_PAYOUT_${Date.now()}`;
  const base = (process.env.BASE_URL || process.env.PAYMENT_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) {
    console.warn(
      '[PalmPay payout] BASE_URL is not set — notifyUrl may be invalid. Set BASE_URL to your payment API public URL.'
    );
  }
  const notifyUrl = `${base}/api/webhooks/palmpay-payout`;

  // Docs: account number purely numeric, no spaces/special characters
  const accNo = String(payeeBankAccNo || '').replace(/\D/g, '');
  if (!accNo) {
    throw new Error('payeeBankAccNo is required');
  }
  if (!payeeBankCode) {
    throw new Error('payeeBankCode is required for NG payouts');
  }

  return signedRequest(
    PATHS.payout,
    {
      orderId: String(orderId).slice(0, 32),
      title: title || 'Payout',
      description: description || 'Merchant payout',
      payeeName: payeeName || 'Beneficiary',
      payeeBankCode: String(payeeBankCode),
      payeeBankAccNo: accNo,
      ...(payeePhoneNo ? { payeePhoneNo: String(payeePhoneNo) } : {}),
      ...(payeeEmail ? { payeeEmail: String(payeeEmail) } : {}),
      amount: toPalmPayAmount(amount),
      currency: 'NGN',
      notifyUrl,
      // remark is required by PalmPay (may be empty string)
      remark: remark != null && String(remark).trim() !== '' ? String(remark).slice(0, 200) : 'payout',
    },
    { requestId }
  );
};

/**
 * Query payout result.
 * Path: POST /api/v2/merchant/payment/queryPayStatus
 * Send orderId and/or orderNo.
 */
export const palmPayQueryPayoutStatus = async ({ orderId, orderNo } = {}) => {
  const body = {};
  if (orderId) body.orderId = String(orderId).slice(0, 32);
  if (orderNo) body.orderNo = String(orderNo).slice(0, 32);
  if (!body.orderId && !body.orderNo) {
    throw new Error('orderId or orderNo is required to query payout status');
  }
  return signedRequest(PATHS.payoutStatus, body);
};

/* ── Merchant balance (PalmPay float) ────────────────────────────────────── */

/**
 * Query PalmPay merchant account balances (available / frozen / unsettled).
 * Amounts returned in Naira (converted from PalmPay minimum units).
 */
export const palmPayQueryMerchantBalance = async () => {
  // Body merchantId is the PalmPay merchant *number* (docs example: "24911478").
  // Authorization Bearer uses PALMPAY_AUTH_TOKEN — often a different value.
  const merchantId =
    process.env.PALMPAY_MERCHANT_ID ||
    process.env.PALMPAY_MERCHANT_NO ||
    process.env.PALMPAY_AUTH_TOKEN ||
    MERCHANT_ID;

  if (!merchantId) {
    throw new Error(
      'PALMPAY_MERCHANT_ID is required to query merchant balance (PalmPay merchant number)'
    );
  }

  const data = await signedRequest(PATHS.merchantBalance, {
    merchantId: String(merchantId),
  });

  const raw = data?.data || data || {};
  // PalmPay returns Long amounts in minimum units (kobo for NGN): 100 = ₦1
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
    merchantId: String(merchantId),
    // Raw minimum-unit values for debugging
    rawUnits: {
      availableBalance: raw.availableBalance,
      frozenBalance: raw.frozenBalance,
      currentBalance: raw.currentBalance ?? raw.currentBlance,
      unSettleBalance: raw.unSettleBalance,
    },
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
  mapPalmPayOrderStatus,
  palmPayQueryMerchantBalance,
  palmPayQueryBankList,
  palmPayQueryBankAccount,
  toPalmPayAmount,
  fromPalmPayAmount,
};
