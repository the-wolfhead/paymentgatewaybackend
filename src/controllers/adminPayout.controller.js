import {
  createAdminPayout,
  createAdminPayoutBatch,
  listAdminPayouts,
  getAdminPayoutStatus,
  palmPayQueryBankList,
  palmPayQueryBankAccount,
  palmPayQueryMerchantBalance,
} from '../services/adminPayout.service.js';

export const createPayout = async (req, res, next) => {
  try {
    const initiatedBy = req.user?.id;
    const {
      amount,
      bankCode,
      accountNumber,
      accountName,
      phone,
      category,
      narration,
      beneficiaryName,
      employeeId,
      metadata,
    } = req.body;

    const data = await createAdminPayout({
      initiatedBy,
      amount,
      bankCode,
      accountNumber,
      accountName,
      phone,
      category,
      narration,
      beneficiaryName,
      employeeId,
      metadata,
    });

    res.status(201).json({
      message:
        data.status === 'SUCCESS'
          ? 'Payout completed'
          : 'Payout submitted — pending confirmation',
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const createPayoutBatch = async (req, res, next) => {
  try {
    const initiatedBy = req.user?.id;
    const { items, category, batchLabel } = req.body;

    const data = await createAdminPayoutBatch({
      initiatedBy,
      items,
      category,
      batchLabel,
    });

    res.status(201).json({
      message: `Batch finished: ${data.succeeded} ok, ${data.failed} failed`,
      data,
    });
  } catch (err) {
    next(err);
  }
};

export const listPayouts = async (req, res, next) => {
  try {
    const data = await listAdminPayouts({
      page: req.query.page,
      pageSize: req.query.pageSize,
      category: req.query.category,
      status: req.query.status,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const payoutStatus = async (req, res, next) => {
  try {
    const data = await getAdminPayoutStatus(req.params.reference);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

export const listPayoutBanks = async (req, res, next) => {
  try {
    const banks = await palmPayQueryBankList(0);
    res.json({ banks });
  } catch (err) {
    next(err);
  }
};

export const resolvePayoutAccount = async (req, res, next) => {
  try {
    const { bankCode, accountNumber } = req.body;
    if (!bankCode || !accountNumber) {
      return res.status(400).json({ message: 'bankCode and accountNumber are required' });
    }
    const result = await palmPayQueryBankAccount({
      bankCode,
      bankAccNo: accountNumber,
    });
    if (!result.success) {
      return res.status(400).json({
        message: result.errorMessage || 'Could not resolve account',
        data: result,
      });
    }
    res.json({
      accountName: result.accountName,
      bankCode,
      accountNumber,
    });
  } catch (err) {
    next(err);
  }
};

export const merchantBalance = async (req, res, next) => {
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
