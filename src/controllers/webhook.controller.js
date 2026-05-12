// src/controllers/webhook.controller.js
import { verifyPalmPaySignature } from '../utils/verifySignature.js';
import { prisma } from '../config/prisma.js';
import { creditWalletLedger } from '../services/walletService.js';
import { notifyBackendZHS } from '../services/notificationService.js';

export const palmpayWebhook = async (req, res) => {
  const requestId = `WH_${Date.now()}`;

  try {
    console.log(`[${requestId}] PalmPay webhook received`);

    // 1. Verify Signature
    if (!verifyPalmPaySignature(req)) {
      console.warn(`[${requestId}] Invalid signature`);
      return res.status(401).send('Invalid signature');
    }

    const payload = req.body;
    const { orderNo, amount, status } = payload;

    if (!orderNo) {
      console.warn(`[${requestId}] Missing orderNo in payload`);
      return res.status(400).send('Invalid payload');
    }

    console.log(`[${requestId}] Processing order: ${orderNo}, Status: ${status}`);

    // 2. Find transaction
    const transaction = await prisma.transaction.findUnique({
      where: { reference: orderNo },
      include: { user: true }
    });

    if (!transaction) {
      console.warn(`[${requestId}] Transaction not found for: ${orderNo}`);
      return res.status(200).send('OK');
    }

    // 3. Prevent duplicate processing
    if (transaction.status === 'SUCCESS') {
      console.log(`[${requestId}] Already processed`);
      return res.status(200).send('OK');
    }

    let newStatus = 'FAILED';

    const upperStatus = status?.toString().toUpperCase();

    if (upperStatus === 'SUCCESS' || upperStatus === 'COMPLETED') {
      newStatus = 'SUCCESS';

      // Credit Wallet
      try {
        await creditWalletLedger({
          userId: transaction.userId,
          amount: parseFloat(amount),
          reference: transaction.reference,
          description: `PalmPay Deposit #${transaction.reference}`,
          gateway: 'PALMPAY',
          metadata: payload
        });
      } catch (ledgerError) {
        console.error(`[${requestId}] Ledger credit failed:`, ledgerError);
      }

      // === Notify backendzhs to create appointment ===
      if (transaction.metadata?.doctor || transaction.metadata?.doctorId) {
        try {
          await notifyBackendZHS({
            userId: transaction.userId,
            doctorId: transaction.metadata.doctor?.id || transaction.metadata.doctorId,
            patientName: transaction.metadata.patientName,
            date: transaction.metadata.date,
            time: transaction.metadata.time,
            fee: transaction.amount,
            paymentReference: transaction.reference,
            paymentGateway: 'PALMPAY',
            metadata: transaction.metadata
          });
        } catch (notifyError) {
          console.error(`[${requestId}] Failed to notify backendzhs:`, notifyError);
        }
      }
    }

    // 4. Update transaction status
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        gatewayResponse: payload,
        updatedAt: new Date()
      }
    });

    console.log(`[${requestId}] Webhook processed → ${newStatus}`);
    return res.status(200).send('OK');

  } catch (error) {
    console.error(`[${requestId}] Webhook Error:`, error);
    return res.status(200).send('OK'); // Always acknowledge
  }
};
