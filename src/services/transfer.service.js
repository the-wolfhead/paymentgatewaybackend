// src/services/transfer.service.js
//
// Fixed: this used `prisma` throughout but never imported it — every call
// would have thrown "prisma is not defined". Also added null-checks (sender/
// receiver/revenue accounts may not exist) and passed the now-required
// userId/channel to createMultiEntry.
import { prisma } from '../config/prisma.js';
import { FEES } from '../config/fees.js';
import { createMultiEntry } from './doubleLedger.service.js';

const SYSTEM_REVENUE_ACCOUNT_NUMBER = 'SYSTEM_REVENUE';

export const transferFunds = async ({ senderId, receiverId, amount }) => {
  const sender = await prisma.account.findFirst({ where: { userId: senderId } });
  if (!sender) throw new Error('Sender account not found');

  const receiver = await prisma.account.findFirst({ where: { userId: receiverId } });
  if (!receiver) throw new Error('Receiver account not found');

  const revenue = await prisma.account.findFirst({
    where: { accountNumber: SYSTEM_REVENUE_ACCOUNT_NUMBER },
  });
  if (!revenue) {
    throw new Error(
      `System account "${SYSTEM_REVENUE_ACCOUNT_NUMBER}" is not set up — run the seed script (npm run seed)`
    );
  }

  const fee = amount * FEES.TRANSFER_PERCENT;
  const receiverAmount = amount - fee;

  const reference = `TRF_${Date.now()}`;

  await createMultiEntry({
    reference,
    userId: senderId,
    type: 'PAYMENT',
    channel: 'WALLET',
    narration: 'Transfer with fee',
    entries: [
      { accountId: sender.id, type: 'DEBIT', amount },
      { accountId: receiver.id, type: 'CREDIT', amount: receiverAmount },
      { accountId: revenue.id, type: 'CREDIT', amount: fee },
    ],
  });

  return reference;
};
