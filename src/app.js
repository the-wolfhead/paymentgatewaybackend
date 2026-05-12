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

// API Routes
app.use('/api/transfer', transferRoutes);
app.use('/api/withdraw', withdrawalRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/deposit', depositRoutes);        // Added
app.use('/api/webhooks', webhookRoutes);       // Added

// Health Check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Payment Gateway Backend is running 🚀',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
