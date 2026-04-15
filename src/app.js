import express from 'express';
import transferRoutes from './routes/transfer.routes.js';
import withdrawalRoutes from "./routes/withdrawal.routes.js";
import escrowRoutes from "./routes/escrow.routes.js";



const app = express();
app.use(express.json());

app.use('/api/transfer', transferRoutes);
app.use("/api/withdraw", withdrawalRoutes);
app.use("/api/escrow", escrowRoutes);



app.listen(5000, () => console.log('Server running'));
