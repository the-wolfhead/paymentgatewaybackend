import express from 'express';
import { transfer } from '../controllers/transfer.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = express.Router();
router.post('/', authMiddleware, transfer);
export default router;
