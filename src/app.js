// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import transferRoutes from './routes/transfer.routes.js';
import withdrawalRoutes from "./routes/withdrawal.routes.js";
import escrowRoutes from "./routes/escrow.routes.js";
import depositRoutes from "./routes/deposit.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Main Routes
app.use('/api/transfer', transferRoutes);
app.use('/api/withdraw', withdrawalRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/deposit', depositRoutes);

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
    status: 'OK'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
