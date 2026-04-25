// src/services/withdrawal.service.js

import { prisma } from "../config/prisma.js";
import { createMultiEntry } from "./doubleLedger.service.js";
import { getAccountBalance } from "./balance.service.js";
import { sendPayout } from "./payout.service.js";

export const withdrawFunds = async ({
  userId,
  amount,
  bankCode,
  accountNumber,
  accountName,
}) => {
  const userAccount = await prisma.account.findFirst({
    where: { userId },
  });

  const systemAccount = await prisma.account.findFirst({
    where: { accountNumber: "SYSTEM_PAYOUT" },
  });

  const balance = await getAccountBalance(userAccount.id);

  if (balance < amount) {
    throw new Error("Insufficient balance");
  }

  const reference = `WDR_${Date.now()}`;

  // STEP 1: Ledger debit
  await createMultiEntry({
    debitAccountId: userAccount.id,
    creditAccountId: systemAccount.id,
    amount,
    reference,
    narration: "Withdrawal",
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
      debitAccountId: systemAccount.id,
      creditAccountId: userAccount.id,
      amount,
      reference: `${reference}_REV`,
      narration: "Withdrawal reversal",
    });

    throw new Error("Payout failed, transaction reversed");
  }
};
