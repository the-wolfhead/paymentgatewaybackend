// src/controllers/webhook.controller.js
import { verifyPalmPaySignature } from '../utils/verifySignature.js';
import { paymentQueue } from '../jobs/queue.js';
import { prisma } from '../config/prisma.js';

export const palmpayWebhook = async (req, res) => {
  try {
    // Verify signature
    if (!verifyPalmPaySignature(req)) {
      return res.status(401).send('Invalid signature');
    }

    const payload = req.body;

    // Add to queue for background processing (prevents timeout issues)
    await paymentQueue.add('process-palmpay-webhook', {
      payload,
      receivedAt: new Date().toISOString()
    });

    // Always return 200 quickly
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.sendStatus(200); // Important: Always acknowledge
  }
};
