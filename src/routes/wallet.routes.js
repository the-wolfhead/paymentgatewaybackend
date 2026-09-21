import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  getBalance,
  getTransactions,
  getMerchantPalmPayBalance,
} from '../controllers/wallet.controller.js';

const router = express.Router();

/** Authenticated user ledger balance */
router.get('/balance', authMiddleware, getBalance);
router.get('/transactions', authMiddleware, getTransactions);

/**
 * PalmPay merchant account balance (platform float).
 * Requires auth — typically used by staff tools or server-side ops.
 */
router.get('/merchant-balance', authMiddleware, getMerchantPalmPayBalance);

export default router;
