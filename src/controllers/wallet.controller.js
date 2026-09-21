import { prisma } from '../config/prisma.js';
import { getAccountBalance } from '../services/balance.service.js';
import { palmPayQueryMerchantBalance } from '../services/palmpayService.js';

/** User wallet balance from internal double-entry ledger */
export const getBalance = async (req, res, next) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId: req.user.id },
    });

    if (!account) {
      return res.json({ balance: 0, currency: 'NGN', source: 'ledger' });
    }

    const balance = await getAccountBalance(account.id);

    res.json({
      balance: Number(balance),
      currency: 'NGN',
      accountId: account.id,
      source: 'ledger',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PalmPay merchant float (platform settlement balance).
 * Restricted to admin/staff tokens when used from admin routes;
 * also exposed here for service operators with a valid user JWT if enabled.
 */
export const getMerchantPalmPayBalance = async (req, res, next) => {
  try {
    const data = await palmPayQueryMerchantBalance();
    res.json({
      source: 'palmpay',
      currency: data.currency,
      availableBalance: data.availableBalance,
      frozenBalance: data.frozenBalance,
      currentBalance: data.currentBalance,
      unSettleBalance: data.unSettleBalance,
    });
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
