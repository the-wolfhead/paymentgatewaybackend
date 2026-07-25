// src/jobs/worker.job.js
//
// Fixed several issues:
//  - Imported `createDoubleEntry`, which doesn't exist (doubleLedger.service.js
//    exports `createMultiEntry`) — this would have been `undefined` and
//    thrown the moment a job ran.
//  - Used `bullmq` + `ioredis`, neither of which was in package.json, while
//    src/jobs/queue.js already sets up a `bull` queue (a different library).
//    Standardized on `bull` (already a dependency) instead of adding two more.
//  - Queried `Account.name`, a field that doesn't exist (`accountNumber`).
//  - Called createMultiEntry with the old debitAccountId/creditAccountId shape.
//
// This job is optional: startPaymentWorker() only runs if REDIS_HOST is
// configured, so an unconfigured Redis doesn't take down the whole API.
import { prisma } from '../config/prisma.js';
import { createMultiEntry } from '../services/doubleLedger.service.js';
import { paymentQueue } from './queue.js';

export function startPaymentWorker() {
  paymentQueue.process(async (job) => {
    const { accountNumber, amount, reference, userId } = job.data;

    const walletAccount = await prisma.account.findFirst({
      where: { accountNumber },
    });

    const systemAccount = await prisma.account.findFirst({
      where: { type: 'SYSTEM' },
    });

    if (!walletAccount || !systemAccount) {
      console.warn(`[worker.job] Skipping job — account(s) not found for reference ${reference}`);
      return;
    }

    await createMultiEntry({
      reference,
      userId: userId || walletAccount.userId,
      type: 'PAYMENT',
      channel: 'WALLET',
      narration: 'PalmPay funding',
      entries: [
        { accountId: systemAccount.id, type: 'DEBIT', amount },
        { accountId: walletAccount.id, type: 'CREDIT', amount },
      ],
    });
  });

  console.log('✅ Payment worker started');
}
