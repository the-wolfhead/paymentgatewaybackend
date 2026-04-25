import { prisma } from "../config/prisma.js";

export const createMultiEntry = async ({
  entries,
  reference,
  narration,
  type,
  fee = 0,
}) => {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.transaction.findUnique({
      where: { reference },
    });

    if (exists) {
      throw new Error("Duplicate transaction reference");
    }

    const totalDebit = entries
      .filter((e) => e.type === "DEBIT")
      .reduce((sum, e) => sum + e.amount, 0);

    const totalCredit = entries
      .filter((e) => e.type === "CREDIT")
      .reduce((sum, e) => sum + e.amount, 0);

    if (totalDebit !== totalCredit) {
      throw new Error("Unbalanced transaction");
    }

    await tx.ledgerEntry.createMany({
      data: entries.map((e) => ({
        accountId: e.accountId,
        entryType: e.type,
        amount: e.amount,
        reference,
        narration,
      })),
    });

    await tx.transaction.create({
      data: {
        reference,
        amount: totalDebit,
        fee,
        type,
        status: "SUCCESS",
      },
    });

    return { reference };
  });
};
