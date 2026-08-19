// src/services/walletService.js
//
// The original creditWalletLedger() wrote to a completely different data
// model than the rest of the app: it updated User/Wallet.balance and created
// LedgerEntry rows with fields (userId, type, reference, description,
// gateway, balanceAfter, metadata) that don't exist anywhere in
// prisma/schema.prisma — LedgerEntry only has transactionId/accountId/
// entryType/amount/narration, and it never provided the required
// transactionId. It also never created a Wallet row first, so tx.wallet
// .update() would throw "record not found" for any first-time depositor.
// Every deposit webhook would have crashed here.
//
// Rewritten to use the same Account + LedgerEntry double-entry model that
// balance.service.js / wallet.controller.js already read from, so wallet
// balance has a single source of truth across the app.
import { prisma } from '../config/prisma.js';
import { createLedgerEntriesForTransaction } from './doubleLedger.service.js';
import { FEES } from '../config/fees.js';

const SYSTEM_DEPOSITS_ACCOUNT_NUMBER = 'SYSTEM_DEPOSITS';
const SYSTEM_REVENUE_ACCOUNT_NUMBER = 'SYSTEM_REVENUE'; // same system account transfer.service.js pays fees into

async function getOrCreateUserAccount(userId) {
  let account = await prisma.account.findFirst({ where: { userId } });
  if (!account) {
    account = await prisma.account.create({
      data: {
        userId,
        accountNumber: `ACC_${userId}`,
        type: 'USER',
      },
    });
  }
  return account;
}

async function getOrCreateSystemAccount(accountNumber, type = 'SYSTEM') {
  let account = await prisma.account.findFirst({ where: { accountNumber } });
  if (!account) {
    account = await prisma.account.create({
      data: { accountNumber, type },
    });
  }
  return account;
}

/**
 * Credit a user's wallet against an already-existing Transaction row
 * (the deposit webhook confirms a payment that was created as PENDING at
 * initiation time).
 */
export const creditWalletLedger = async ({
  userId,
  amount,
  transactionId,
  description = 'Wallet deposit',
}) => {
  const requestId = `LEDGER_${Date.now()}`;

  if (!userId || !amount || Number(amount) <= 0) {
    throw new Error('Invalid wallet credit parameters');
  }
  if (!transactionId) {
    throw new Error('transactionId is required to credit a wallet');
  }

  console.log(`[${requestId}] Crediting wallet for user ${userId} | Amount: ₦${amount}`);

  const userAccount = await getOrCreateUserAccount(userId);
  const systemAccount = await getOrCreateSystemAccount(SYSTEM_DEPOSITS_ACCOUNT_NUMBER);

  await createLedgerEntriesForTransaction({
    transactionId,
    narration: description,
    entries: [
      { accountId: systemAccount.id, type: 'DEBIT', amount: Number(amount) },
      { accountId: userAccount.id, type: 'CREDIT', amount: Number(amount) },
    ],
  });

  console.log(`[${requestId}] Wallet credited successfully for account ${userAccount.id}`);

  return { userAccountId: userAccount.id };
};

/**
 * Debit a user's wallet against an already-existing Transaction row.
 */
export const debitWalletLedger = async ({
  userId,
  amount,
  transactionId,
  description = 'Wallet debit',
}) => {
  if (!userId || !amount || Number(amount) <= 0) {
    throw new Error('Invalid wallet debit parameters');
  }
  if (!transactionId) {
    throw new Error('transactionId is required to debit a wallet');
  }

  const userAccount = await getOrCreateUserAccount(userId);
  const systemAccount = await getOrCreateSystemAccount(SYSTEM_DEPOSITS_ACCOUNT_NUMBER);

  await createLedgerEntriesForTransaction({
    transactionId,
    narration: description,
    entries: [
      { accountId: userAccount.id, type: 'DEBIT', amount: Number(amount) },
      { accountId: systemAccount.id, type: 'CREDIT', amount: Number(amount) },
    ],
  });

  return { userAccountId: userAccount.id };
};

/**
 * Pays a doctor their share of a confirmed appointment fee (minus the
 * platform's commission), against an already-existing Transaction row.
 * Without this, an appointment payment credited nobody — the money had
 * nowhere to land for a doctor to ever withdraw.
 */
export const creditDoctorForAppointment = async ({
  doctorUserId,
  amount,
  transactionId,
  description = 'Appointment payment',
}) => {
  if (!doctorUserId || !amount || Number(amount) <= 0) {
    throw new Error('Invalid doctor credit parameters');
  }
  if (!transactionId) {
    throw new Error('transactionId is required to credit a doctor');
  }

  const commission = Math.round(Number(amount) * FEES.DOCTOR_COMMISSION_PERCENT * 100) / 100;
  const doctorNet = Number(amount) - commission;

  const doctorAccount = await getOrCreateUserAccount(doctorUserId);
  const depositsAccount = await getOrCreateSystemAccount(SYSTEM_DEPOSITS_ACCOUNT_NUMBER);
  const revenueAccount = await getOrCreateSystemAccount(SYSTEM_REVENUE_ACCOUNT_NUMBER, 'FEES');

  await createLedgerEntriesForTransaction({
    transactionId,
    narration: description,
    entries: [
      { accountId: depositsAccount.id, type: 'DEBIT', amount: Number(amount) },
      { accountId: doctorAccount.id, type: 'CREDIT', amount: doctorNet },
      { accountId: revenueAccount.id, type: 'CREDIT', amount: commission },
    ],
  });

  return { doctorAccountId: doctorAccount.id, doctorNet, commission };
};

export default {
  creditWalletLedger,
  debitWalletLedger,
  creditDoctorForAppointment,
};
