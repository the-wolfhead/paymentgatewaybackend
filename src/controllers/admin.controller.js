import { prisma } from '../config/prisma.js';

export const getReconciliationLogs = async (req, res, next) => {
  try {
    const logs = await prisma.reconciliationLog.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
};

export const getAllTransactions = async (req, res, next) => {
  try {
    const txns = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json(txns);
  } catch (err) {
    next(err);
  }
};
