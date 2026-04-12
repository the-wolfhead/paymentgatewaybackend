
import { prisma } from '../config/prisma.js';

export const reconcile = async (externalTxns) => {
  for (const txn of externalTxns) {
    const local = await prisma.transaction.findUnique({ where: { reference: txn.reference } });

    let status = 'MATCHED';
    if (!local) status = 'MISSING';
    else if (local.amount !== txn.amount) status = 'MISMATCH';

    await prisma.reconciliationLog.create({
      data: {
        reference: txn.reference,
        palmpayAmount: txn.amount,
        ledgerAmount: local?.amount || 0,
        status,
      },
    });
  }
};
