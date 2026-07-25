// src/routes/admin.routes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getReconciliationLogs, getAllTransactions } from '../controllers/admin.controller.js';

const router = express.Router();

// NOTE: authMiddleware only confirms the requester has a valid JWT, not that
// they're actually an admin — there's no role/permission field anywhere in
// the schema yet. Anyone with a valid token can currently hit these routes.
// Add a role check here once the User model has some notion of admin.
router.get('/reconciliation-logs', authMiddleware, getReconciliationLogs);
router.get('/transactions', authMiddleware, getAllTransactions);

export default router;
