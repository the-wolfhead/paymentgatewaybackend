/**
 * PalmPay payout adapter used by withdrawal.service.
 */
import { palmPayInitiatePayout, palmPayQueryPayoutStatus } from './palmpayService.js';

/**
 * Send money from merchant PalmPay balance to a bank/MMO account.
 * amount is in Naira.
 */
export const sendPayout = async ({
  amount,
  accountNumber,
  bankCode,
  name,
  reference,
  phone,
  remark,
}) => {
  if (!amount || Number(amount) <= 0) {
    throw new Error('Payout amount must be greater than zero');
  }
  if (!accountNumber || !bankCode) {
    throw new Error('accountNumber and bankCode are required for payout');
  }

  const response = await palmPayInitiatePayout({
    orderId: reference,
    amount: Number(amount),
    payeeName: name || 'Beneficiary',
    payeeBankCode: bankCode,
    payeeBankAccNo: accountNumber,
    payeePhoneNo: phone,
    remark: remark || 'Wallet withdrawal',
  });

  const payload = response?.data || response || {};
  // orderStatus: typically 1=pending, 2=success, others fail — treat non-2 as pending/unknown
  const orderStatus = payload.orderStatus;
  const success =
    orderStatus === 2 ||
    orderStatus === '2' ||
    String(payload.message || '').toLowerCase() === 'success';

  return {
    provider: 'PALMPAY',
    reference,
    orderId: payload.orderId || reference,
    orderNo: payload.orderNo || null,
    orderStatus: orderStatus ?? null,
    sessionId: payload.sessionId || null,
    fee: payload.fee?.fee != null ? Number(payload.fee.fee) / 100 : null,
    amount: Number(amount),
    currency: payload.currency || 'NGN',
    status: success ? 'SUCCESS' : orderStatus == null ? 'PENDING' : 'PENDING',
    message: payload.message || payload.errorMsg || response?.respMsg || null,
    raw: response,
  };
};

export const queryPayout = async (reference) => {
  const response = await palmPayQueryPayoutStatus(reference);
  const payload = response?.data || response || {};
  return {
    orderId: payload.orderId || reference,
    orderNo: payload.orderNo || null,
    orderStatus: payload.orderStatus ?? null,
    message: payload.message || response?.respMsg,
    raw: response,
  };
};
