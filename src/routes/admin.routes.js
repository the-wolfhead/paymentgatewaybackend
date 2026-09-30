import express from 'express';
import { verifyAdminToken, requireRole, ANY_STAFF } from '../middleware/adminAuth.middleware.js';
import {
  getReconciliationLogs,
  getAllTransactions,
  getStats,
  getTransactionDetail,
  retryTransaction,
  markTransactionFailed,
  listAccounts,
} from '../controllers/admin.controller.js';
import {
  createPayout,
  createPayoutBatch,
  listPayouts,
  payoutStatus,
  listPayoutBanks,
  resolvePayoutAccount,
  merchantBalance,
} from '../controllers/adminPayout.controller.js';

const router = express.Router();

router.use(verifyAdminToken, requireRole(...ANY_STAFF));

router.get('/stats', getStats);
router.get(
  '/reconciliation-logs',
  requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'FINANCE', 'AUDITOR'),
  getReconciliationLogs
);

router.get(
  '/transactions',
  requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'CUSTOMER_CARE', 'FINANCE', 'AUDITOR'),
  getAllTransactions
);
router.get(
  '/transactions/:reference',
  requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'CUSTOMER_CARE', 'FINANCE', 'AUDITOR'),
  getTransactionDetail
);
router.post(
  '/transactions/:reference/retry',
  requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'FINANCE'),
  retryTransaction
);
router.post(
  '/transactions/:reference/mark-failed',
  requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'FINANCE'),
  markTransactionFailed
);

router.get('/accounts', requireRole('SUPER_ADMIN', 'FINANCE', 'AUDITOR'), listAccounts);

router.get(
  '/merchant-balance',
  requireRole('SUPER_ADMIN', 'FINANCE', 'AUDITOR', 'TECH_SUPPORT'),
  merchantBalance
);

// ── Admin payouts (salary, payroll, vendor, services) ──────────────────────
const PAYOUT_ROLES = ['SUPER_ADMIN', 'FINANCE'];

router.get('/payouts', requireRole(...PAYOUT_ROLES, 'AUDITOR', 'TECH_SUPPORT'), listPayouts);
router.get('/payouts/banks', requireRole(...PAYOUT_ROLES, 'AUDITOR', 'TECH_SUPPORT'), listPayoutBanks);
router.post('/payouts/resolve-account', requireRole(...PAYOUT_ROLES), resolvePayoutAccount);
router.get('/payouts/:reference', requireRole(...PAYOUT_ROLES, 'AUDITOR', 'TECH_SUPPORT'), payoutStatus);
router.post('/payouts', requireRole(...PAYOUT_ROLES), createPayout);
router.post('/payouts/batch', requireRole(...PAYOUT_ROLES), createPayoutBatch);

export default router;
