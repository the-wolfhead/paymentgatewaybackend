// src/controllers/webhook.controller.js
import { verifyPalmPaySignature } from '../utils/verifySignature.js';
import { prisma } from '../config/prisma.js';
import { creditWalletLedger, creditDoctorForAppointment } from '../services/walletService.js';
import { createAppointmentForSuccessfulPayment } from '../services/appointment.service.js';

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
      include: { User: true }
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

      // Only credit the wallet for genuine top-ups. An appointment payment
      // isn't a top-up — the money was spent on the appointment, so crediting
      // it into "wallet balance" too would double-count it.
      if (transaction.meta?.purpose === 'WALLET_TOPUP') {
        try {
          await creditWalletLedger({
            userId: transaction.userId,
            amount: parseFloat(amount),
            transactionId: transaction.id,
            description: `PalmPay Deposit #${transaction.reference}`,
          });
        } catch (ledgerError) {
          console.error(`[${requestId}] Ledger credit failed:`, ledgerError);
        }
      }

      // Pay the doctor their share of an appointment fee (minus platform
      // commission). Requires the doctor's linked login (userId) to have
      // been included in the metadata the app sent at deposit-initiate time
      // — see GET /doctors on the ZHS backend, which now includes it.
      const doctorUserId = transaction.meta?.doctor?.userId;
      if (transaction.meta?.purpose !== 'WALLET_TOPUP' && doctorUserId) {
        try {
          await creditDoctorForAppointment({
            doctorUserId,
            amount: parseFloat(amount),
            transactionId: transaction.id,
            description: `Appointment fee #${transaction.reference}`,
          });
        } catch (doctorCreditError) {
          console.error(`[${requestId}] Doctor credit failed:`, doctorCreditError);
        }
      } else if (transaction.meta?.purpose !== 'WALLET_TOPUP') {
        console.warn(
          `[${requestId}] Appointment payment succeeded but doctor has no linked userId in meta — doctor was not paid. reference=${transaction.reference}`
        );
      }

      // === Create appointment in ZHS after confirmed payment ===
      // The PalmPay webhook is the source of truth for payment success.
      // The shared service is also used by the return URL as a retry path.
      try {
        await createAppointmentForSuccessfulPayment(transaction);
        console.log(`[${requestId}] ✅ Appointment creation request completed`);
      } catch (appointmentError) {
        // Keep the transaction SUCCESS even if the appointment API is
        // temporarily unavailable. The return URL/status polling can retry
        // the appointment creation without charging the patient again.
        console.error(
          `[${requestId}] ❌ Appointment creation failed:`,
          appointmentError.message || appointmentError
        );
      }

    }

    // 4. Update transaction status
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        meta: {
          ...(transaction.meta || {}),
          webhookPayload: payload,
        },
      }
    });

    console.log(`[${requestId}] Webhook processed → ${newStatus}`);
    return res.status(200).send('OK');

  } catch (error) {
    console.error(`[${requestId}] Webhook Error:`, error);
    return res.status(200).send('OK'); // Always acknowledge
  }
};
