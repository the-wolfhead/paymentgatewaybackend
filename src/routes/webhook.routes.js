// src/routes/webhook.routes.js
import express from 'express';
import { palmpayWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// PalmPay webhook endpoint
router.post('/palmpay', palmpayWebhook);

export default router;
