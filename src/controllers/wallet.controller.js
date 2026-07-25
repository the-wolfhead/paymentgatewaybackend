import { prisma } from '../config/prisma.js';
import { getAccountBalance } from '../services/balance.service.js';

export const getBalance = async (req, res, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId: req.user.id },
    });

    if (!account) {
      return res.json({ balance: 0 });
    }

    const balance = await getAccountBalance(account.id);

    res.json({ balance });
  } catch (err) {
    next(err);
  }
};

export const getTransactions = async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ transactions });
  } catch (err) {
    next(err);
  }
};
