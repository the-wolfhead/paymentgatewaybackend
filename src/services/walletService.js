// src/services/walletService.js
import { prisma } from '../config/prisma.js';

/**
 * Credit user wallet using double-entry ledger system
 */
export const creditWalletLedger = async ({
  userId,
  amount,
  reference,
  description,
  gateway = 'PALMPAY',
  metadata = {},
}) => {
  const requestId = `LEDGER_${Date.now()}`;

  try {
    if (!userId || !amount || amount <= 0) {
      throw new Error('Invalid wallet credit parameters');
    }

    console.log(`[${requestId}] Crediting wallet for user ${userId} | Amount: ₦${amount}`);

    // Use Prisma transaction for atomicity (double-entry)
    const result = await prisma.$transaction(async (tx) => {
      // 1. Credit the user's main wallet balance
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: {
            increment: amount,
          },
          updatedAt: new Date(),
        },
      });

      // 2. Create Ledger Entry (Double-entry accounting)
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          userId,
          type: 'CREDIT',
          amount,
          reference,
          description,
          gateway,
          balanceAfter: wallet.balance,
          metadata,
        },
      });

      return { wallet, ledgerEntry };
    });

    console.log(`[${requestId}] Wallet credited successfully. New balance: ₦${result.wallet.balance}`);

    return result;

  } catch (error) {
    console.error(`[${requestId}] Wallet Credit Failed:`, error);

    if (error.code === 'P2025') {
      throw new Error('Wallet not found for this user');
    }

    throw error;
  }
};

/**
 * Debit wallet (for future withdrawals/transfers)
 */
export const debitWalletLedger = async ({
  userId,
  amount,
  reference,
  description,
  gateway = 'SYSTEM',
  metadata = {},
}) => {
  // Similar logic but with DEBIT and decrement
  // I'll create this when you're ready for withdrawals
  throw new Error('Debit function not implemented yet');
};

export default {
  creditWalletLedger,
  debitWalletLedger,
};
