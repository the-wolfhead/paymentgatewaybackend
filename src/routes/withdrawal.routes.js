import express from 'express';
import {
  withdraw,
  withdrawalStatus,
  listBanks,
  resolveAccount,
} from '../controllers/withdrawal.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', authMiddleware, withdraw);
router.get('/status/:reference', authMiddleware, withdrawalStatus);
router.get('/banks', authMiddleware, listBanks);
router.post('/resolve-account', authMiddleware, resolveAccount);

export default router;
