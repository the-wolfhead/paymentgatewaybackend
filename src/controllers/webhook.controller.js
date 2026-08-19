// src/controllers/webhook.controller.js
import { verifyPalmPaySignature } from '../utils/verifySignature.js';
import { prisma } from '../config/prisma.js';
import { creditWalletLedger, creditDoctorForAppointment } from '../services/walletService.js';
import { createAppointmentForSuccessfulPayment } from '../services/appointment.service.js';

/**
 * PalmPay payment-result notification.
 *
 * PalmPay sends the merchant order identifier as `orderId`, the PalmPay
 * platform order number as `orderNo`, and the result as numeric `orderStatus`.
 *
 * Order status (PalmPay data dictionary):
 *   0 = unpaid, 1 = paying, 2 = success, 3 = fail, 4 = close, 5 = required_capture
 * Only 2 is a successful final status for checkout / pay-in notifications.
 *
 * IMPORTANT: PalmPay requires the plain-text response `success` with HTTP 200.
 */
export const palmpayWebhook = async (req, res) => {
  const requestId = `WH_${Date.now()}`;

  try {
    const payload = req.body || {};
    const {
      orderId,
      orderNo,
      amount,
      currency,
      orderStatus,
      completeTime,
      payMethod,
    } = payload;

    console.log(`[${requestId}] PalmPay webhook received`, {
      orderId,
      orderNo,
      amount,
      currency,
      orderStatus,
      completeTime,
      payMethod,
    });

    // PalmPay puts `sign` in the request body, not in a Signature header.
    if (!verifyPalmPaySignature(payload)) {
      console.warn(`[${requestId}] Invalid PalmPay signature`);
      return res.status(401).send('Invalid signature');
    }

    // `orderId` is the merchant's unique order number. That is the value we
    // created from our transaction reference, so it is the correct lookup key.
    if (!orderId) {
      console.warn(`[${requestId}] Missing orderId in PalmPay payload`);
      return res.status(400).send('Invalid payload');
    }

    const transaction = await prisma.transaction.findUnique({
      where: { reference: String(orderId) },
      include: { User: true },
    });

    if (!transaction) {
      // A valid notification for an order we do not know should be retried by
      // PalmPay rather than silently acknowledged. This helps recover from an
      // eventual-consistency/deployment race.
      console.warn(`[${requestId}] Transaction not found for merchant orderId: ${orderId}`);
      return res.status(404).send('Transaction not found');
    }

    // PalmPay data dictionary: 2 = success (final). 1 = paying (in progress).
    // Also accept legacy/virtual-account payloads that use top-level `status === 1`.
    const statusNum = Number(orderStatus);
    const altStatus = payload.status != null ? Number(payload.status) : null;
    const successful = statusNum === 2 || (statusNum !== 3 && statusNum !== 4 && altStatus === 1);
    const newStatus = successful ? 'SUCCESS' : (statusNum === 0 || statusNum === 1 ? 'PENDING' : 'FAILED');

    console.log(
      `[${requestId}] Transaction ${transaction.reference}: orderStatus=${orderStatus} (alt status=${payload.status}) -> ${newStatus}`
    );

    // PalmPay may retry the same notification. Always acknowledge a valid
    // notification, but never repeat the business effects after success.
    if (transaction.status === 'SUCCESS') {
      console.log(`[${requestId}] Transaction already SUCCESS; acknowledging duplicate notification`);
      return res.status(200).send('success');
    }

    // Persist the payment result FIRST. This is important because appointment
    // creation also updates transaction.meta; updating the old transaction
    // object afterwards could otherwise overwrite appointmentCreated=true.
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        meta: {
          ...(transaction.meta || {}),
          webhookPayload: payload,
          palmpayOrderId: orderId,
          palmpayPlatformOrderNo: orderNo,
          palmpayOrderStatus: Number(orderStatus),
          paymentCompletedAt: completeTime ? new Date(Number(completeTime)).toISOString() : null,
          paymentMethod: payMethod || null,
        },
      },
    });

    if (successful) {
      // Use our transaction amount (Naira), not PalmPay's notification amount
      // (minor units/kobo), for internal wallet/doctor accounting.
      const transactionAmount = Number(transaction.amount);
      const meta = transaction.meta && typeof transaction.meta === 'object'
        ? transaction.meta
        : {};

      if (meta.purpose === 'WALLET_TOPUP') {
        try {
          await creditWalletLedger({
            userId: transaction.userId,
            amount: transactionAmount,
            transactionId: transaction.id,
            description: `PalmPay Deposit #${transaction.reference}`,
          });
        } catch (ledgerError) {
          console.error(`[${requestId}] Ledger credit failed:`, ledgerError);
        }
      }

      const doctorUserId = meta.doctor?.userId;
      if (meta.purpose !== 'WALLET_TOPUP' && doctorUserId) {
        try {
          await creditDoctorForAppointment({
            doctorUserId,
            amount: transactionAmount,
            transactionId: transaction.id,
            description: `Appointment fee #${transaction.reference}`,
          });
        } catch (doctorCreditError) {
          console.error(`[${requestId}] Doctor credit failed:`, doctorCreditError);
        }
      } else if (meta.purpose !== 'WALLET_TOPUP') {
        console.warn(
          `[${requestId}] Appointment payment succeeded but doctor has no linked userId in meta — doctor was not paid. reference=${transaction.reference}`
        );
      }

      try {
        // Re-fetch so appointmentCreated/other metadata written by another
        // request is visible before attempting appointment creation.
        const latestTransaction = await prisma.transaction.findUnique({
          where: { id: transaction.id },
          include: { User: true },
        });

        await createAppointmentForSuccessfulPayment(latestTransaction || transaction);
        console.log(`[${requestId}] Appointment creation request completed`);
      } catch (appointmentError) {
        // Keep payment SUCCESS. A later return/status retry can create the
        // appointment without charging the patient again.
        console.error(
          `[${requestId}] Appointment creation failed:`,
          appointmentError.message || appointmentError
        );
      }
    }

    console.log(`[${requestId}] PalmPay webhook processed -> ${newStatus}`);

    // PalmPay explicitly requires this exact plain-text acknowledgement.
    return res.status(200).send('success');
  } catch (error) {
    console.error(`[${requestId}] PalmPay webhook error:`, error);

    // Do NOT acknowledge unexpected processing errors as success. PalmPay will
    // retry according to its documented retry schedule, which gives us a
    // chance to process the notification successfully later.
    return res.status(500).send('Webhook processing failed');
  }
};
