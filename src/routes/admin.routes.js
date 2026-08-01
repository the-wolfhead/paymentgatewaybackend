// src/routes/admin.routes.js
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

const router = express.Router();

// Every route requires a valid admin-dashboard JWT (issued by the ZHS
// backend) with some staff role, plus per-route checks below.
router.use(verifyAdminToken, requireRole(...ANY_STAFF));

router.get('/stats', getStats);
router.get('/reconciliation-logs', requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'FINANCE', 'AUDITOR'), getReconciliationLogs);

router.get('/transactions', requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'CUSTOMER_CARE', 'FINANCE', 'AUDITOR'), getAllTransactions);
router.get('/transactions/:reference', requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'CUSTOMER_CARE', 'FINANCE', 'AUDITOR'), getTransactionDetail);
router.post('/transactions/:reference/retry', requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'FINANCE'), retryTransaction);
router.post('/transactions/:reference/mark-failed', requireRole('SUPER_ADMIN', 'TECH_SUPPORT', 'FINANCE'), markTransactionFailed);

router.get('/accounts', requireRole('SUPER_ADMIN', 'FINANCE', 'AUDITOR'), listAccounts);

export default router;
