import { prisma } from '../config/prisma.js';

export const createDoubleEntry = async ({ debitAccountId, creditAccountId, amount, reference, narration }) => {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.transaction.findUnique({ where: { reference } });
    if (exists) return;

    await tx.ledgerEntry.createMany({
      data: [
        { accountId: debitAccountId, entryType: 'DEBIT', amount, reference, narration },
        { accountId: creditAccountId, entryType: 'CREDIT', amount, reference, narration },
      ],
    });

    await tx.transaction.create({
      data: { reference, amount, status: 'SUCCESS' },
    });
  });
};
