import express from 'express';
import { palmpayWebhook, palmpayPayoutWebhook } from '../controllers/webhook.controller.js';
import { requirePalmPayWebhookSignature } from '../utils/verifySignature.js';

const router = express.Router();

// Signature checked in middleware; controllers may still call verify as defense-in-depth
router.post('/palmpay', requirePalmPayWebhookSignature, palmpayWebhook);
router.post('/palmpay-payout', requirePalmPayWebhookSignature, palmpayPayoutWebhook);

export default router;
