// src/routes/deposit.routes.js
import express from 'express';
import { initiateDeposit, getDepositStatus } from '../controllers/deposit.controller.js';
// Import auth middleware if you have it
// import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/deposit/initiate
router.post('/initiate', 
  // authMiddleware,        // Uncomment if you want authentication
  initiateDeposit
);

// GET /api/deposit/status/:reference — polled by the app after checkout
router.get('/status/:reference', getDepositStatus);

export default router;
