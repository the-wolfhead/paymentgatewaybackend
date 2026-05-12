// src/app.js
import express from 'express';
import transferRoutes from './routes/transfer.routes.js';
import withdrawalRoutes from "./routes/withdrawal.routes.js";
import escrowRoutes from "./routes/escrow.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import depositRoutes from "./routes/deposit.routes.js";     // ← Add this

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware
app.use(require('helmet')());
app.use(require('morgan')('dev'));
app.use(require('cors')());

// Routes
app.use('/api/transfer', transferRoutes);
app.use("/api/withdraw", withdrawalRoutes);
app.use("/api/escrow", escrowRoutes);
app.use("/api/deposit", depositRoutes);           // ← New
app.use("/api/webhooks", webhookRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Payment Gateway Backend is running 🚀' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
