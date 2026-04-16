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

export const releaseEscrow = async (reference) => {
  const escrowRecord = await prisma.escrow.findUnique({
    where: { reference },
  });

  if (!escrowRecord) throw new Error("Escrow not found");
  if (escrowRecord.status !== "PENDING")
    throw new Error("Already processed");

  const escrowAccount = await prisma.account.findFirst({
    where: { accountNumber: "ESCROW_ACCOUNT" },
  });

  const sellerAccount = await prisma.account.findFirst({
    where: { userId: escrowRecord.sellerId },
  });

  // Move funds to seller
  await createDoubleEntry({
    debitAccountId: escrowAccount.id,
    creditAccountId: sellerAccount.id,
    amount: escrowRecord.amount,
    reference: `REL_${reference}`,
    narration: "Escrow release",
  });

  await prisma.escrow.update({
    where: { reference },
    data: { status: "RELEASED" },
  });
};

export const cancelEscrow = async (reference) => {
  const escrowRecord = await prisma.escrow.findUnique({
    where: { reference },
  });

  if (!escrowRecord) throw new Error("Escrow not found");
  if (escrowRecord.status !== "PENDING")
    throw new Error("Already processed");

  const escrowAccount = await prisma.account.findFirst({
    where: { accountNumber: "ESCROW_ACCOUNT" },
  });

  const buyerAccount = await prisma.account.findFirst({
    where: { userId: escrowRecord.buyerId },
  });

  // Refund buyer
  await createDoubleEntry({
    debitAccountId: escrowAccount.id,
    creditAccountId: buyerAccount.id,
    amount: escrowRecord.amount,
    reference: `REF_${reference}`,
    narration: "Escrow refund",
  });

  await prisma.escrow.update({
    where: { reference },
    data: { status: "CANCELLED" },
  });
};
