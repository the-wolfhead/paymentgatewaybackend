// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

// Fail fast with a clear message if required config is missing, instead of
// crashing later with a cryptic error deep inside a request handler.
import { assertEnv } from './config/env.js';

try {
  assertEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

import transferRoutes from './routes/transfer.routes.js';
import withdrawalRoutes from './routes/withdrawal.routes.js';
import escrowRoutes from './routes/escrow.routes.js';
import depositRoutes from './routes/deposit.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';

import { limiter } from './middleware/ratelimit.js';
import { errorHandler } from './middleware/error.middleware.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { createAppointmentForSuccessfulPayment } from './services/appointment.service.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Basic rate limiting on everything except the PalmPay webhook (which
// PalmPay itself calls on its own schedule, not the end user).
app.use('/api/transfer', limiter);
app.use('/api/withdraw', limiter);
app.use('/api/escrow', limiter);
app.use('/api/deposit', limiter);
app.use('/api/auth', limiter);

// Main Routes
app.use('/api/transfer', transferRoutes);
app.use('/api/withdraw', withdrawalRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Webhook Routes
app.use('/api/webhooks', webhookRoutes);

// PalmPay return URL.
// IMPORTANT: arriving here is not, by itself, proof of payment. The PalmPay
// webhook changes the transaction to SUCCESS. Once it is SUCCESS, this route
// retries the appointment API call if the webhook could not create it.
app.get('/api/payment/success', async (req, res) => {
  const { ref } = req.query;

  if (!ref) {
    return res.status(400).json({
      success: false,
      message: 'Missing payment reference',
    });
  }

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { reference: String(ref) },
      include: { User: true },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Payment transaction not found',
        reference: ref,
      });
    }

    let appointmentResult = null;

    if (transaction.status === 'SUCCESS') {
      try {
        appointmentResult = await createAppointmentForSuccessfulPayment(transaction);
      } catch (appointmentError) {
        console.error(
          `Appointment retry failed for ${ref}:`,
          appointmentError.message || appointmentError
        );
      }
    }

    const appointmentCreated =
      appointmentResult?.alreadyCreated ||
      appointmentResult?.appointment ||
      transaction.meta?.appointmentCreated === true;

    const safeMessage =
      transaction.status === 'SUCCESS' && appointmentCreated
        ? 'Payment successful. Your appointment has been created.'
        : transaction.status === 'SUCCESS'
          ? 'Payment successful. We are confirming your appointment.'
          : transaction.status === 'PENDING'
            ? 'Payment received. We are waiting for payment confirmation.'
            : 'Payment was not successful.';

    // Return a small page for PalmPay's browser/WebView, but do the actual
    // appointment POST above. The app should use /api/deposit/status/:reference
    // as the authoritative status endpoint.
    res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Payment status</title>
</head>
<body style="font-family:Arial,sans-serif;text-align:center;padding:40px">
  <h2>${safeMessage}</h2>
  <p>Reference: <strong>${String(ref).replace(/[<>&"']/g, '')}</strong></p>
  <p>You can return to the app.</p>
</body>
</html>`);
  } catch (error) {
    console.error('Payment success route error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process payment result',
      reference: ref,
    });
  }
});

// Health Check
app.get('/', (req, res) => {
  res.json({
    message: 'Payment Gateway Backend is running 🚀',
    status: 'OK',
  });
});

// 404 for anything unmatched
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Global error handler — this existed in the codebase but was never mounted,
// so thrown/rejected errors in route handlers fell through to Express's
// default HTML error page instead of a clean JSON response.
app.use(errorHandler);

// Background jobs are optional: only start them if Redis is actually
// configured, so a missing/misconfigured Redis doesn't take down the whole
// payment API (the original worker.job.js connected unconditionally).
if (process.env.REDIS_HOST) {
  const { startPaymentWorker } = await import('./jobs/worker.job.js');
  const { startReconciliationJob } = await import('./jobs/reconcilliation.job.js');
  startPaymentWorker();
  startReconciliationJob();
} else {
  console.log('ℹ️  REDIS_HOST not set — skipping background payment worker/reconciliation cron');
}

// Surface crashes instead of letting the process die silently/confusingly
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.stack : reason}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.stack}`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;
