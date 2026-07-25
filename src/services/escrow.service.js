// src/services/escrow.service.js
//
// Fixed: same createMultiEntry call-shape mismatch as withdrawal.service.js
// (debitAccountId/creditAccountId instead of an entries array), plus
// null-checks for missing accounts and userId passed through.
import { prisma } from '../config/prisma.js';
import { createMultiEntry } from './doubleLedger.service.js';
import { getAccountBalance } from './balance.service.js';

const ESCROW_ACCOUNT_NUMBER = 'ESCROW_ACCOUNT';

async function getEscrowSystemAccount() {
  const account = await prisma.account.findFirst({
    where: { accountNumber: ESCROW_ACCOUNT_NUMBER },
  });
  if (!account) {
    throw new Error(
      `System account "${ESCROW_ACCOUNT_NUMBER}" is not set up — run the seed script (npm run seed)`
    );
  }
  return account;
}

export const createEscrow = async ({ buyerId, sellerId, amount }) => {
  const buyer = await prisma.account.findFirst({ where: { userId: buyerId } });
  if (!buyer) throw new Error('Buyer account not found');

  const escrow = await getEscrowSystemAccount();

  const balance = await getAccountBalance(buyer.id);
  if (balance < amount) throw new Error('Insufficient balance');

  const reference = `ESC_${Date.now()}`;

  // Move money to escrow
  await createMultiEntry({
    reference,
    userId: buyerId,
    type: 'PAYMENT',
    channel: 'WALLET',
    narration: 'Escrow funding',
    entries: [
      { accountId: buyer.id, type: 'DEBIT', amount },
      { accountId: escrow.id, type: 'CREDIT', amount },
    ],
  });

  await prisma.escrow.create({
    data: {
      buyerId,
      sellerId,
      amount,
      reference,
      status: 'PENDING',
    },
  });

  return reference;
};

export const releaseEscrow = async (reference) => {
  const escrowRecord = await prisma.escrow.findUnique({ where: { reference } });

  if (!escrowRecord) throw new Error('Escrow not found');
  if (escrowRecord.status !== 'PENDING') throw new Error('Already processed');

  const escrowAccount = await getEscrowSystemAccount();

  const sellerAccount = await prisma.account.findFirst({
    where: { userId: escrowRecord.sellerId },
  });
  if (!sellerAccount) throw new Error('Seller account not found');

  // Move funds to seller
  await createMultiEntry({
    reference: `REL_${reference}`,
    userId: escrowRecord.sellerId,
    type: 'PAYMENT',
    channel: 'WALLET',
    narration: 'Escrow release',
    entries: [
      { accountId: escrowAccount.id, type: 'DEBIT', amount: escrowRecord.amount },
      { accountId: sellerAccount.id, type: 'CREDIT', amount: escrowRecord.amount },
    ],
  });

  await prisma.escrow.update({
    where: { reference },
    data: { status: 'RELEASED' },
  });
};

export const cancelEscrow = async (reference) => {
  const escrowRecord = await prisma.escrow.findUnique({ where: { reference } });

  if (!escrowRecord) throw new Error('Escrow not found');
  if (escrowRecord.status !== 'PENDING') throw new Error('Already processed');

  const escrowAccount = await getEscrowSystemAccount();

  const buyerAccount = await prisma.account.findFirst({
    where: { userId: escrowRecord.buyerId },
  });
  if (!buyerAccount) throw new Error('Buyer account not found');

  // Refund buyer
  await createMultiEntry({
    reference: `REF_${reference}`,
    userId: escrowRecord.buyerId,
    type: 'REFUND',
    channel: 'WALLET',
    narration: 'Escrow refund',
    entries: [
      { accountId: escrowAccount.id, type: 'DEBIT', amount: escrowRecord.amount },
      { accountId: buyerAccount.id, type: 'CREDIT', amount: escrowRecord.amount },
    ],
  });

  await prisma.escrow.update({
    where: { reference },
    data: { status: 'CANCELLED' },
  });
};
