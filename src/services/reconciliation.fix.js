// src/services/reconciliation.fix.js
//
// Fixed: queried Account by a `name` field that doesn't exist on the model
// (it's `accountNumber`), and called createMultiEntry with the old
// debitAccountId/creditAccountId shape instead of an entries array.
import { prisma } from '../config/prisma.js';
import { createMultiEntry } from './doubleLedger.service.js';

export const fixMissingTransaction = async (txn) => {
  const walletAccount = await prisma.account.findFirst({
    where: { accountNumber: txn.accountNumber },
  });

  const systemAccount = await prisma.account.findFirst({
    where: { type: 'SYSTEM' },
  });

  if (!walletAccount || !systemAccount) return;

  await createMultiEntry({
    reference: txn.reference,
    userId: walletAccount.userId,
    type: 'PAYMENT',
    channel: 'WALLET',
    narration: 'Reconciliation fix',
    entries: [
      { accountId: systemAccount.id, type: 'DEBIT', amount: txn.amount },
      { accountId: walletAccount.id, type: 'CREDIT', amount: txn.amount },
    ],
  });
};
