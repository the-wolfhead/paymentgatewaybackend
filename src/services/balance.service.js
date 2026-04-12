import { prisma } from '../config/prisma.js';

export const getAccountBalance = async (accountId) => {
  const credit = await prisma.ledgerEntry.aggregate({ where: { accountId, entryType: 'CREDIT' }, _sum: { amount: true } });
  const debit = await prisma.ledgerEntry.aggregate({ where: { accountId, entryType: 'DEBIT' }, _sum: { amount: true } });

  return (credit._sum.amount || 0) - (debit._sum.amount || 0);
};
