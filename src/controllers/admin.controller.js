import { prisma } from '../config/prisma.js';
import { creditWalletLedger } from '../services/walletService.js';
import { notifyBackendZHS } from '../services/notificationService.js';
import { getAccountBalance } from '../services/balance.service.js';

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

/* ================================
   📊 Dashboard stats
================================== */
export const getStats = async (req, res, next) => {
  try {
    const [total, pending, success, failed] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'PENDING' } }),
      prisma.transaction.count({ where: { status: 'SUCCESS' } }),
      prisma.transaction.count({ where: { status: 'FAILED' } }),
    ]);

    const volumeAgg = await prisma.transaction.aggregate({
      where: { status: 'SUCCESS' },
      _sum: { amount: true },
    });

    res.json({
      total,
      pending,
      success,
      failed,
      totalVolume: Number(volumeAgg._sum.amount || 0),
    });
  } catch (err) {
    next(err);
  }
};

/* ================================
   💳 Transactions
================================== */
export const getAllTransactions = async (req, res, next) => {
  try {
    const { search = '', status, page = 1, pageSize = 20 } = req.query;
    const take = Math.min(Number(pageSize) || 20, 100);
    const skip = (Number(page) - 1) * take;

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { userId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page: Number(page), pageSize: take });
  } catch (err) {
    next(err);
  }
};

export const getTransactionDetail = async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { reference: req.params.reference },
    });
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
};

/**
 * Re-runs the same crediting logic the webhook uses, for a transaction
 * that's stuck PENDING (e.g. the webhook never arrived, or arrived and
 * failed for a since-fixed reason). Also re-attempts notifying ZHS to
 * create the appointment, if this was an appointment payment.
 */
export const retryTransaction = async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { reference: req.params.reference },
    });

    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    if (transaction.status === 'SUCCESS') {
      return res.status(400).json({ error: 'Transaction has already succeeded' });
    }

    if (transaction.meta?.purpose === 'WALLET_TOPUP') {
      try {
        await creditWalletLedger({
          userId: transaction.userId,
          amount: Number(transaction.amount),
          transactionId: transaction.id,
          description: `Manually retried by admin ${req.user.id}`,
        });
      } catch (ledgerErr) {
        console.error('Retry: ledger credit failed', ledgerErr.message);
      }
    }

    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        meta: {
          ...(transaction.meta || {}),
          manuallyRetriedBy: req.user.id,
          manuallyRetriedAt: new Date().toISOString(),
        },
      },
    });

    if (transaction.meta?.doctor || transaction.meta?.doctorId) {
      try {
        await notifyBackendZHS({
          userId: transaction.userId,
          doctorId: transaction.meta.doctor?.id || transaction.meta.doctorId,
          patientName: transaction.meta.patientName,
          date: transaction.meta.date,
          time: transaction.meta.time,
          fee: transaction.amount,
          paymentReference: transaction.reference,
          paymentGateway: 'PALMPAY',
          metadata: transaction.meta,
        });
      } catch (notifyErr) {
        console.error('Retry: failed to notify ZHS backend', notifyErr.message);
      }
    }

    res.json({ message: 'Transaction marked SUCCESS and reprocessed', transaction: updated });
  } catch (err) {
    next(err);
  }
};

export const markTransactionFailed = async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.update({
      where: { reference: req.params.reference },
      data: { status: 'FAILED' },
    });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
};

/* ================================
   🏦 Accounts / balances
================================== */
export const listAccounts = async (req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({ orderBy: { createdAt: 'desc' } });

    const withBalances = await Promise.all(
      accounts.map(async (acc) => ({
        ...acc,
        balance: await getAccountBalance(acc.id),
      }))
    );

    res.json(withBalances);
  } catch (err) {
    next(err);
  }
};
