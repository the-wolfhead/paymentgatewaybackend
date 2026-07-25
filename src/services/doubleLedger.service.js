// src/services/doubleLedger.service.js
//
// This previously did not match prisma/schema.prisma at all:
//  - LedgerEntry.createMany() was missing the required `transactionId` field
//    and set nonexistent fields (`reference`).
//  - Transaction.create() was missing required fields (`id`, `userId`,
//    `channel`) and set a `fee` field that doesn't exist on the model.
//  - Ledger entries were also created *before* the Transaction they point to
//    existed, which is backwards given transactionId is a required FK.
// Every caller of createMultiEntry would have thrown a Prisma validation
// error. Rewritten below to match the real schema.
import { prisma } from '../config/prisma.js';

/**
 * Atomically creates a brand-new Transaction plus its balanced set of
 * LedgerEntry rows (double-entry bookkeeping: total debits must equal total
 * credits). Use this when no Transaction row exists yet for this operation
 * (transfers, withdrawals, escrow).
 *
 * @param {Object} params
 * @param {{accountId: string, type: 'DEBIT'|'CREDIT', amount: number}[]} params.entries
 * @param {string} params.reference - unique external reference, also used as the Transaction id
 * @param {string} params.userId - the user this transaction belongs to
 * @param {string} [params.narration]
 * @param {'TOPUP'|'PAYMENT'|'REFUND'} [params.type]
 * @param {'CARD'|'BANK_TRANSFER'|'USSD'|'WALLET'} [params.channel]
 */
export const createMultiEntry = async ({
  entries,
  reference,
  userId,
  narration,
  type = 'PAYMENT',
  channel = 'WALLET',
}) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('createMultiEntry: `entries` array is required');
  }
  if (!reference) {
    throw new Error('createMultiEntry: `reference` is required');
  }
  if (!userId) {
    throw new Error('createMultiEntry: `userId` is required');
  }

  return prisma.$transaction(async (tx) => {
    const exists = await tx.transaction.findUnique({ where: { reference } });
    if (exists) {
      throw new Error('Duplicate transaction reference');
    }

    const totalDebit = entries
      .filter((e) => e.type === 'DEBIT')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalCredit = entries
      .filter((e) => e.type === 'CREDIT')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // Compare with a small epsilon since these can arrive as floats
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error('Unbalanced transaction: debits must equal credits');
    }

    const transactionRecord = await tx.transaction.create({
      data: {
        id: reference,
        userId,
        type,
        channel,
        amount: totalDebit,
        currency: 'NGN',
        status: 'SUCCESS',
        reference,
        meta: narration ? { narration } : undefined,
      },
    });

    await tx.ledgerEntry.createMany({
      data: entries.map((e) => ({
        transactionId: transactionRecord.id,
        accountId: e.accountId,
        entryType: e.type,
        amount: e.amount,
        narration,
      })),
    });

    return { reference, transactionId: transactionRecord.id };
  });
};

/**
 * Adds balanced ledger entries against an EXISTING Transaction row. Use this
 * when the Transaction was already created earlier (e.g. a deposit is
 * created as PENDING when the user initiates payment, then this is called
 * from the webhook once PalmPay confirms success) — creating a *second*
 * Transaction for the same reference would collide with the duplicate-check
 * above.
 *
 * @param {Object} params
 * @param {string} params.transactionId
 * @param {{accountId: string, type: 'DEBIT'|'CREDIT', amount: number}[]} params.entries
 * @param {string} [params.narration]
 */
export const createLedgerEntriesForTransaction = async ({
  transactionId,
  entries,
  narration,
}) => {
  if (!transactionId) {
    throw new Error('createLedgerEntriesForTransaction: `transactionId` is required');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('createLedgerEntriesForTransaction: `entries` array is required');
  }

  const totalDebit = entries
    .filter((e) => e.type === 'DEBIT')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const totalCredit = entries
    .filter((e) => e.type === 'CREDIT')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error('Unbalanced transaction: debits must equal credits');
  }

  return prisma.ledgerEntry.createMany({
    data: entries.map((e) => ({
      transactionId,
      accountId: e.accountId,
      entryType: e.type,
      amount: e.amount,
      narration,
    })),
  });
};

export default { createMultiEntry, createLedgerEntriesForTransaction };
