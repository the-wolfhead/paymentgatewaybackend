// src/services/transfer.service.js

import { FEES } from "../config/fees.js";
import { createMultiEntry } from "./doubleLedger.service.js";

export const transferFunds = async ({ senderId, receiverId, amount }) => {
  const sender = await prisma.account.findFirst({ where: { userId: senderId } });
  const receiver = await prisma.account.findFirst({ where: { userId: receiverId } });
  const revenue = await prisma.account.findFirst({
    where: { accountNumber: "SYSTEM_REVENUE" },
  });

  const fee = amount * FEES.TRANSFER_PERCENT;
  const receiverAmount = amount - fee;

  const reference = `TRF_${Date.now()}`;

  await createMultiEntry({
    reference,
    narration: "Transfer with fee",
    entries: [
      { accountId: sender.id, type: "DEBIT", amount },
      { accountId: receiver.id, type: "CREDIT", amount: receiverAmount },
      { accountId: revenue.id, type: "CREDIT", amount: fee },
    ],
  });

  return reference;
};
