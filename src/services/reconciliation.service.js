// src/services/reconciliation.service.js
//
// Fixed: `local.amount !== txn.amount` compared a Prisma Decimal object
// against a plain number with strict inequality, which is essentially always
// true regardless of the actual values — every matching transaction would
// have been logged as a MISMATCH.
import { prisma } from '../config/prisma.js';

export const reconcile = async (externalTxns) => {
  for (const txn of externalTxns) {
    const local = await prisma.transaction.findUnique({ where: { reference: txn.reference } });

    let status = 'MATCHED';
    if (!local) {
      status = 'MISSING';
    } else if (Number(local.amount) !== Number(txn.amount)) {
      status = 'MISMATCH';
    }

    await prisma.reconciliationLog.create({
      data: {
        reference: txn.reference,
        palmpayAmount: txn.amount,
        ledgerAmount: local?.amount || 0,
        difference: Number(txn.amount) - Number(local?.amount || 0),
        status,
      },
    });
  }
};
