/**
 * PalmPay payout adapter (admin payouts + user withdrawals).
 * Aligns with docs:
 *   initiate: POST /api/v2/merchant/payment/payout
 *   status:   POST /api/v2/merchant/payment/queryPayStatus
 */
import {
  palmPayInitiatePayout,
  palmPayQueryPayoutStatus,
  mapPalmPayOrderStatus,
} from './palmpayService.js';

/**
 * Send money from merchant PalmPay balance to a bank/MMO account.
 * @param amount Naira
 */
export const sendPayout = async ({
  amount,
  accountNumber,
  bankCode,
  name,
  reference,
  phone,
  email,
  remark,
  title,
  description,
}) => {
  if (!amount || Number(amount) <= 0) {
    throw new Error('Payout amount must be greater than zero');
  }
  if (!accountNumber || !bankCode) {
    throw new Error('accountNumber and bankCode are required for payout');
  }

  const response = await palmPayInitiatePayout({
    orderId: String(reference).slice(0, 32),
    amount: Number(amount),
    payeeName: name || 'Beneficiary',
    payeeBankCode: bankCode,
    payeeBankAccNo: accountNumber,
    payeePhoneNo: phone,
    payeeEmail: email,
    remark: remark || 'payout',
    title: title || 'Payout',
    description: description || 'Merchant payout',
  });

  const payload = response?.data || response || {};
  const orderStatus = payload.orderStatus;
  const status = mapPalmPayOrderStatus(orderStatus);

  return {
    provider: 'PALMPAY',
    reference,
    orderId: payload.orderId || reference,
    orderNo: payload.orderNo || null,
    orderStatus: orderStatus ?? null,
    sessionId: payload.sessionId || null,
    fee: payload.fee?.fee != null ? Number(payload.fee.fee) / 100 : null,
    amount: Number(amount),
    amountUnits: payload.amount != null ? Number(payload.amount) : null,
    currency: payload.currency || 'NGN',
    status,
    message: payload.message || payload.errorMsg || response?.respMsg || null,
    raw: response,
  };
};

/**
 * @param {string} reference merchant orderId
 * @param {string} [orderNo] PalmPay orderNo
 */
export const queryPayout = async (reference, orderNo) => {
  const response = await palmPayQueryPayoutStatus({
    orderId: reference,
    orderNo,
  });
  const payload = response?.data || response || {};
  const orderStatus = payload.orderStatus;
  return {
    orderId: payload.orderId || reference,
    orderNo: payload.orderNo || orderNo || null,
    orderStatus: orderStatus ?? null,
    status: mapPalmPayOrderStatus(orderStatus),
    amount: payload.amount != null ? Number(payload.amount) / 100 : null,
    fee: payload.fee?.fee != null ? Number(payload.fee.fee) / 100 : null,
    sessionId: payload.sessionId || null,
    message: payload.message || payload.errorMsg || response?.respMsg,
    createdTime: payload.createdTime || null,
    completedTime: payload.completedTime || null,
    raw: response,
  };
};
