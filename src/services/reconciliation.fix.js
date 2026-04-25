// src/services/reconciliation.fix.js

import { prisma } from "../config/prisma.js";
import { createMultiEntry } from "./doubleLedger.service.js";

export const fixMissingTransaction = async (txn) => {
  const walletAccount = await prisma.account.findFirst({
    where: { name: txn.accountNumber },
  });

  const systemAccount = await prisma.account.findFirst({
    where: { type: "SYSTEM" },
  });

  if (!walletAccount || !systemAccount) return;

  await createMultiEntry({
    debitAccountId: systemAccount.id,
    creditAccountId: walletAccount.id,
    amount: txn.amount,
    reference: txn.reference,
    narration: "Reconciliation fix",
  });
};
