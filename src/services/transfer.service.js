import { prisma } from '../config/prisma.js';
import { createDoubleEntry } from './doubleLedger.service.js';
import { getAccountBalance } from './balance.service.js';

export const transferFunds = async ({ senderId, receiverId, amount }) => {
  const sender = await prisma.account.findFirst({ where: { userId: senderId } });
  const receiver = await prisma.account.findFirst({ where: { userId: receiverId } });

  const balance = await getAccountBalance(sender.id);
  if (balance < amount) throw new Error('Insufficient funds');

  return createDoubleEntry({
    debitAccountId: sender.id,
    creditAccountId: receiver.id,
    amount,
    reference: `TRF_${Date.now()}`,
    narration: 'Transfer',
  });
};
