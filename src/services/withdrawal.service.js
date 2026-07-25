// src/services/withdrawal.service.js
//
// Fixed: this called createMultiEntry({ debitAccountId, creditAccountId, ... })
// but createMultiEntry only ever accepted an `entries` array — `entries`
// would have been undefined and crashed immediately on `entries.filter`.
// Also added null-checks for missing accounts and passed userId through.
import { prisma } from '../config/prisma.js';
import { createMultiEntry } from './doubleLedger.service.js';
import { getAccountBalance } from './balance.service.js';
import { sendPayout } from './payout.service.js';

const SYSTEM_PAYOUT_ACCOUNT_NUMBER = 'SYSTEM_PAYOUT';

export const withdrawFunds = async ({
  userId,
  amount,
  bankCode,
  accountNumber,
  accountName,
}) => {
  const userAccount = await prisma.account.findFirst({ where: { userId } });
  if (!userAccount) throw new Error('User account not found');

  const systemAccount = await prisma.account.findFirst({
    where: { accountNumber: SYSTEM_PAYOUT_ACCOUNT_NUMBER },
  });
  if (!systemAccount) {
    throw new Error(
      `System account "${SYSTEM_PAYOUT_ACCOUNT_NUMBER}" is not set up — run the seed script (npm run seed)`
    );
  }

  const balance = await getAccountBalance(userAccount.id);

  if (balance < amount) {
    throw new Error('Insufficient balance');
  }

  const reference = `WDR_${Date.now()}`;

  // STEP 1: Ledger debit (user -> system, pending payout)
  await createMultiEntry({
    reference,
    userId,
    type: 'PAYMENT',
    channel: 'BANK_TRANSFER',
    narration: 'Withdrawal',
    entries: [
      { accountId: userAccount.id, type: 'DEBIT', amount },
      { accountId: systemAccount.id, type: 'CREDIT', amount },
    ],
  });

  try {
    // STEP 2: Call PalmPay
    const payout = await sendPayout({
      amount,
      accountNumber,
      bankCode,
      name: accountName,
      reference,
    });

    return payout;
  } catch (err) {
    // STEP 3: Reverse if failed
    await createMultiEntry({
      reference: `${reference}_REV`,
      userId,
      type: 'REFUND',
      channel: 'BANK_TRANSFER',
      narration: 'Withdrawal reversal',
      entries: [
        { accountId: systemAccount.id, type: 'DEBIT', amount },
        { accountId: userAccount.id, type: 'CREDIT', amount },
      ],
    });

    throw new Error('Payout failed, transaction reversed');
  }
};
