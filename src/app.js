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

// Success Page Route (for PalmPay returnUrl)
app.get('/api/payment/success', (req, res) => {
  const { ref } = req.query;

  console.log(`Payment success page accessed with reference: ${ref}`);

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Successful</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #22C55E; }
        </style>
      </head>
      <body>
        <h1>✅ Payment Successful!</h1>
        <p>Reference: <strong>${ref || 'N/A'}</strong></p>
        <p>Your appointment has been confirmed.</p>
        <p>You can close this window.</p>
      </body>
    </html>
  `);
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
