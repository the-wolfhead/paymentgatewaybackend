/**
 * User wallet withdrawal → PalmPay merchant payout.
 * 1) Ensure ledger balance
 * 2) Debit user / credit SYSTEM_PAYOUT (PENDING transaction preferred)
 * 3) Call PalmPay payout
 * 4) On hard failure, reverse ledger
 */
import { prisma } from '../config/prisma.js';
import { createMultiEntry } from './doubleLedger.service.js';
import { getAccountBalance } from './balance.service.js';
import { sendPayout, queryPayout } from './payout.service.js';

const SYSTEM_PAYOUT_ACCOUNT_NUMBER = 'SYSTEM_PAYOUT';
const MIN_WITHDRAWAL = Number(process.env.MIN_WITHDRAWAL_NGN) || 100;

export const withdrawFunds = async ({
  userId,
  amount,
  bankCode,
  accountNumber,
  accountName,
  phone,
}) => {
  const naira = Number(amount);
  if (!Number.isFinite(naira) || naira < MIN_WITHDRAWAL) {
    throw new Error(`Minimum withdrawal is ₦${MIN_WITHDRAWAL}`);
  }
  if (!bankCode || !accountNumber) {
    throw new Error('bankCode and accountNumber are required');
  }

  const userAccount = await prisma.account.findFirst({ where: { userId } });
  if (!userAccount) throw new Error('User account not found');

  const systemAccount = await prisma.account.findFirst({
    where: { accountNumber: SYSTEM_PAYOUT_ACCOUNT_NUMBER },
  });
  if (!systemAccount) {
    throw new Error(
      `System account "${SYSTEM_PAYOUT_ACCOUNT_NUMBER}" is not set up — run the seed script`
    );
  }

  const balance = Number(await getAccountBalance(userAccount.id));
  if (balance < naira) {
    throw new Error(`Insufficient balance (available ₦${balance.toFixed(2)})`);
  }

  // PalmPay orderId max 32 chars
  const reference = `W${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 32);

  await createMultiEntry({
    reference,
    userId,
    type: 'PAYMENT',
    channel: 'BANK_TRANSFER',
    narration: `Withdrawal to ${accountNumber}`,
    entries: [
      { accountId: userAccount.id, type: 'DEBIT', amount: naira },
      { accountId: systemAccount.id, type: 'CREDIT', amount: naira },
    ],
  });

  // Mark meta for payout tracking
  try {
    await prisma.transaction.update({
      where: { reference },
      data: {
        status: 'PENDING',
        meta: {
          narration: `Withdrawal to ${accountNumber}`,
          bankCode,
          accountNumber,
          accountName: accountName || null,
          kind: 'WITHDRAWAL',
        },
      },
    });
  } catch (_) {
    /* schema may not allow status update the same way */
  }

  try {
    const payout = await sendPayout({
      amount: naira,
      accountNumber: String(accountNumber).replace(/\s+/g, ''),
      bankCode: String(bankCode),
      name: accountName || 'Beneficiary',
      reference,
      phone,
      remark: 'Wallet withdrawal',
    });

    const finalStatus = payout.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
    try {
      await prisma.transaction.update({
        where: { reference },
        data: {
          status: finalStatus,
          paystackResponse: payout.raw || payout,
          meta: {
            kind: 'WITHDRAWAL',
            bankCode,
            accountNumber,
            accountName: accountName || null,
            orderNo: payout.orderNo,
            orderStatus: payout.orderStatus,
            sessionId: payout.sessionId,
          },
        },
      });
    } catch (_) {}

    return {
      reference,
      amount: naira,
      currency: 'NGN',
      status: finalStatus,
      payout,
    };
  } catch (err) {
    // Reverse ledger on immediate PalmPay failure
    await createMultiEntry({
      reference: `${reference}R`.slice(0, 32),
      userId,
      type: 'REFUND',
      channel: 'BANK_TRANSFER',
      narration: 'Withdrawal reversal',
      entries: [
        { accountId: systemAccount.id, type: 'DEBIT', amount: naira },
        { accountId: userAccount.id, type: 'CREDIT', amount: naira },
      ],
    });

    try {
      await prisma.transaction.update({
        where: { reference },
        data: {
          status: 'FAILED',
          meta: {
            kind: 'WITHDRAWAL',
            error: err.message,
            palmpay: err.palmpay || null,
          },
        },
      });
    } catch (_) {}

    throw new Error(err.message || 'Payout failed, transaction reversed');
  }
};

export const getWithdrawalStatus = async (reference, userId) => {
  const tx = await prisma.transaction.findFirst({
    where: {
      reference,
      ...(userId ? { userId } : {}),
    },
  });
  if (!tx) throw new Error('Withdrawal not found');

  let provider = null;
  if (tx.status === 'PENDING') {
    try {
      provider = await queryPayout(reference);
    } catch (e) {
      provider = { error: e.message };
    }
  }

  return {
    reference: tx.reference,
    amount: tx.amount,
    status: tx.status,
    meta: tx.meta,
    provider,
    createdAt: tx.createdAt,
  };
};
