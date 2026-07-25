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

const SYSTEM_DEPOSITS_ACCOUNT_NUMBER = 'SYSTEM_DEPOSITS';

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

export default {
  creditWalletLedger,
  debitWalletLedger,
};
