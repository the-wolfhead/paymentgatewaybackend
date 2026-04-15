// src/services/escrow.service.js

import { prisma } from "../config/prisma.js";
import { createDoubleEntry } from "./doubleLedger.service.js";
import { getAccountBalance } from "./balance.service.js";

export const createEscrow = async ({ buyerId, sellerId, amount }) => {
  const buyer = await prisma.account.findFirst({ where: { userId: buyerId } });
  const escrow = await prisma.account.findFirst({
    where: { accountNumber: "ESCROW_ACCOUNT" },
  });

  const balance = await getAccountBalance(buyer.id);

  if (balance < amount) throw new Error("Insufficient balance");

  const reference = `ESC_${Date.now()}`;

  // Move money to escrow
  await createDoubleEntry({
    debitAccountId: buyer.id,
    creditAccountId: escrow.id,
    amount,
    reference,
    narration: "Escrow funding",
  });

  await prisma.escrow.create({
    data: {
      buyerId,
      sellerId,
      amount,
      reference,
      status: "PENDING",
    },
  });

  return reference;
};
