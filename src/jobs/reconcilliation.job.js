// src/jobs/reconcilliation.job.js
//
// Fixed: the cron job imported `reconcile` but never called it — it only
// logged a message with a "fetch external txns here" comment. It also was
// never started from app.js, so nothing here ever ran.
//
// TODO: `fetchExternalPalmPayTransactions()` below is a placeholder — plug
// in a real call to PalmPay's transaction-query API (see docs.palmpay.com)
// before relying on this in production.
import cron from 'node-cron';
import { reconcile } from '../services/reconciliation.service.js';

async function fetchExternalPalmPayTransactions() {
  // Placeholder: replace with a real PalmPay API call that returns
  // recent transactions as [{ reference, amount }, ...]
  return [];
}

export function startReconciliationJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('Running reconciliation...');
    try {
      const externalTxns = await fetchExternalPalmPayTransactions();
      await reconcile(externalTxns);
    } catch (err) {
      console.error('Reconciliation job failed:', err);
    }
  });

  console.log('✅ Reconciliation cron scheduled (hourly)');
}
