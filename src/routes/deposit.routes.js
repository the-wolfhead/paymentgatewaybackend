// src/routes/deposit.routes.js
import express from 'express';
import { initiateDeposit } from '../controllers/deposit.controller.js';
// Import auth middleware if you have it
// import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/deposit/initiate
router.post('/initiate', 
  // authMiddleware,        // Uncomment if you want authentication
  initiateDeposit
);

export default router;
