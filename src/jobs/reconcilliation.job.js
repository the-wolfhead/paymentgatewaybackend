import cron from 'node-cron';
import { reconcile } from '../services/reconciliation.service.js';

cron.schedule('0 * * * *', async () => {
  console.log('Running reconciliation...');
  // fetch external txns here
});
