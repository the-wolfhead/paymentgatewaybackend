// src/routes/wallet.routes.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getBalance, getTransactions } from '../controllers/wallet.controller.js';

const router = express.Router();

router.get('/balance', authMiddleware, getBalance);
router.get('/transactions', authMiddleware, getTransactions);

export default router;
