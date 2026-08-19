// src/services/appointment.service.js
import { prisma } from '../config/prisma.js';
import { notifyBackendZHS } from './notificationService.js';

/**
 * Creates the appointment in the ZHS backend after a payment is confirmed.
 *
 * The payment reference is included in the request so the ZHS backend can
 * treat it as an idempotency key and prevent duplicate appointments when
 * PalmPay's webhook and the customer's return URL arrive close together.
 */
export const createAppointmentForSuccessfulPayment = async (transaction) => {
  const meta = transaction.meta && typeof transaction.meta === 'object'
    ? transaction.meta
    : {};

  if (meta.purpose === 'WALLET_TOPUP') {
    return { skipped: true, reason: 'WALLET_TOPUP' };
  }

  if (meta.appointmentCreated === true) {
    return {
      skipped: true,
      alreadyCreated: true,
      appointment: meta.appointmentResponse || null,
    };
  }

  const doctorId = meta.doctor?.id ?? meta.doctorId;
  const date = meta.date ?? meta.appointmentDate;
  const time = meta.time ?? meta.appointmentTime;
  const patientName = meta.patientName ?? transaction.User?.name;
  const fee = Number(transaction.amount);

  if (!doctorId || !date || !time) {
    throw new Error(
      `Appointment details are incomplete for payment ${transaction.reference}. ` +
      `Required: doctorId, date and time.`
    );
  }

  const result = await notifyBackendZHS({
    userId: transaction.userId,
    doctorId: Number(doctorId),
    patientName,
    date,
    time,
    fee,
    paymentReference: transaction.reference,
    paymentGateway: 'PALMPAY',
    metadata: meta,
  });

  if (!result?.success) {
    throw new Error(result?.error || 'Appointment API rejected the request');
  }

  // Save a durable success marker so later webhook/return-url requests do not
  // create the appointment again.
  const latest = await prisma.transaction.findUnique({
    where: { id: transaction.id },
  });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      meta: {
        ...((latest?.meta && typeof latest.meta === 'object') ? latest.meta : meta),
        appointmentCreated: true,
        appointmentCreatedAt: new Date().toISOString(),
        appointmentResponse: result.data || result,
      },
    },
  });

  return { skipped: false, alreadyCreated: false, appointment: result.data || result };
};
