import { prisma } from '../config/prisma.js';
import { getAccountBalance } from '../services/balance.service.js';

export const getBalance = async (req, res, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId: req.user.id },
    });

    const balance = await getAccountBalance(account.id);

    res.json({ balance });
  } catch (err) {
    next(err);
  }
};
