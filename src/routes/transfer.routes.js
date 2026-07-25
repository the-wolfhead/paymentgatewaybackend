import express from 'express';
import { transfer } from '../controllers/transfer.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { transferSchema } from '../validators/transfer.validator.js';

const router = express.Router();
router.post('/', authMiddleware, validate(transferSchema), transfer);
export default router;
