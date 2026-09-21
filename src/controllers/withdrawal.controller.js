import {
  withdrawFunds,
  getWithdrawalStatus,
} from '../services/withdrawal.service.js';
import {
  palmPayQueryBankList,
  palmPayQueryBankAccount,
} from '../services/palmpayService.js';

export const withdraw = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, bankCode, accountNumber, accountName, phone } = req.body;

    if (amount == null || !bankCode || !accountNumber) {
      return res.status(400).json({
        message: 'amount, bankCode, and accountNumber are required',
      });
    }

    const result = await withdrawFunds({
      userId,
      amount,
      bankCode,
      accountNumber,
      accountName,
      phone,
    });

    res.status(201).json({
      message:
        result.status === 'SUCCESS'
          ? 'Withdrawal completed'
          : 'Withdrawal submitted — pending PalmPay confirmation',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const withdrawalStatus = async (req, res, next) => {
  try {
    const data = await getWithdrawalStatus(req.params.reference, req.user.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

export const listBanks = async (req, res, next) => {
  try {
    const banks = await palmPayQueryBankList(0);
    res.json({ banks });
  } catch (err) {
    next(err);
  }
};

export const resolveAccount = async (req, res, next) => {
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
        message: result.errorMessage || 'Could not resolve account name',
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
